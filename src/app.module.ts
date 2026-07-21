import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { appConfig } from './config/app.config';
import { validateEnvironment } from './config/environment.validation';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { TelemetryModule } from './telemetry/telemetry.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [appConfig],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    RedisModule,
    TelemetryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
