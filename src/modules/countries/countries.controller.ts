import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { Iso3ParamDto } from '../../common/dto/iso3-param.dto.js';
import { StatisticsQueryDto } from '../../common/dto/statistics-query.dto.js';
import { CacheControlInterceptor } from '../../common/http/cache-control.interceptor.js';
import { CountriesService } from './countries.service.js';
import { ListCountriesQueryDto } from './dto/list-countries-query.dto.js';
import { CountryDetailService } from './services/country-detail.service.js';

@Controller('countries')
@UseInterceptors(CacheControlInterceptor)
export class CountriesController {
  constructor(
    private readonly countries: CountriesService,
    private readonly detail: CountryDetailService,
  ) {}

  @Get()
  list(@Query() query: ListCountriesQueryDto) {
    return this.countries.list(query);
  }

  @Get(':iso3')
  getDetail(@Param() params: Iso3ParamDto, @Query() query: StatisticsQueryDto) {
    return this.detail.get(params.iso3, query);
  }
}
