import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AlertReason, AlertService } from '../src/alert/alert.service';
import { appConfig } from '../src/config/app.config';
import { RedisService } from '../src/redis/redis.service';
import { DevicesController } from '../src/telemetry/devices.controller';
import { IngestTokenGuard } from '../src/telemetry/guards/ingest-token.guard';
import { TelemetryPayloadPipe } from '../src/telemetry/pipes/telemetry-payload.pipe';
import { Telemetry } from '../src/telemetry/schemas/telemetry.schema';
import { SitesController } from '../src/telemetry/sites.controller';
import { TelemetryController } from '../src/telemetry/telemetry.controller';
import { TelemetryService } from '../src/telemetry/telemetry.service';

interface StoredReading {
  _id: string;
  deviceId: string;
  siteId: string;
  ts: Date;
  metrics: { temperature: number; humidity: number };
  createdAt: Date;
  updatedAt: Date;
}

interface ReadingInput {
  deviceId: string;
  siteId: string;
  ts: Date;
  metrics: { temperature: number; humidity: number };
}

interface AggregationStage {
  $match?: {
    deviceId?: { $in: string[] };
    siteId?: string;
    ts?: { $gte: Date; $lte: Date };
  };
}

describe('Telemetry API (e2e)', () => {
  let app: INestApplication<App>;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let sequence = 0;
  const readings: StoredReading[] = [];
  const cache = new Map<string, string>();

  const redisClient = {
    get: jest.fn((key: string) => cache.get(key) ?? null),
    set: jest.fn((key: string, value: string) => {
      cache.set(key, value);
      return 'OK';
    }),
    pipeline: () => {
      const commands: Array<[string, string]> = [];
      const pipeline = {
        set: (key: string, value: string) => {
          commands.push([key, value]);
          return pipeline;
        },
        exec: () => {
          commands.forEach(([key, value]) => cache.set(key, value));
          return commands.map((): [null, string] => [null, 'OK']);
        },
      };

      return pipeline;
    },
  };

  const telemetryModel = {
    insertMany: jest.fn((inputs: ReadingInput[]) => {
      const now = new Date();
      const inserted = inputs.map((input) => ({
        ...input,
        _id: `reading-${++sequence}`,
        createdAt: now,
        updatedAt: now,
      }));
      readings.push(...inserted);
      return inserted;
    }),
    findOne: jest.fn(({ deviceId }: { deviceId: string }) => ({
      sort: () => ({
        lean: () => ({
          exec: () =>
            readings
              .filter((reading) => reading.deviceId === deviceId)
              .sort(
                (left, right) => right.ts.getTime() - left.ts.getTime(),
              )[0] ?? null,
        }),
      }),
    })),
    aggregate: jest.fn((pipeline: AggregationStage[]) => ({
      exec: () => {
        const match = pipeline[0]?.$match;

        if (match?.deviceId) {
          return match.deviceId.$in.flatMap((deviceId) => {
            const latest = readings
              .filter((reading) => reading.deviceId === deviceId)
              .sort((left, right) => right.ts.getTime() - left.ts.getTime())[0];
            return latest ? [latest] : [];
          });
        }

        if (match?.siteId && match.ts) {
          const selected = readings.filter(
            (reading) =>
              reading.siteId === match.siteId &&
              reading.ts >= match.ts!.$gte &&
              reading.ts <= match.ts!.$lte,
          );

          if (selected.length === 0) {
            return [];
          }

          const temperatures = selected.map(
            ({ metrics }) => metrics.temperature,
          );
          const humidities = selected.map(({ metrics }) => metrics.humidity);

          return [
            {
              count: selected.length,
              avgTemperature:
                temperatures.reduce((sum, value) => sum + value, 0) /
                selected.length,
              maxTemperature: Math.max(...temperatures),
              avgHumidity:
                humidities.reduce((sum, value) => sum + value, 0) /
                selected.length,
              maxHumidity: Math.max(...humidities),
              uniqueDevices: new Set(selected.map(({ deviceId }) => deviceId))
                .size,
            },
          ];
        }

        return [];
      },
    })),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TelemetryController, DevicesController, SitesController],
      providers: [
        TelemetryService,
        AlertService,
        IngestTokenGuard,
        TelemetryPayloadPipe,
        { provide: getModelToken(Telemetry.name), useValue: telemetryModel },
        { provide: RedisService, useValue: { client: redisClient } },
        {
          provide: appConfig.KEY,
          useValue: {
            ingestToken: 'test-ingest-token',
            alertWebhookUrl: 'https://example.com/alerts',
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(() => {
    readings.length = 0;
    cache.clear();
    sequence = 0;
    jest.clearAllMocks();
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 204 } as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects ingest without the bearer token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/telemetry')
      .send(createReading())
      .expect(401);
  });

  it('ingests a single reading and updates the latest cache', async () => {
    await ingest(createReading()).expect(201);

    expect(readings).toHaveLength(1);
    expect(cache.has('latest:device-1')).toBe(true);

    const response = await request(app.getHttpServer())
      .get('/api/v1/devices/device-1/latest')
      .expect(200);

    expect(response.body).toMatchObject({
      source: 'redis',
      data: { deviceId: 'device-1', siteId: 'site-1' },
    });
  });

  it('sends an alert webhook when a threshold is exceeded', async () => {
    await ingest(
      createReading({ metrics: { temperature: 51, humidity: 60 } }),
    ).expect(201);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/alerts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          deviceId: 'device-1',
          siteId: 'site-1',
          ts: '2026-07-21T10:00:00.000Z',
          reason: AlertReason.HighTemperature,
          value: 51,
        }),
      }),
    );
  });

  it('falls back to MongoDB and repairs Redis after a cache miss', async () => {
    await ingest(createReading()).expect(201);
    cache.clear();

    const response = await request(app.getHttpServer())
      .get('/api/v1/devices/device-1/latest')
      .expect(200);

    expect(response.body).toMatchObject({
      source: 'mongodb',
      data: { deviceId: 'device-1' },
    });
    expect(cache.has('latest:device-1')).toBe(true);
  });

  it('aggregates a site summary over the requested range', async () => {
    await ingest([
      createReading({
        deviceId: 'device-1',
        metrics: { temperature: 20, humidity: 60 },
      }),
      createReading({
        deviceId: 'device-2',
        ts: '2026-07-21T11:00:00.000Z',
        metrics: { temperature: 40, humidity: 80 },
      }),
      createReading({
        deviceId: 'device-3',
        siteId: 'site-2',
        metrics: { temperature: 10, humidity: 50 },
      }),
    ]).expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/v1/sites/site-1/summary')
      .query({
        from: '2026-07-21T09:00:00.000Z',
        to: '2026-07-21T12:00:00.000Z',
      })
      .expect(200);

    expect(response.body).toEqual({
      count: 2,
      avgTemperature: 30,
      maxTemperature: 40,
      avgHumidity: 70,
      maxHumidity: 80,
      uniqueDevices: 2,
    });
  });

  function ingest(payload: object | object[]) {
    return request(app.getHttpServer())
      .post('/api/v1/telemetry')
      .set('Authorization', 'Bearer test-ingest-token')
      .send(payload);
  }

  function createReading(overrides: Record<string, unknown> = {}) {
    return {
      deviceId: 'device-1',
      siteId: 'site-1',
      ts: '2026-07-21T10:00:00.000Z',
      metrics: { temperature: 25, humidity: 60 },
      ...overrides,
    };
  }
});
