import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { MetricsDto } from '../dto/metrics.dto';
import { TelemetryPayloadPipe } from './telemetry-payload.pipe';

const validReading = {
  deviceId: 'device-1',
  siteId: 'site-1',
  ts: '2026-07-21T10:00:00.000Z',
  metrics: { temperature: 25, humidity: 60 },
};

describe('TelemetryPayloadPipe', () => {
  const pipe = new TelemetryPayloadPipe();
  const metadata = { type: 'body' as const };

  it('accepts and normalizes a single reading', async () => {
    const result = await pipe.transform(validReading, metadata);

    expect(result).toHaveLength(1);
    expect(result[0]?.metrics).toBeInstanceOf(MetricsDto);
  });

  it('accepts an array of readings', async () => {
    const result = await pipe.transform([validReading, validReading], metadata);

    expect(result).toHaveLength(2);
  });

  it('rejects an empty array', async () => {
    await expect(pipe.transform([], metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects invalid or unknown fields', async () => {
    await expect(
      pipe.transform({ ...validReading, unexpected: true }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
