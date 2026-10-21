import { Module } from '@nestjs/common';
import { HttpModule } from '../../common/http/http.module.js';
import { SourcesModule } from '../sources/sources.module.js';
import { StatisticsModule } from '../statistics/statistics.module.js';
import { VisaProgramsModule } from '../visa-programs/visa-programs.module.js';
import { CountriesController } from './countries.controller.js';
import { CountriesService } from './countries.service.js';
import { CountryDetailService } from './services/country-detail.service.js';

@Module({
  imports: [HttpModule, SourcesModule, StatisticsModule, VisaProgramsModule],
  controllers: [CountriesController],
  providers: [CountriesService, CountryDetailService],
})
export class CountriesModule {}
