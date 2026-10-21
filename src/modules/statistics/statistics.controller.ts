import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { Iso3ParamDto } from '../../common/dto/iso3-param.dto.js';
import { StatisticsQueryDto, TimeseriesQueryDto } from '../../common/dto/statistics-query.dto.js';
import { CacheControlInterceptor } from '../../common/http/cache-control.interceptor.js';
import { StatisticsService } from './statistics.service.js';
import { TimeseriesService } from './services/timeseries.service.js';

@Controller()
@UseInterceptors(CacheControlInterceptor)
export class StatisticsController {
  constructor(
    private readonly statistics: StatisticsService,
    private readonly timeseries: TimeseriesService,
  ) {}

  @Get('stats/map')
  getMap(@Query() query: StatisticsQueryDto) {
    return this.statistics.getMap(query);
  }

  @Get('countries/:iso3/timeseries')
  getTimeseries(@Param() params: Iso3ParamDto, @Query() query: TimeseriesQueryDto) {
    return this.timeseries.get(params.iso3, query);
  }
}
