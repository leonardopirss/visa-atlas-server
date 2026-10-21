import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { CacheControlInterceptor } from '../../common/http/cache-control.interceptor.js';
import { DefaultFiltersService } from './services/default-filters.service.js';

@Controller('filters')
@UseInterceptors(CacheControlInterceptor)
export class FiltersController {
  constructor(private readonly defaults: DefaultFiltersService) {}

  @Get('defaults')
  getDefaults() {
    return this.defaults.getDefaults();
  }
}
