import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService, HealthStatus } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(): Promise<HealthStatus> {
    const health = await this.healthService.check();

    if (health.status === 'error') {
      throw new ServiceUnavailableException(health);
    }

    return health;
  }
}
