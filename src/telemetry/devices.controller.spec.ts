import { Test, TestingModule } from '@nestjs/testing';
import { DevicesController } from './devices.controller';
import { TelemetryService } from './telemetry.service';

describe('DevicesController', () => {
  let controller: DevicesController;
  const telemetryService = { getLatest: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DevicesController],
      providers: [{ provide: TelemetryService, useValue: telemetryService }],
    }).compile();

    controller = module.get<DevicesController>(DevicesController);
    jest.clearAllMocks();
  });

  it('returns the latest device reading', async () => {
    const latest = {
      source: 'redis',
      data: { deviceId: 'device-1' },
    };
    telemetryService.getLatest.mockResolvedValue(latest);

    await expect(controller.latest({ deviceId: 'device-1' })).resolves.toBe(
      latest,
    );
    expect(telemetryService.getLatest).toHaveBeenCalledWith('device-1');
  });
});
