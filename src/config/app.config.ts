import { registerAs } from '@nestjs/config';
import { validateEnvironment } from './environment.validation';

export function createAppConfig(configuration: Record<string, unknown>) {
  const environment = validateEnvironment(configuration);

  return {
    nodeEnv: environment.NODE_ENV,
    port: environment.PORT,
    mongoUri: environment.MONGO_URI,
    redisUrl: environment.REDIS_URL,
    alertWebhookUrl: environment.ALERT_WEBHOOK_URL,
    ingestToken: environment.INGEST_TOKEN,
  };
}

export const appConfig = registerAs('app', () => createAppConfig(process.env));
