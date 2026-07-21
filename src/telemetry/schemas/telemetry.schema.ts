import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class TelemetryMetrics {
  @Prop({ type: Number, required: true })
  temperature!: number;

  @Prop({ type: Number, required: true })
  humidity!: number;
}

const TelemetryMetricsSchema = SchemaFactory.createForClass(TelemetryMetrics);

@Schema({
  collection: 'telemetry',
  timestamps: true,
  versionKey: false,
})
export class Telemetry {
  @Prop({ type: String, required: true, trim: true, maxlength: 128 })
  deviceId!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 128 })
  siteId!: string;

  @Prop({ type: Date, required: true })
  ts!: Date;

  @Prop({ type: TelemetryMetricsSchema, required: true })
  metrics!: TelemetryMetrics;
}

export type TelemetryDocument = HydratedDocument<Telemetry>;

export const TelemetrySchema = SchemaFactory.createForClass(Telemetry);

TelemetrySchema.index({ deviceId: 1, ts: -1 });
TelemetrySchema.index({ siteId: 1, ts: 1 });
