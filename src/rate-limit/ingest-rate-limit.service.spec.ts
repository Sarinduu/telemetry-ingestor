import { HttpException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../redis/redis.service';
import {
  INGEST_RATE_LIMIT,
  INGEST_RATE_WINDOW_SECONDS,
  IngestRateLimitService,
} from './ingest-rate-limit.service';

describe('IngestRateLimitService', () => {
  let service: IngestRateLimitService;
  const redisEval = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestRateLimitService,
        {
          provide: RedisService,
          useValue: { client: { eval: redisEval } },
        },
      ],
    }).compile();

    service = module.get<IngestRateLimitService>(IngestRateLimitService);
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1_800_000);
    redisEval.mockResolvedValue(1);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('atomically reserves batch capacity per device', async () => {
    await service.assertWithinLimit([
      { deviceId: 'device-1' },
      { deviceId: 'device-1' },
      { deviceId: 'device-2' },
    ]);

    expect(redisEval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      'rate:ingest:device-1:30',
      'rate:ingest:device-2:30',
      INGEST_RATE_WINDOW_SECONDS,
      INGEST_RATE_LIMIT,
      2,
      1,
    );
  });

  it('rejects a request when a device exceeds the limit', async () => {
    redisEval.mockResolvedValue(0);

    await expect(
      service.assertWithinLimit([{ deviceId: 'device-1' }]),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('fails open when Redis is unavailable', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    redisEval.mockRejectedValue(new Error('Redis unavailable'));

    await expect(
      service.assertWithinLimit([{ deviceId: 'device-1' }]),
    ).resolves.toBeUndefined();
  });

  it('uses an HTTP exception for rate-limit failures', async () => {
    redisEval.mockResolvedValue(0);

    await expect(
      service.assertWithinLimit([{ deviceId: 'device-1' }]),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
