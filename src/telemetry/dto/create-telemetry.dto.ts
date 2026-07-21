import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MetricsDto } from './metrics.dto';

export class CreateTelemetryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  siteId!: string;

  @IsISO8601({ strict: true })
  ts!: string;

  @ValidateNested()
  @Type(() => MetricsDto)
  metrics!: MetricsDto;
}
