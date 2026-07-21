import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../redis/redis.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  const mongoPing = jest.fn();
  const redisPing = jest.fn();
  const mongoConnection = {
    readyState: 1,
    db: { admin: () => ({ ping: mongoPing }) },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: getConnectionToken(), useValue: mongoConnection },
        {
          provide: RedisService,
          useValue: { client: { ping: redisPing } },
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    mongoConnection.readyState = 1;
    mongoPing.mockResolvedValue({ ok: 1 });
    redisPing.mockResolvedValue('PONG');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reports healthy dependencies', async () => {
    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      checks: { mongodb: 'up', redis: 'up' },
    });
  });

  it('reports a disconnected MongoDB dependency', async () => {
    mongoConnection.readyState = 0;

    await expect(service.check()).resolves.toEqual({
      status: 'error',
      checks: { mongodb: 'down', redis: 'up' },
    });
    expect(mongoPing).not.toHaveBeenCalled();
  });

  it('reports a failed Redis dependency', async () => {
    redisPing.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.check()).resolves.toEqual({
      status: 'error',
      checks: { mongodb: 'up', redis: 'down' },
    });
  });
});
