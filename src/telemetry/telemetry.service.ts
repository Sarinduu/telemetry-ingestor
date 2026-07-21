import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AlertService } from '../alert/alert.service';
import { RedisService } from '../redis/redis.service';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { Telemetry, TelemetryDocument } from './schemas/telemetry.schema';

export interface TelemetryReading {
  _id: unknown;
  deviceId: string;
  siteId: string;
  ts: Date | string;
  metrics: {
    temperature: number;
    humidity: number;
  };
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface TelemetrySummary {
  count: number;
  avgTemperature: number | null;
  maxTemperature: number | null;
  avgHumidity: number | null;
  maxHumidity: number | null;
  uniqueDevices: number;
}

export interface LatestReadingResponse {
  source: 'redis' | 'mongodb';
  data: TelemetryReading;
}

const EMPTY_SUMMARY: TelemetrySummary = {
  count: 0,
  avgTemperature: null,
  maxTemperature: null,
  avgHumidity: null,
  maxHumidity: null,
  uniqueDevices: 0,
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

  async getLatest(deviceId: string): Promise<LatestReadingResponse> {
    const cachedReading = await this.getCachedLatest(deviceId);

    if (cachedReading) {
      return { source: 'redis', data: cachedReading };
    }

    const reading = await this.telemetryModel
      .findOne({ deviceId })
      .sort({ ts: -1 })
      .lean<TelemetryReading>()
      .exec();

    if (!reading) {
      throw new NotFoundException(
        `No telemetry found for device "${deviceId}"`,
      );
    }

    await this.cacheLatestReading(reading);
    return { source: 'mongodb', data: reading };
  }

  async getSummary(
    siteId: string,
    query: SummaryQueryDto,
  ): Promise<TelemetrySummary> {
    const from = new Date(query.from);
    const to = new Date(query.to);

    if (from > to) {
      throw new BadRequestException('"from" must be before or equal to "to"');
    }

    const [summary] = await this.telemetryModel
      .aggregate<TelemetrySummary>([
        { $match: { siteId, ts: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avgTemperature: { $avg: '$metrics.temperature' },
            maxTemperature: { $max: '$metrics.temperature' },
            avgHumidity: { $avg: '$metrics.humidity' },
            maxHumidity: { $max: '$metrics.humidity' },
            devices: { $addToSet: '$deviceId' },
          },
        },
        {
          $project: {
            _id: 0,
            count: 1,
            avgTemperature: 1,
            maxTemperature: 1,
            avgHumidity: 1,
            maxHumidity: 1,
            uniqueDevices: { $size: '$devices' },
          },
        },
      ])
      .exec();

    return summary ?? EMPTY_SUMMARY;
  }

  private async getCachedLatest(
    deviceId: string,
  ): Promise<TelemetryReading | null> {
    try {
      const cached = await this.redisService.client.get(`latest:${deviceId}`);

      if (!cached) {
        return null;
      }

      const parsed = JSON.parse(cached) as unknown;

      if (this.isReadingForDevice(parsed, deviceId)) {
        return parsed;
      }

      this.logger.warn(`Ignoring invalid cache entry for device "${deviceId}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not read the latest telemetry cache: ${message}`);
    }

    return null;
  }

  private isReadingForDevice(
    value: unknown,
    deviceId: string,
  ): value is TelemetryReading {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const reading = value as Record<string, unknown>;
    const metrics = reading.metrics;

    return (
      reading.deviceId === deviceId &&
      typeof reading.siteId === 'string' &&
      typeof reading.ts === 'string' &&
      '_id' in reading &&
      typeof metrics === 'object' &&
      metrics !== null &&
      typeof (metrics as Record<string, unknown>).temperature === 'number' &&
      typeof (metrics as Record<string, unknown>).humidity === 'number'
    );
  }

  private async cacheLatestReading(reading: TelemetryReading): Promise<void> {
    try {
      await this.redisService.client.set(
        `latest:${reading.deviceId}`,
        JSON.stringify(reading),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Could not repair the latest telemetry cache: ${message}`,
      );
    }
  }

  private async refreshLatestCache(deviceIds: string[]): Promise<void> {
    try {
      const latestReadings = await this.telemetryModel
        .aggregate<TelemetryReading>([
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
