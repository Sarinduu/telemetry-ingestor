import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export const INGEST_RATE_LIMIT = 60;
export const INGEST_RATE_WINDOW_SECONDS = 60;

const RESERVE_RATE_LIMIT_SCRIPT = `
for index, key in ipairs(KEYS) do
  local current = tonumber(redis.call('GET', key) or '0')
  local requested = tonumber(ARGV[index + 2])
  local limit = tonumber(ARGV[2])

  if current + requested > limit then
    return 0
  end
end

for index, key in ipairs(KEYS) do
  local requested = tonumber(ARGV[index + 2])
  local current = redis.call('INCRBY', key, requested)

  if current == requested then
    redis.call('EXPIRE', key, tonumber(ARGV[1]))
  end
end

return 1
`;

interface DeviceReading {
  deviceId: string;
}

@Injectable()
export class IngestRateLimitService {
  private readonly logger = new Logger(IngestRateLimitService.name);

  constructor(private readonly redisService: RedisService) {}

  async assertWithinLimit(readings: readonly DeviceReading[]): Promise<void> {
    const counts = this.countByDevice(readings);
    const window = Math.floor(
      Date.now() / (INGEST_RATE_WINDOW_SECONDS * 1_000),
    );
    const keys = Array.from(counts.keys()).map(
      (deviceId) => `rate:ingest:${deviceId}:${window}`,
    );

    try {
      const result = await this.redisService.client.eval(
        RESERVE_RATE_LIMIT_SCRIPT,
        keys.length,
        ...keys,
        INGEST_RATE_WINDOW_SECONDS,
        INGEST_RATE_LIMIT,
        ...counts.values(),
      );

      if (result !== 1) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Ingest rate limit exceeded: ${INGEST_RATE_LIMIT} readings per device per minute`,
            retryAfterSeconds: INGEST_RATE_WINDOW_SECONDS,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Could not enforce ingest rate limit; allowing request: ${message}`,
      );
    }
  }

  private countByDevice(
    readings: readonly DeviceReading[],
  ): Map<string, number> {
    const counts = new Map<string, number>();

    readings.forEach(({ deviceId }) => {
      counts.set(deviceId, (counts.get(deviceId) ?? 0) + 1);
    });

    return counts;
  }
}
