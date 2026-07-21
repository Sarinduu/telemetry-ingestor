import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { appConfig } from '../config/app.config';
import { RedisService } from '../redis/redis.service';

const WEBHOOK_TIMEOUT_MS = 5_000;
const ALERT_DEDUPLICATION_SECONDS = 60;
const RELEASE_ALERT_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end

return 0
`;

interface AlertReservation {
  key: string;
  token: string;
  owned: boolean;
}

export enum AlertReason {
  HighTemperature = 'HIGH_TEMPERATURE',
  HighHumidity = 'HIGH_HUMIDITY',
}

export interface AlertableReading {
  deviceId: string;
  siteId: string;
  ts: string;
  metrics: {
    temperature: number;
    humidity: number;
  };
}

export interface AlertPayload {
  deviceId: string;
  siteId: string;
  ts: string;
  reason: AlertReason;
  value: number;
}

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    private readonly redisService: RedisService,
  ) {}

  async sendThresholdAlerts(
    readings: readonly AlertableReading[],
  ): Promise<void> {
    const alerts = readings.flatMap((reading) => this.getAlerts(reading));
    const results = await Promise.allSettled(
      alerts.map((alert) => this.sendIfNotDuplicate(alert)),
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const alert = alerts[index];
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);

        this.logger.warn(
          `Failed to send ${alert?.reason ?? 'telemetry'} alert: ${message}`,
        );
      }
    });
  }

  private getAlerts(reading: AlertableReading): AlertPayload[] {
    const alerts: AlertPayload[] = [];

    if (reading.metrics.temperature > 50) {
      alerts.push({
        deviceId: reading.deviceId,
        siteId: reading.siteId,
        ts: reading.ts,
        reason: AlertReason.HighTemperature,
        value: reading.metrics.temperature,
      });
    }

    if (reading.metrics.humidity > 90) {
      alerts.push({
        deviceId: reading.deviceId,
        siteId: reading.siteId,
        ts: reading.ts,
        reason: AlertReason.HighHumidity,
        value: reading.metrics.humidity,
      });
    }

    return alerts;
  }

  private async sendIfNotDuplicate(alert: AlertPayload): Promise<void> {
    const deduplicationKey = this.getDeduplicationKey(alert);
    const reservation = await this.reserveAlert(deduplicationKey);

    if (!reservation) {
      return;
    }

    try {
      await this.postAlert(alert);
    } catch (error) {
      if (reservation.owned) {
        await this.releaseAlert(reservation);
      }
      throw error;
    }
  }

  private getDeduplicationKey(alert: AlertPayload): string {
    return `alert:dedup:${alert.deviceId}:${alert.reason}`;
  }

  private async reserveAlert(key: string): Promise<AlertReservation | null> {
    const token = randomUUID();

    try {
      const result = await this.redisService.client.set(
        key,
        token,
        'EX',
        ALERT_DEDUPLICATION_SECONDS,
        'NX',
      );
      return result === 'OK' ? { key, token, owned: true } : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Could not check alert deduplication; sending alert: ${message}`,
      );
      return { key, token, owned: false };
    }
  }

  private async releaseAlert(reservation: AlertReservation): Promise<void> {
    try {
      await this.redisService.client.eval(
        RELEASE_ALERT_SCRIPT,
        1,
        reservation.key,
        reservation.token,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not release alert deduplication key: ${message}`);
    }
  }

  private async postAlert(alert: AlertPayload): Promise<void> {
    const response = await fetch(this.config.alertWebhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(alert),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Webhook responded with HTTP ${response.status}`);
    }
  }
}
