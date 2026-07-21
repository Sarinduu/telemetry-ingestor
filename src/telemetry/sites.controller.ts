import { Controller, Get, Param, Query } from '@nestjs/common';
import { SiteParamsDto } from './dto/site-params.dto';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { TelemetryService } from './telemetry.service';

@Controller('sites')
export class SitesController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get(':siteId/summary')
  summary(
    @Param() { siteId }: SiteParamsDto,
    @Query() query: SummaryQueryDto,
  ): ReturnType<TelemetryService['getSummary']> {
    return this.telemetryService.getSummary(siteId, query);
  }
}
