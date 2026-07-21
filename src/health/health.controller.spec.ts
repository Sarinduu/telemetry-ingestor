import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  const healthService = { check: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    jest.clearAllMocks();
  });

  it('returns a healthy result', async () => {
    const health = {
      status: 'ok',
      checks: { mongodb: 'up', redis: 'up' },
    };
    healthService.check.mockResolvedValue(health);

    await expect(controller.check()).resolves.toBe(health);
  });

  it('returns service unavailable for an unhealthy dependency', async () => {
    healthService.check.mockResolvedValue({
      status: 'error',
      checks: { mongodb: 'up', redis: 'down' },
    });

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
