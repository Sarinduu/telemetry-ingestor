import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  mongoUri: process.env.MONGO_URI as string,
  redisUrl: process.env.REDIS_URL as string,
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL as string,
  ingestToken: process.env.INGEST_TOKEN as string,
}));
