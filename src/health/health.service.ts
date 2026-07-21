import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ConnectionStates } from 'mongoose';
import type { Connection } from 'mongoose';
import { RedisService } from '../redis/redis.service';

const HEALTH_CHECK_TIMEOUT_MS = 2_000;

type DependencyStatus = 'up' | 'down';

export interface HealthStatus {
  status: 'ok' | 'error';
  checks: {
    mongodb: DependencyStatus;
    redis: DependencyStatus;
  };
}

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly mongoConnection: Connection,
    private readonly redisService: RedisService,
  ) {}

  async check(): Promise<HealthStatus> {
    const [mongodb, redis] = await Promise.all([
      this.checkMongoDb(),
      this.checkRedis(),
    ]);

    return {
      status: mongodb === 'up' && redis === 'up' ? 'ok' : 'error',
      checks: { mongodb, redis },
    };
  }

  private async checkMongoDb(): Promise<DependencyStatus> {
    if (
      this.mongoConnection.readyState !== ConnectionStates.connected ||
      !this.mongoConnection.db
    ) {
      return 'down';
    }

    try {
      await this.withTimeout(this.mongoConnection.db.admin().ping());
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    try {
      const result = await this.withTimeout(this.redisService.client.ping());
      return result === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  private withTimeout<T>(operation: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Health check timed out')),
        HEALTH_CHECK_TIMEOUT_MS,
      );

      operation.then(
        (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }
}
