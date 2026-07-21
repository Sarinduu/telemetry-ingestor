import { NestFactory } from '@nestjs/core';
import { ConfigType } from '@nestjs/config';
import { AppModule } from './app.module';
import { appConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  await app.listen(config.port);
}

void bootstrap();
