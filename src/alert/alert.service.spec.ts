import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { appConfig } from '../config/app.config';
import { RedisService } from '../redis/redis.service';
import { AlertReason, AlertService } from './alert.service';

describe('AlertService', () => {
  let service: AlertService;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  const redisSet = jest.fn();
  const redisDel = jest.fn();

  const reading = {
    deviceId: 'device-1',
    siteId: 'site-1',
    ts: '2026-07-21T10:00:00.000Z',
    metrics: { temperature: 25, humidity: 60 },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertService,
        {
          provide: appConfig.KEY,
          useValue: { alertWebhookUrl: 'https://example.com/alerts' },
        },
        {
          provide: RedisService,
          useValue: { client: { set: redisSet, del: redisDel } },
        },
      ],
    }).compile();

    service = module.get<AlertService>(AlertService);
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 204 } as Response);
    redisSet.mockResolvedValue('OK');
    redisDel.mockResolvedValue(1);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('does not send an alert at or below the thresholds', async () => {
    await service.sendThresholdAlerts([
      { ...reading, metrics: { temperature: 50, humidity: 90 } },
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a high-temperature alert', async () => {
    await service.sendThresholdAlerts([
      { ...reading, metrics: { temperature: 51, humidity: 60 } },
    ]);

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
    expect(redisSet).toHaveBeenCalledWith(
      'alert:dedup:device-1:HIGH_TEMPERATURE',
      '1',
      'EX',
      60,
      'NX',
    );
  });

  it('sends both alerts when both thresholds are exceeded', async () => {
    await service.sendThresholdAlerts([
      { ...reading, metrics: { temperature: 51, humidity: 91 } },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([, init]) => init?.body)).toEqual([
      expect.stringContaining(AlertReason.HighTemperature),
      expect.stringContaining(AlertReason.HighHumidity),
    ]);
  });

  it('suppresses the same device alert for 60 seconds', async () => {
    redisSet.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    const highTemperatureReading = {
      ...reading,
      metrics: { temperature: 51, humidity: 60 },
    };

    await service.sendThresholdAlerts([highTemperatureReading]);
    await service.sendThresholdAlerts([highTemperatureReading]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails open when Redis cannot reserve an alert', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    redisSet.mockRejectedValue(new Error('Redis unavailable'));

    await service.sendThresholdAlerts([
      { ...reading, metrics: { temperature: 51, humidity: 60 } },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not fail ingestion when the webhook rejects the alert', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(
      service.sendThresholdAlerts([
        { ...reading, metrics: { temperature: 51, humidity: 60 } },
      ]),
    ).resolves.toBeUndefined();
    expect(redisDel).toHaveBeenCalledWith(
      'alert:dedup:device-1:HIGH_TEMPERATURE',
    );
  });
});
