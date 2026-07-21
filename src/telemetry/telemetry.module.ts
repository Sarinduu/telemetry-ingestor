import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Telemetry, TelemetrySchema } from './schemas/telemetry.schema';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Telemetry.name, schema: TelemetrySchema },
    ]),
  ],
  controllers: [TelemetryController],
  providers: [TelemetryService],
})
export class TelemetryModule {}
