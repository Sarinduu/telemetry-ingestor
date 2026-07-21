import { ConfigType } from '@nestjs/config';
import { ConsoleLogger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { appConfig } from './config/app.config';

const PAYLOAD_SIZE_LIMIT = '1mb';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: new ConsoleLogger({
      json: true,
      colors: false,
      compact: true,
    }),
  });
  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  app.useBodyParser('json', { limit: PAYLOAD_SIZE_LIMIT });
  app.useBodyParser('urlencoded', {
    limit: PAYLOAD_SIZE_LIMIT,
    extended: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.enableShutdownHooks();

  await app.listen(config.port);
}

void bootstrap();
