import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { appConfig } from '../../config/app.config';
import { IngestTokenGuard } from './ingest-token.guard';

function createContext(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  } as ExecutionContext;
}

describe('IngestTokenGuard', () => {
  let guard: IngestTokenGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestTokenGuard,
        {
          provide: appConfig.KEY,
          useValue: { ingestToken: 'expected-token' },
        },
      ],
    }).compile();

    guard = module.get<IngestTokenGuard>(IngestTokenGuard);
  });

  it('allows the configured bearer token', () => {
    expect(guard.canActivate(createContext('Bearer expected-token'))).toBe(
      true,
    );
  });

  it.each([
    undefined,
    '',
    'expected-token',
    'Basic expected-token',
    'Bearer wrong-token',
    'Bearer ',
  ])('rejects an invalid authorization header: %s', (authorization) => {
    expect(() => guard.canActivate(createContext(authorization))).toThrow(
      UnauthorizedException,
    );
  });
});
