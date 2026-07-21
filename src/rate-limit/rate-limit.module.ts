import { Module } from '@nestjs/common';
import { IngestRateLimitService } from './ingest-rate-limit.service';

@Module({
  providers: [IngestRateLimitService],
  exports: [IngestRateLimitService],
})
export class RateLimitModule {}
