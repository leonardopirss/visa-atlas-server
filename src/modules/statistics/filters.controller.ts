import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { DefaultFiltersQueryDto } from '../../common/dto/statistics-query.dto.js';
import { CacheControlInterceptor } from '../../common/http/cache-control.interceptor.js';
import { DefaultFiltersService } from './services/default-filters.service.js';

@Controller('filters')
@UseInterceptors(CacheControlInterceptor)
export class FiltersController {
  constructor(private readonly defaults: DefaultFiltersService) {}

  @Get('defaults')
  getDefaults(@Query() query: DefaultFiltersQueryDto) {
    return this.defaults.getDefaults(query);
  }
}
