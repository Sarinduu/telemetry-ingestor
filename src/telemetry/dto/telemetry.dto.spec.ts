import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTelemetryDto } from './create-telemetry.dto';
import { MetricsDto } from './metrics.dto';
import { SummaryQueryDto } from './summary-query.dto';

const validReading = {
  deviceId: 'device-1',
  siteId: 'site-1',
  ts: '2026-07-21T10:00:00.000Z',
  metrics: { temperature: 25, humidity: 60 },
};

describe('Telemetry DTO validation', () => {
  it('accepts a valid reading and transforms nested metrics', async () => {
    const dto = plainToInstance(CreateTelemetryDto, validReading);

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.metrics).toBeInstanceOf(MetricsDto);
  });

  it.each([
    [{ ...validReading, deviceId: '' }, 'deviceId'],
    [{ ...validReading, siteId: '' }, 'siteId'],
    [{ ...validReading, ts: 'not-a-timestamp' }, 'ts'],
    [
      { ...validReading, metrics: { temperature: 'hot', humidity: 60 } },
      'metrics',
    ],
    [
      { ...validReading, metrics: { temperature: 25, humidity: NaN } },
      'metrics',
    ],
  ])('rejects an invalid %s payload', async (payload, property) => {
    const dto = plainToInstance(CreateTelemetryDto, payload);
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === property)).toBe(true);
  });

  it('rejects unknown telemetry properties under the application policy', async () => {
    const dto = plainToInstance(CreateTelemetryDto, {
      ...validReading,
      unexpected: true,
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([
      expect.objectContaining({ property: 'unexpected' }),
    ]);
  });

  it('accepts an ISO summary range', async () => {
    const dto = plainToInstance(SummaryQueryDto, {
      from: '2026-07-21T10:00:00.000Z',
      to: '2026-07-21T11:00:00.000Z',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    { from: 'invalid', to: '2026-07-21T11:00:00.000Z' },
    { from: '2026-07-21T10:00:00.000Z', to: 'invalid' },
  ])('rejects an invalid summary timestamp', async (query) => {
    const dto = plainToInstance(SummaryQueryDto, query);

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
