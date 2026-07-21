import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertModule } from '../alert/alert.module';
import { TelemetryPayloadPipe } from './pipes/telemetry-payload.pipe';
import { Telemetry, TelemetrySchema } from './schemas/telemetry.schema';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Module({
  imports: [
    AlertModule,
    MongooseModule.forFeature([
      { name: Telemetry.name, schema: TelemetrySchema },
    ]),
  ],
  controllers: [TelemetryController],
  providers: [TelemetryService, TelemetryPayloadPipe],
})
export class TelemetryModule {}
