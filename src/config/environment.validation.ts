import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnvironment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  PORT = 3000;

  @Transform(trim)
  @IsUrl({
    protocols: ['mongodb', 'mongodb+srv'],
    require_protocol: true,
    require_tld: false,
  })
  MONGO_URI!: string;

  @Transform(trim)
  @IsUrl({
    protocols: ['redis', 'rediss'],
    require_protocol: true,
    require_tld: false,
  })
  REDIS_URL!: string;

  @Transform(trim)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  ALERT_WEBHOOK_URL!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  INGEST_TOKEN!: string;
}

export function validateEnvironment(
  configuration: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfiguration = plainToInstance(
    EnvironmentVariables,
    configuration,
    { enableImplicitConversion: false },
  );

  const errors = validateSync(validatedConfiguration, {
    skipMissingProperties: false,
    whitelist: true,
  });

  if (errors.length > 0) {
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );

    throw new Error(
      `Invalid environment configuration: ${messages.join('; ')}`,
    );
  }

  return validatedConfiguration;
}
