import { createRedisOptions } from './redis.service';

describe('createRedisOptions', () => {
  it('configures bounded retries and fail-fast commands', () => {
    const options = createRedisOptions();

    expect(options).toMatchObject({
      lazyConnect: true,
      enableReadyCheck: true,
      enableOfflineQueue: false,
      connectTimeout: 5_000,
      maxRetriesPerRequest: 3,
    });
    expect(options.retryStrategy?.(1)).toBe(200);
    expect(options.retryStrategy?.(5)).toBe(1_000);
    expect(options.retryStrategy?.(6)).toBeNull();
  });
});
