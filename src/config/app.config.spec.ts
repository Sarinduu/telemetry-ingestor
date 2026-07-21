import 'reflect-metadata';
import { NodeEnvironment } from './environment.validation';
import { createAppConfig } from './app.config';

describe('createAppConfig', () => {
  it('uses normalized values from the validated environment', () => {
    const config = createAppConfig({
      NODE_ENV: ' production ',
      PORT: '3001',
      MONGO_URI: ' mongodb://localhost:27017/telemetry ',
      REDIS_URL: ' redis://localhost:6379 ',
      ALERT_WEBHOOK_URL: ' https://example.com/alerts ',
      INGEST_TOKEN: ' test-token ',
    });

    expect(config).toEqual({
      nodeEnv: NodeEnvironment.Production,
      port: 3001,
      mongoUri: 'mongodb://localhost:27017/telemetry',
      redisUrl: 'redis://localhost:6379',
      alertWebhookUrl: 'https://example.com/alerts',
      ingestToken: 'test-token',
    });
  });
});
