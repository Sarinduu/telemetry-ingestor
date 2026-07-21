import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { appConfig } from '../config/app.config';

const WEBHOOK_TIMEOUT_MS = 5_000;

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
  ) {}

  async sendThresholdAlerts(
    readings: readonly AlertableReading[],
  ): Promise<void> {
    const alerts = readings.flatMap((reading) => this.getAlerts(reading));
    const results = await Promise.allSettled(
      alerts.map((alert) => this.postAlert(alert)),
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
