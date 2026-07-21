import { Controller, Get, Param } from '@nestjs/common';
import { DeviceParamsDto } from './dto/device-params.dto';
import { TelemetryService } from './telemetry.service';

@Controller('devices')
export class DevicesController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get(':deviceId/latest')
  latest(
    @Param() { deviceId }: DeviceParamsDto,
  ): ReturnType<TelemetryService['getLatest']> {
    return this.telemetryService.getLatest(deviceId);
  }
}
