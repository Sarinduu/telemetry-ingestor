import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AlertService } from '../alert/alert.service';
import { RedisService } from '../redis/redis.service';
import { Telemetry } from './schemas/telemetry.schema';
import { TelemetryService } from './telemetry.service';

describe('TelemetryService', () => {
  let service: TelemetryService;
  const pipeline = {
    set: jest.fn(),
    exec: jest.fn(),
  };
  const telemetryModel = {
    insertMany: jest.fn(),
    aggregate: jest.fn(),
    findOne: jest.fn(),
  };
  const redisClient = {
    pipeline: () => pipeline,
    get: jest.fn(),
    set: jest.fn(),
  };
  const alertService = {
    sendThresholdAlerts: jest.fn(),
  };

  const reading = {
    deviceId: 'device-1',
    siteId: 'site-1',
    ts: '2026-07-21T10:00:00.000Z',
    metrics: { temperature: 25, humidity: 60 },
  };

  beforeEach(async () => {
    pipeline.set.mockReturnValue(pipeline);
    pipeline.exec.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryService,
        { provide: getModelToken(Telemetry.name), useValue: telemetryModel },
        {
          provide: RedisService,
          useValue: { client: redisClient },
        },
        { provide: AlertService, useValue: alertService },
      ],
    }).compile();

    service = module.get<TelemetryService>(TelemetryService);
    jest.clearAllMocks();
    pipeline.set.mockReturnValue(pipeline);
    pipeline.exec.mockResolvedValue([]);
    alertService.sendThresholdAlerts.mockResolvedValue(undefined);
    redisClient.get.mockResolvedValue(null);
    redisClient.set.mockResolvedValue('OK');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('persists readings and caches the latest reading per device', async () => {
    const inserted = [{ ...reading, ts: new Date(reading.ts) }];
    const latest = [{ ...inserted[0], _id: 'reading-id' }];
    telemetryModel.insertMany.mockResolvedValue(inserted);
    telemetryModel.aggregate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(latest),
    });

    await expect(service.ingest([reading])).resolves.toBe(inserted);

    expect(telemetryModel.insertMany).toHaveBeenCalledWith(
      [{ ...reading, ts: new Date(reading.ts) }],
      { ordered: true },
    );
    expect(pipeline.set).toHaveBeenCalledWith(
      'latest:device-1',
      JSON.stringify(latest[0]),
    );
    expect(pipeline.exec).toHaveBeenCalledTimes(1);
    expect(alertService.sendThresholdAlerts).toHaveBeenCalledWith([reading]);
  });

  it('deduplicates device IDs before finding latest readings', async () => {
    const secondReading = {
      ...reading,
      ts: '2026-07-21T11:00:00.000Z',
    };
    telemetryModel.insertMany.mockResolvedValue([]);
    telemetryModel.aggregate.mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
    });

    await service.ingest([reading, secondReading]);

    expect(telemetryModel.aggregate).toHaveBeenCalledWith([
      { $match: { deviceId: { $in: ['device-1'] } } },
      { $sort: { deviceId: 1, ts: -1 } },
      { $group: { _id: '$deviceId', reading: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$reading' } },
    ]);
  });

  it('does not fail persisted ingestion when Redis is unavailable', async () => {
    const inserted = [{ ...reading, ts: new Date(reading.ts) }];
    telemetryModel.insertMany.mockResolvedValue(inserted);
    telemetryModel.aggregate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(inserted),
    });
    pipeline.exec.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.ingest([reading])).resolves.toBe(inserted);
  });

  describe('getLatest', () => {
    it('returns a valid Redis cache hit without querying MongoDB', async () => {
      const cached = { ...reading, _id: 'reading-id' };
      redisClient.get.mockResolvedValue(JSON.stringify(cached));

      await expect(service.getLatest('device-1')).resolves.toEqual({
        source: 'redis',
        data: cached,
      });

      expect(redisClient.get).toHaveBeenCalledWith('latest:device-1');
      expect(telemetryModel.findOne).not.toHaveBeenCalled();
    });

    it('falls back to MongoDB and repairs the cache on a miss', async () => {
      const stored = {
        ...reading,
        ts: new Date(reading.ts),
        _id: 'reading-id',
      };
      const exec = jest.fn().mockResolvedValue(stored);
      const lean = jest.fn().mockReturnValue({ exec });
      const sort = jest.fn().mockReturnValue({ lean });
      telemetryModel.findOne.mockReturnValue({ sort });

      await expect(service.getLatest('device-1')).resolves.toEqual({
        source: 'mongodb',
        data: stored,
      });

      expect(telemetryModel.findOne).toHaveBeenCalledWith({
        deviceId: 'device-1',
      });
      expect(sort).toHaveBeenCalledWith({ ts: -1 });
      expect(redisClient.set).toHaveBeenCalledWith(
        'latest:device-1',
        JSON.stringify(stored),
      );
    });

    it('ignores an incomplete cache entry and falls back to MongoDB', async () => {
      const stored = {
        ...reading,
        ts: new Date(reading.ts),
        _id: 'reading-id',
      };
      redisClient.get.mockResolvedValue(
        JSON.stringify({ deviceId: 'device-1' }),
      );
      telemetryModel.findOne.mockReturnValue({
        sort: () => ({
          lean: () => ({ exec: jest.fn().mockResolvedValue(stored) }),
        }),
      });

      await expect(service.getLatest('device-1')).resolves.toEqual({
        source: 'mongodb',
        data: stored,
      });
      expect(telemetryModel.findOne).toHaveBeenCalledWith({
        deviceId: 'device-1',
      });
    });

    it('returns 404 when the device has no telemetry', async () => {
      const exec = jest.fn().mockResolvedValue(null);
      telemetryModel.findOne.mockReturnValue({
        sort: () => ({ lean: () => ({ exec }) }),
      });

      await expect(service.getLatest('unknown')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getSummary', () => {
    const query = {
      from: '2026-07-21T10:00:00.000Z',
      to: '2026-07-21T11:00:00.000Z',
    };

    it('returns the MongoDB site aggregation', async () => {
      const summary = {
        count: 2,
        avgTemperature: 30,
        maxTemperature: 35,
        avgHumidity: 65,
        maxHumidity: 70,
        uniqueDevices: 2,
      };
      telemetryModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([summary]),
      });

      await expect(service.getSummary('site-1', query)).resolves.toBe(summary);

      expect(telemetryModel.aggregate).toHaveBeenCalledWith([
        {
          $match: {
            siteId: 'site-1',
            ts: {
              $gte: new Date(query.from),
              $lte: new Date(query.to),
            },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avgTemperature: { $avg: '$metrics.temperature' },
            maxTemperature: { $max: '$metrics.temperature' },
            avgHumidity: { $avg: '$metrics.humidity' },
            maxHumidity: { $max: '$metrics.humidity' },
            devices: { $addToSet: '$deviceId' },
          },
        },
        {
          $project: {
            _id: 0,
            count: 1,
            avgTemperature: 1,
            maxTemperature: 1,
            avgHumidity: 1,
            maxHumidity: 1,
            uniqueDevices: { $size: '$devices' },
          },
        },
      ]);
    });

    it('returns an empty summary when the range has no readings', async () => {
      telemetryModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      await expect(service.getSummary('site-1', query)).resolves.toEqual({
        count: 0,
        avgTemperature: null,
        maxTemperature: null,
        avgHumidity: null,
        maxHumidity: null,
        uniqueDevices: 0,
      });
    });

    it('rejects an inverted date range', async () => {
      await expect(
        service.getSummary('site-1', {
          from: '2026-07-21T11:00:00.000Z',
          to: '2026-07-21T10:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(telemetryModel.aggregate).not.toHaveBeenCalled();
    });
  });
});
