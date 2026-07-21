import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertModule } from '../alert/alert.module';
import { DevicesController } from './devices.controller';
import { TelemetryPayloadPipe } from './pipes/telemetry-payload.pipe';
import { Telemetry, TelemetrySchema } from './schemas/telemetry.schema';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { SitesController } from './sites.controller';

@Module({
  imports: [
    AlertModule,
    MongooseModule.forFeature([
      { name: Telemetry.name, schema: TelemetrySchema },
    ]),
  ],
  controllers: [TelemetryController, DevicesController, SitesController],
  providers: [TelemetryService, TelemetryPayloadPipe],
})
export class TelemetryModule {}
