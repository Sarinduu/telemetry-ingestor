import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
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
          useValue: { client: { pipeline: () => pipeline } },
        },
      ],
    }).compile();

    service = module.get<TelemetryService>(TelemetryService);
    jest.clearAllMocks();
    pipeline.set.mockReturnValue(pipeline);
    pipeline.exec.mockResolvedValue([]);
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
});
