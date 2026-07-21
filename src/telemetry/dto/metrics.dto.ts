import { IsNumber } from 'class-validator';

export class MetricsDto {
  @IsNumber({ allowInfinity: false, allowNaN: false })
  temperature!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  humidity!: number;
}
