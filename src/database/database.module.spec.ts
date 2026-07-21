import { ConfigType } from '@nestjs/config';
import { appConfig } from '../config/app.config';
import { createMongooseOptions } from './database.module';

function createConfig(
  overrides: Partial<ConfigType<typeof appConfig>> = {},
): ConfigType<typeof appConfig> {
  return {
    nodeEnv: 'development',
    port: 3000,
    mongoUri: 'mongodb://localhost:27017/telemetry',
    redisUrl: 'redis://localhost:6379',
    alertWebhookUrl: 'https://example.com/alerts',
    ingestToken: 'test-token',
    ...overrides,
  };
}

describe('createMongooseOptions', () => {
  it('uses the configured MongoDB URI and resilient connection settings', () => {
    const options = createMongooseOptions(createConfig());

    expect(options).toMatchObject({
      uri: 'mongodb://localhost:27017/telemetry',
      autoIndex: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5_000,
      retryAttempts: 5,
      retryDelay: 1_000,
    });
  });

  it('disables automatic index creation in production', () => {
    const options = createMongooseOptions(
      createConfig({ nodeEnv: 'production' }),
    );

    expect(options.autoIndex).toBe(false);
  });
});
