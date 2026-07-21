import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';
import { appConfig } from '../config/app.config';

const MAX_RECONNECT_ATTEMPTS = 5;

export function createRedisOptions(): RedisOptions {
  return {
    lazyConnect: true,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    connectTimeout: 5_000,
    maxRetriesPerRequest: 3,
    retryStrategy: (attempt) =>
      attempt > MAX_RECONNECT_ATTEMPTS ? null : Math.min(attempt * 200, 2_000),
  };
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redisClient: Redis;

  constructor(
    @Inject(appConfig.KEY)
    config: ConfigType<typeof appConfig>,
  ) {
    this.redisClient = new Redis(config.redisUrl, createRedisOptions());
    this.redisClient.on('error', (error: Error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });
  }

  get client(): Redis {
    return this.redisClient;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.redisClient.connect();
      this.logger.log('Redis connection established');
    } catch (error) {
      this.redisClient.disconnect();
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient.status === 'ready') {
      await this.redisClient.quit();
      return;
    }

    this.redisClient.disconnect();
  }
}
