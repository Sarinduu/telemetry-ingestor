import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { appConfig } from '../config/app.config';
import { AlertReason, AlertService } from './alert.service';

describe('AlertService', () => {
  let service: AlertService;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  const reading = {
    deviceId: 'device-1',
    siteId: 'site-1',
    ts: '2026-07-21T10:00:00.000Z',
    metrics: { temperature: 25, humidity: 60 },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertService,
        {
          provide: appConfig.KEY,
          useValue: { alertWebhookUrl: 'https://example.com/alerts' },
        },
      ],
    }).compile();

    service = module.get<AlertService>(AlertService);
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 204 } as Response);
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

  it('does not fail ingestion when the webhook rejects the alert', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(
      service.sendThresholdAlerts([
        { ...reading, metrics: { temperature: 51, humidity: 60 } },
      ]),
    ).resolves.toBeUndefined();
  });
});
