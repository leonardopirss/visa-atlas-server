import { MetricType, VisaPurposeCode } from '@prisma/client';
import type { EurostatAdapterConfig } from './eurostat.types.js';

export const EUROSTAT_DATASET_ID = 'migr-resfirst';
export const EUROSTAT_DATASET_CODE = 'migr_resfirst';
export const EUROSTAT_SOURCE_ORGANIZATION_ID = 'eurostat';
export const EUROSTAT_DATASET_URL =
  'https://ec.europa.eu/eurostat/databrowser/view/migr_resfirst/default/table';
export const EUROSTAT_METHODOLOGY_URL =
  'https://ec.europa.eu/eurostat/cache/metadata/en/migr_res_esms.htm';
export const EUROSTAT_API_URL =
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/migr_resfirst?format=JSON&lang=EN&freq=A&unit=PER&reason=EMP&duration=TOTAL&citizen=BR&geoLevel=country';

export interface EurostatDestination {
  iso3: string;
  namePt: string;
}

export const EUROSTAT_DESTINATIONS = {
  BE: { iso3: 'BEL', namePt: 'Bélgica' },
  BG: { iso3: 'BGR', namePt: 'Bulgária' },
  CZ: { iso3: 'CZE', namePt: 'Tchéquia' },
  DK: { iso3: 'DNK', namePt: 'Dinamarca' },
  DE: { iso3: 'DEU', namePt: 'Alemanha' },
  EE: { iso3: 'EST', namePt: 'Estônia' },
  IE: { iso3: 'IRL', namePt: 'Irlanda' },
  EL: { iso3: 'GRC', namePt: 'Grécia' },
  ES: { iso3: 'ESP', namePt: 'Espanha' },
  FR: { iso3: 'FRA', namePt: 'França' },
  HR: { iso3: 'HRV', namePt: 'Croácia' },
  IT: { iso3: 'ITA', namePt: 'Itália' },
  CY: { iso3: 'CYP', namePt: 'Chipre' },
  LV: { iso3: 'LVA', namePt: 'Letônia' },
  LT: { iso3: 'LTU', namePt: 'Lituânia' },
  LU: { iso3: 'LUX', namePt: 'Luxemburgo' },
  HU: { iso3: 'HUN', namePt: 'Hungria' },
  MT: { iso3: 'MLT', namePt: 'Malta' },
  NL: { iso3: 'NLD', namePt: 'Países Baixos' },
  AT: { iso3: 'AUT', namePt: 'Áustria' },
  PL: { iso3: 'POL', namePt: 'Polônia' },
  PT: { iso3: 'PRT', namePt: 'Portugal' },
  RO: { iso3: 'ROU', namePt: 'Romênia' },
  SI: { iso3: 'SVN', namePt: 'Eslovênia' },
  SK: { iso3: 'SVK', namePt: 'Eslováquia' },
  FI: { iso3: 'FIN', namePt: 'Finlândia' },
  SE: { iso3: 'SWE', namePt: 'Suécia' },
  IS: { iso3: 'ISL', namePt: 'Islândia' },
  LI: { iso3: 'LIE', namePt: 'Liechtenstein' },
  NO: { iso3: 'NOR', namePt: 'Noruega' },
  CH: { iso3: 'CHE', namePt: 'Suíça' },
  RS: { iso3: 'SRB', namePt: 'Sérvia' },
} as const satisfies Readonly<Record<string, EurostatDestination>>;

const destinationIso2ToIso3 = Object.fromEntries(
  Object.entries(EUROSTAT_DESTINATIONS).map(([iso2, country]) => [iso2, country.iso3]),
);

export const EUROSTAT_BRAZIL_WORK_CONFIG: EurostatAdapterConfig = {
  destinationDimension: 'geo',
  citizenshipDimension: 'citizen',
  purposeDimension: 'reason',
  periodDimension: 'time',
  unitDimension: 'unit',
  workCategoryCodes: ['EMP'],
  countUnitCodes: ['PER'],
  destinationIso2ToIso3,
  citizenshipIso2ToIso3: { BR: 'BRA' },
  metricType: MetricType.FIRST_RESIDENCE_PERMITS_GRANTED,
  purpose: VisaPurposeCode.WORK,
};
