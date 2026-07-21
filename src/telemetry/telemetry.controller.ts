import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import { TelemetryPayloadPipe } from './pipes/telemetry-payload.pipe';
import { TelemetryService } from './telemetry.service';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  ingest(
    @Body(TelemetryPayloadPipe) readings: CreateTelemetryDto[],
  ): ReturnType<TelemetryService['ingest']> {
    return this.telemetryService.ingest(readings);
  }
}
