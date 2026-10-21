import { MetricType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DEFAULT_CITIZENSHIP,
  DEFAULT_METRIC_TYPE,
  DEFAULT_PURPOSE,
} from '../contracts/public-api.types.js';

export class StatisticsQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/)
  citizenship: string = DEFAULT_CITIZENSHIP;

  @IsOptional()
  @IsIn(['WORK'])
  purpose: 'WORK' = DEFAULT_PURPOSE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  year?: number;

  @IsOptional()
  @IsEnum(MetricType)
  metricType: MetricType = DEFAULT_METRIC_TYPE;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  comparisonGroupId?: string;
}

export class TimeseriesQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/)
  citizenship: string = DEFAULT_CITIZENSHIP;

  @IsOptional()
  @IsIn(['WORK'])
  purpose: 'WORK' = DEFAULT_PURPOSE;

  @IsOptional()
  @IsEnum(MetricType)
  metricType: MetricType = DEFAULT_METRIC_TYPE;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  comparisonGroupId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  fromYear?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  toYear?: number;
}
