import { Module } from '@nestjs/common';
import { HttpModule } from '../../common/http/http.module.js';
import { FiltersController } from './filters.controller.js';
import { DefaultFiltersService } from './services/default-filters.service.js';
import { TimeseriesService } from './services/timeseries.service.js';
import { StatisticsController } from './statistics.controller.js';
import { StatisticsService } from './statistics.service.js';

@Module({
  imports: [HttpModule],
  controllers: [FiltersController, StatisticsController],
  providers: [DefaultFiltersService, StatisticsService, TimeseriesService],
  exports: [DefaultFiltersService],
})
export class StatisticsModule {}
