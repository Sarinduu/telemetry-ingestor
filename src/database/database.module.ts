import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { MongooseModule, MongooseModuleOptions } from '@nestjs/mongoose';
import { appConfig } from '../config/app.config';
import { NodeEnvironment } from '../config/environment.validation';

export function createMongooseOptions(
  config: ConfigType<typeof appConfig>,
): MongooseModuleOptions {
  return {
    uri: config.mongoUri,
    autoIndex: config.nodeEnv !== NodeEnvironment.Production,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5_000,
    retryAttempts: 5,
    retryDelay: 1_000,
  };
}

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [appConfig.KEY],
      useFactory: createMongooseOptions,
    }),
  ],
})
export class DatabaseModule {}
