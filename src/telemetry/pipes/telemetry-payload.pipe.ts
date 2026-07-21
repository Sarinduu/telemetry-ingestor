import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
  ValidationPipe,
} from '@nestjs/common';
import { CreateTelemetryDto } from '../dto/create-telemetry.dto';

@Injectable()
export class TelemetryPayloadPipe implements PipeTransform<
  unknown,
  Promise<CreateTelemetryDto[]>
> {
  private readonly validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  });

  async transform(
    value: unknown,
    metadata: ArgumentMetadata,
  ): Promise<CreateTelemetryDto[]> {
    const readings = Array.isArray(value) ? value : [value];

    if (readings.length === 0) {
      throw new BadRequestException(
        'At least one telemetry reading is required',
      );
    }

    return Promise.all(
      readings.map(async (reading) => {
        const validatedReading = (await this.validationPipe.transform(reading, {
          ...metadata,
          metatype: CreateTelemetryDto,
        })) as unknown;

        return validatedReading as CreateTelemetryDto;
      }),
    );
  }
}
