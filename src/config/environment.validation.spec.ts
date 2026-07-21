import 'reflect-metadata';
import {
  EnvironmentVariables,
  NodeEnvironment,
  validateEnvironment,
} from './environment.validation';

const validEnvironment = {
  NODE_ENV: 'test',
  PORT: '3001',
  MONGO_URI: 'mongodb://localhost:27017/telemetry',
  REDIS_URL: 'redis://localhost:6379',
  ALERT_WEBHOOK_URL: 'https://example.com/alerts',
  INGEST_TOKEN: 'test-token',
};

describe('validateEnvironment', () => {
  it('validates and transforms environment variables', () => {
    const result = validateEnvironment(validEnvironment);

    expect(result).toBeInstanceOf(EnvironmentVariables);
    expect(result.NODE_ENV).toBe(NodeEnvironment.Test);
    expect(result.PORT).toBe(3001);
  });

  it('applies safe defaults for optional runtime settings', () => {
    const result = validateEnvironment({
      MONGO_URI: validEnvironment.MONGO_URI,
      REDIS_URL: validEnvironment.REDIS_URL,
      ALERT_WEBHOOK_URL: validEnvironment.ALERT_WEBHOOK_URL,
      INGEST_TOKEN: validEnvironment.INGEST_TOKEN,
    });

    expect(result.NODE_ENV).toBe(NodeEnvironment.Development);
    expect(result.PORT).toBe(3000);
  });

  it('rejects missing required variables', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, INGEST_TOKEN: undefined }),
    ).toThrow(/INGEST_TOKEN should not be empty/);
  });

  it.each(['0', '65536', 'not-a-number'])('rejects invalid PORT %s', (port) => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, PORT: port }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('rejects unsupported connection URL protocols', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, REDIS_URL: 'http://redis' }),
    ).toThrow(/REDIS_URL must be a URL address/);
  });
});
