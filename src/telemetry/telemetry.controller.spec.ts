import { Test, TestingModule } from '@nestjs/testing';
import { IngestTokenGuard } from './guards/ingest-token.guard';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

describe('TelemetryController', () => {
  let controller: TelemetryController;
  const telemetryService = {
    ingest: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelemetryController],
      providers: [{ provide: TelemetryService, useValue: telemetryService }],
    })
      .overrideGuard(IngestTokenGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TelemetryController>(TelemetryController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates validated readings to the service', async () => {
    const readings = [
      {
        deviceId: 'device-1',
        siteId: 'site-1',
        ts: '2026-07-21T10:00:00.000Z',
        metrics: { temperature: 25, humidity: 60 },
      },
    ];
    telemetryService.ingest.mockResolvedValue(readings);

    await expect(controller.ingest(readings)).resolves.toBe(readings);
    expect(telemetryService.ingest).toHaveBeenCalledWith(readings);
  });
});
