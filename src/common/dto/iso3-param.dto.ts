import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

export class Iso3ParamDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/)
  iso3!: string;
}
