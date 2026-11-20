import { MetricType, PopulationBasis, VisaPurposeCode } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { DEFAULT_METRIC_TYPE, DEFAULT_PURPOSE } from '../contracts/public-api.types.js';

@ValidatorConstraint({ name: 'populationQueryCompatible', async: false })
class PopulationQueryConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const query = args.object as PopulationQueryDto;
    return query.populationBasis === PopulationBasis.NATIONAL
      ? query.citizenship === undefined
      : query.citizenship === undefined || /^[A-Z]{3}$/.test(query.citizenship);
  }

  defaultMessage(): string {
    return 'citizenship must be omitted when populationBasis=NATIONAL';
  }
}

class PopulationQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/)
  citizenship?: string;

  @IsOptional()
  @IsEnum(PopulationBasis)
  populationBasis?: PopulationBasis;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Matches(/^(ALL|[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)+)$/)
  programKey?: string;

  @Validate(PopulationQueryConstraint)
  private readonly populationCompatibility?: true;
}

export class StatisticsQueryDto extends PopulationQueryDto {
  @IsOptional()
  @IsEnum(VisaPurposeCode)
  purpose: VisaPurposeCode = DEFAULT_PURPOSE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsEnum(MetricType)
  metricType: MetricType = DEFAULT_METRIC_TYPE;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  comparisonGroupId?: string;
}

export class TimeseriesQueryDto extends PopulationQueryDto {
  @IsOptional()
  @IsEnum(VisaPurposeCode)
  purpose: VisaPurposeCode = DEFAULT_PURPOSE;

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
  @Max(2100)
  fromYear?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  toYear?: number;
}

export class DefaultFiltersQueryDto extends PopulationQueryDto {
  @IsOptional()
  @IsEnum(VisaPurposeCode)
  purpose: VisaPurposeCode = DEFAULT_PURPOSE;

  @IsOptional()
  @IsEnum(MetricType)
  metricType: MetricType = DEFAULT_METRIC_TYPE;
}
