ALTER TYPE "MetricType" ADD VALUE IF NOT EXISTS 'DECISIONS_REFUSED';
ALTER TYPE "MetricType" ADD VALUE IF NOT EXISTS 'DECISIONS_WITHDRAWN';
ALTER TYPE "MetricType" ADD VALUE IF NOT EXISTS 'DECISIONS_LAPSED';
ALTER TYPE "MetricType" ADD VALUE IF NOT EXISTS 'APPROVAL_RATE';
ALTER TYPE "MetricType" ADD VALUE IF NOT EXISTS 'REFUSAL_RATE';
ALTER TYPE "MetricType" ADD VALUE IF NOT EXISTS 'PENDING_APPLICATIONS';

CREATE TYPE "PopulationBasis" AS ENUM ('CITIZENSHIP', 'NATIONAL');
CREATE TYPE "DerivationFormula" AS ENUM ('APPROVAL_RATE', 'REFUSAL_RATE');
CREATE TYPE "DerivationOperandRole" AS ENUM ('NUMERATOR_COMPONENT', 'DENOMINATOR_COMPONENT');
CREATE TYPE "RequirementType" AS ENUM (
  'APPLICATION_FEE',
  'PROOF_OF_FUNDS',
  'DEPENDANTS_ALLOWED',
  'SPOUSE_WORK_RIGHT',
  'RENEWABLE',
  'PROCESSING_TIME_TARGET'
);
CREATE TYPE "RequirementValueKind" AS ENUM ('MONEY', 'STATE', 'DURATION');
CREATE TYPE "RequirementBasis" AS ENUM (
  'PER_APPLICATION',
  'PER_PERSON',
  'PER_MONTH',
  'PER_YEAR',
  'TOTAL'
);
CREATE TYPE "RequirementState" AS ENUM ('YES', 'NO', 'DEPENDS', 'UNKNOWN');
CREATE TYPE "RequirementDurationUnit" AS ENUM (
  'DAYS_CALENDAR',
  'DAYS_BUSINESS',
  'WEEKS',
  'MONTHS',
  'YEARS'
);
CREATE TYPE "PathwayType" AS ENUM ('POST_STUDY_WORK', 'PERMANENT_RESIDENCE');

ALTER TABLE "comparison_groups"
  ADD COLUMN "population_basis" "PopulationBasis",
  ADD COLUMN "population_key" TEXT,
  ADD COLUMN "program_key" TEXT;

UPDATE "comparison_groups"
SET
  "population_basis" = 'CITIZENSHIP',
  "population_key" = "citizenship_iso3"::TEXT,
  "program_key" = 'ALL';

ALTER TABLE "comparison_groups"
  ALTER COLUMN "population_basis" SET NOT NULL,
  ALTER COLUMN "population_key" SET NOT NULL,
  ALTER COLUMN "program_key" SET NOT NULL,
  ALTER COLUMN "citizenship_iso3" DROP NOT NULL;

ALTER TABLE "metric_observations"
  ADD COLUMN "population_basis" "PopulationBasis",
  ADD COLUMN "population_key" TEXT,
  ADD COLUMN "program_key" TEXT,
  ADD COLUMN "approximate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "rounding_increment" INTEGER,
  ADD COLUMN "precision" INTEGER;

UPDATE "metric_observations"
SET
  "population_basis" = 'CITIZENSHIP',
  "population_key" = "citizenship_iso3"::TEXT,
  "program_key" = 'ALL';

ALTER TABLE "metric_observations"
  ALTER COLUMN "population_basis" SET NOT NULL,
  ALTER COLUMN "population_key" SET NOT NULL,
  ALTER COLUMN "program_key" SET NOT NULL,
  ALTER COLUMN "citizenship_iso3" DROP NOT NULL;

ALTER TABLE "comparison_groups"
  ADD CONSTRAINT "comparison_groups_population_scope_check" CHECK (
    (
      "population_basis" = 'CITIZENSHIP'
      AND "citizenship_iso3" IS NOT NULL
      AND "population_key" = "citizenship_iso3"::TEXT
    ) OR (
      "population_basis" = 'NATIONAL'
      AND "citizenship_iso3" IS NULL
      AND "population_key" = 'ALL'
    )
  ),
  ADD CONSTRAINT "comparison_groups_program_key_check" CHECK (
    "program_key" = 'ALL'
    OR "program_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*(:[a-z0-9]+(-[a-z0-9]+)*)+$'
  );

ALTER TABLE "metric_observations"
  ADD CONSTRAINT "metric_observations_population_scope_check" CHECK (
    (
      "population_basis" = 'CITIZENSHIP'
      AND "citizenship_iso3" IS NOT NULL
      AND "population_key" = "citizenship_iso3"::TEXT
    ) OR (
      "population_basis" = 'NATIONAL'
      AND "citizenship_iso3" IS NULL
      AND "population_key" = 'ALL'
    )
  ),
  ADD CONSTRAINT "metric_observations_program_key_check" CHECK (
    "program_key" = 'ALL'
    OR "program_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*(:[a-z0-9]+(-[a-z0-9]+)*)+$'
  ),
  ADD CONSTRAINT "metric_observations_measurement_check" CHECK (
    ("rounding_increment" IS NULL OR "rounding_increment" > 0)
    AND ("precision" IS NULL OR "precision" >= 0)
  );

DROP INDEX "comparison_groups_citizenship_iso3_purpose_period_metric_ty_idx";
DROP INDEX "comparison_groups_dataset_id_metric_type_citizenship_iso3_p_key";
DROP INDEX "metric_observations_citizenship_iso3_purpose_period_metric__idx";
DROP INDEX "metric_observations_release_id_destination_iso3_citizenship_key";

CREATE INDEX "comparison_groups_population_program_purpose_period_metric_idx"
  ON "comparison_groups"(
    "population_basis", "population_key", "program_key", "purpose", "period", "metric_type"
  );
CREATE UNIQUE INDEX "comparison_groups_dataset_metric_population_program_key"
  ON "comparison_groups"(
    "dataset_id", "metric_type", "population_basis", "population_key",
    "program_key", "purpose", "period", "unit", "methodology_version"
  );
CREATE INDEX "metric_observations_population_program_purpose_period_idx"
  ON "metric_observations"(
    "population_basis", "population_key", "program_key", "purpose", "period",
    "metric_type", "comparison_group_id"
  );
CREATE UNIQUE INDEX "metric_observations_release_destination_population_key"
  ON "metric_observations"(
    "release_id", "destination_iso3", "population_basis", "population_key",
    "program_key", "purpose", "metric_type", "source_category_code", "period", "unit"
  );

CREATE TABLE "metric_derivations" (
  "id" TEXT NOT NULL,
  "observation_id" TEXT NOT NULL,
  "formula" "DerivationFormula" NOT NULL,
  "precision" INTEGER NOT NULL,
  "validated_at" TIMESTAMPTZ(3) NOT NULL,
  "quality_report" JSONB,
  CONSTRAINT "metric_derivations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "metric_derivations_precision_check" CHECK ("precision" = 2)
);

CREATE TABLE "metric_derivation_operands" (
  "id" TEXT NOT NULL,
  "derivation_id" TEXT NOT NULL,
  "observation_id" TEXT NOT NULL,
  "role" "DerivationOperandRole" NOT NULL,
  "coefficient" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "metric_derivation_operands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "metric_derivation_operands_coefficient_check" CHECK ("coefficient" = 1)
);

CREATE UNIQUE INDEX "metric_derivations_observation_id_key"
  ON "metric_derivations"("observation_id");
CREATE UNIQUE INDEX "metric_derivation_operands_derivation_observation_role_key"
  ON "metric_derivation_operands"("derivation_id", "observation_id", "role");
CREATE INDEX "metric_derivation_operands_observation_id_idx"
  ON "metric_derivation_operands"("observation_id");

CREATE TABLE "visa_program_requirements" (
  "id" TEXT NOT NULL,
  "visa_program_id" TEXT NOT NULL,
  "release_id" TEXT NOT NULL,
  "type" "RequirementType" NOT NULL,
  "value_kind" "RequirementValueKind" NOT NULL,
  "amount" DECIMAL(18,2),
  "currency" CHAR(3),
  "basis" "RequirementBasis",
  "max_periods" INTEGER,
  "state" "RequirementState",
  "duration_amount" INTEGER,
  "duration_unit" "RequirementDurationUnit",
  "conditions" JSONB NOT NULL,
  "condition_schema_version" TEXT NOT NULL,
  "condition_key" TEXT NOT NULL,
  "condition_summary" TEXT,
  "effective_at" DATE NOT NULL,
  "effective_until" DATE,
  "verified_at" TIMESTAMPTZ(3) NOT NULL,
  "official_url" TEXT NOT NULL,
  "source_fingerprint" TEXT NOT NULL,
  CONSTRAINT "visa_program_requirements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "visa_program_requirements_value_check" CHECK (
    (
      "value_kind" = 'MONEY'
      AND "type" IN ('APPLICATION_FEE', 'PROOF_OF_FUNDS')
      AND "amount" IS NOT NULL AND "amount" >= 0
      AND "currency" IS NOT NULL AND "basis" IS NOT NULL
      AND "state" IS NULL AND "duration_amount" IS NULL AND "duration_unit" IS NULL
    ) OR (
      "value_kind" = 'STATE'
      AND "type" IN ('DEPENDANTS_ALLOWED', 'SPOUSE_WORK_RIGHT', 'RENEWABLE')
      AND "state" IS NOT NULL
      AND "amount" IS NULL AND "currency" IS NULL AND "basis" IS NULL
      AND "max_periods" IS NULL AND "duration_amount" IS NULL AND "duration_unit" IS NULL
    ) OR (
      "value_kind" = 'DURATION'
      AND "type" = 'PROCESSING_TIME_TARGET'
      AND "duration_amount" IS NOT NULL AND "duration_amount" > 0
      AND "duration_unit" IS NOT NULL
      AND "amount" IS NULL AND "currency" IS NULL AND "basis" IS NULL
      AND "max_periods" IS NULL AND "state" IS NULL
    )
  ),
  CONSTRAINT "visa_program_requirements_conditions_check" CHECK (
    jsonb_typeof("conditions") = 'array'
    AND "condition_schema_version" ~ '^v[0-9]+$'
    AND "condition_key" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "visa_program_requirements_dates_check" CHECK (
    "effective_until" IS NULL OR "effective_until" > "effective_at"
  ),
  CONSTRAINT "visa_program_requirements_url_check" CHECK (
    "official_url" ~ '^https?://' AND length("official_url") <= 2048
  )
);

CREATE TABLE "visa_program_pathways" (
  "id" TEXT NOT NULL,
  "from_visa_program_id" TEXT NOT NULL,
  "release_id" TEXT NOT NULL,
  "target_route_code" TEXT NOT NULL,
  "pathway_type" "PathwayType" NOT NULL,
  "state" "RequirementState" NOT NULL,
  "qualifying_period_months" INTEGER,
  "conditions" JSONB NOT NULL,
  "condition_schema_version" TEXT NOT NULL,
  "condition_key" TEXT NOT NULL,
  "effective_at" DATE NOT NULL,
  "effective_until" DATE,
  "verified_at" TIMESTAMPTZ(3) NOT NULL,
  "official_url" TEXT NOT NULL,
  "source_fingerprint" TEXT NOT NULL,
  CONSTRAINT "visa_program_pathways_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "visa_program_pathways_state_check" CHECK ("state" <> 'NO'),
  CONSTRAINT "visa_program_pathways_conditions_check" CHECK (
    jsonb_typeof("conditions") = 'array'
    AND "condition_schema_version" ~ '^v[0-9]+$'
    AND "condition_key" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "visa_program_pathways_dates_check" CHECK (
    "effective_until" IS NULL OR "effective_until" > "effective_at"
  ),
  CONSTRAINT "visa_program_pathways_url_check" CHECK (
    "official_url" ~ '^https?://' AND length("official_url") <= 2048
  )
);

CREATE INDEX "visa_program_requirements_program_type_effective_idx"
  ON "visa_program_requirements"("visa_program_id", "type", "effective_at");
CREATE INDEX "visa_program_requirements_release_id_idx"
  ON "visa_program_requirements"("release_id");
CREATE INDEX "visa_program_pathways_program_type_effective_idx"
  ON "visa_program_pathways"("from_visa_program_id", "pathway_type", "effective_at");
CREATE INDEX "visa_program_pathways_release_id_idx"
  ON "visa_program_pathways"("release_id");

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "visa_program_requirements"
  ADD CONSTRAINT "visa_program_requirements_no_overlap"
  EXCLUDE USING gist (
    "visa_program_id" WITH =,
    "condition_key" WITH =,
    daterange("effective_at", COALESCE("effective_until", 'infinity'::DATE), '[)') WITH &&
  );

ALTER TABLE "visa_program_pathways"
  ADD CONSTRAINT "visa_program_pathways_no_overlap"
  EXCLUDE USING gist (
    "from_visa_program_id" WITH =,
    "condition_key" WITH =,
    daterange("effective_at", COALESCE("effective_until", 'infinity'::DATE), '[)') WITH &&
  );

ALTER TABLE "metric_derivations"
  ADD CONSTRAINT "metric_derivations_observation_id_fkey"
  FOREIGN KEY ("observation_id") REFERENCES "metric_observations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "metric_derivation_operands"
  ADD CONSTRAINT "metric_derivation_operands_derivation_id_fkey"
  FOREIGN KEY ("derivation_id") REFERENCES "metric_derivations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "metric_derivation_operands"
  ADD CONSTRAINT "metric_derivation_operands_observation_id_fkey"
  FOREIGN KEY ("observation_id") REFERENCES "metric_observations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visa_program_requirements"
  ADD CONSTRAINT "visa_program_requirements_visa_program_id_fkey"
  FOREIGN KEY ("visa_program_id") REFERENCES "visa_programs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visa_program_requirements"
  ADD CONSTRAINT "visa_program_requirements_release_id_fkey"
  FOREIGN KEY ("release_id") REFERENCES "dataset_releases"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visa_program_pathways"
  ADD CONSTRAINT "visa_program_pathways_from_visa_program_id_fkey"
  FOREIGN KEY ("from_visa_program_id") REFERENCES "visa_programs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visa_program_pathways"
  ADD CONSTRAINT "visa_program_pathways_release_id_fkey"
  FOREIGN KEY ("release_id") REFERENCES "dataset_releases"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
