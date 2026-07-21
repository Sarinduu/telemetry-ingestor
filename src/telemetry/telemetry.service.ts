import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AlertService } from '../alert/alert.service';
import { RedisService } from '../redis/redis.service';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import { Telemetry, TelemetryDocument } from './schemas/telemetry.schema';

type StoredTelemetry = Telemetry & {
  _id: unknown;
  createdAt?: Date;
  updatedAt?: Date;
};

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    @InjectModel(Telemetry.name)
    private readonly telemetryModel: Model<Telemetry>,
    private readonly redisService: RedisService,
    private readonly alertService: AlertService,
  ) {}

  async ingest(readings: CreateTelemetryDto[]): Promise<TelemetryDocument[]> {
    const documents = await this.telemetryModel.insertMany(
      readings.map((reading) => ({
        ...reading,
        ts: new Date(reading.ts),
      })),
      { ordered: true },
    );

    await this.refreshLatestCache(
      Array.from(new Set(readings.map(({ deviceId }) => deviceId))),
    );
    await this.alertService.sendThresholdAlerts(readings);

    return documents;
  }

  private async refreshLatestCache(deviceIds: string[]): Promise<void> {
    try {
      const latestReadings = await this.telemetryModel
        .aggregate<StoredTelemetry>([
          { $match: { deviceId: { $in: deviceIds } } },
          { $sort: { deviceId: 1, ts: -1 } },
          { $group: { _id: '$deviceId', reading: { $first: '$$ROOT' } } },
          { $replaceRoot: { newRoot: '$reading' } },
        ])
        .exec();

      const pipeline = this.redisService.client.pipeline();

      for (const reading of latestReadings) {
        pipeline.set(`latest:${reading.deviceId}`, JSON.stringify(reading));
      }

      const results = await pipeline.exec();
      const commandError = results?.find(([error]) => error !== null)?.[0];

      if (commandError) {
        throw commandError;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Could not update the latest telemetry cache: ${message}`,
      );
    }
  }
}
