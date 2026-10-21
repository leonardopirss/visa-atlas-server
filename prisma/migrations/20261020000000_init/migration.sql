CREATE TYPE "ReleaseStatus" AS ENUM ('STAGING', 'VERIFIED', 'PUBLISHED', 'REJECTED');
CREATE TYPE "MetricType" AS ENUM ('FIRST_RESIDENCE_PERMITS_GRANTED', 'WORK_VISAS_ISSUED', 'APPLICATIONS_RECEIVED', 'APPLICATIONS_REFUSED', 'DECISIONS_GRANTED', 'VALID_PERMIT_HOLDERS');
CREATE TYPE "DataStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'SUPPRESSED', 'ESTIMATED', 'REVISED');
CREATE TYPE "VisaPurposeCode" AS ENUM ('WORK');
CREATE TYPE "SponsorshipRequirement" AS ENUM ('REQUIRED', 'NOT_REQUIRED', 'DEPENDS', 'UNKNOWN');
CREATE TYPE "IngestionJobStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "countries" (
  "iso3" CHAR(3) NOT NULL,
  "iso2" CHAR(2) NOT NULL,
  "name_pt" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  CONSTRAINT "countries_pkey" PRIMARY KEY ("iso3")
);
CREATE TABLE "citizenships" (
  "iso3" CHAR(3) NOT NULL,
  "name_pt" TEXT NOT NULL,
  CONSTRAINT "citizenships_pkey" PRIMARY KEY ("iso3")
);
CREATE TABLE "visa_purposes" (
  "code" "VisaPurposeCode" NOT NULL,
  "label" TEXT NOT NULL,
  CONSTRAINT "visa_purposes_pkey" PRIMARY KEY ("code")
);
CREATE TABLE "source_organizations" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "homepage_url" TEXT NOT NULL,
  "license" TEXT,
  CONSTRAINT "source_organizations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "source_datasets" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "methodology_url" TEXT,
  "schema_version" TEXT NOT NULL,
  CONSTRAINT "source_datasets_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "dataset_releases" (
  "id" TEXT NOT NULL,
  "dataset_id" TEXT NOT NULL,
  "source_published_at" TIMESTAMPTZ(3),
  "fetched_at" TIMESTAMPTZ(3) NOT NULL,
  "validated_at" TIMESTAMPTZ(3),
  "published_at" TIMESTAMPTZ(3),
  "checksum" TEXT NOT NULL,
  "status" "ReleaseStatus" NOT NULL DEFAULT 'STAGING',
  "quality_report" JSONB,
  CONSTRAINT "dataset_releases_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "comparison_groups" (
  "id" TEXT NOT NULL,
  "dataset_id" TEXT NOT NULL,
  "metric_type" "MetricType" NOT NULL,
  "citizenship_iso3" CHAR(3) NOT NULL,
  "purpose" "VisaPurposeCode" NOT NULL,
  "period" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "methodology_version" TEXT NOT NULL,
  CONSTRAINT "comparison_groups_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "metric_observations" (
  "id" TEXT NOT NULL,
  "release_id" TEXT NOT NULL,
  "destination_iso3" CHAR(3) NOT NULL,
  "citizenship_iso3" CHAR(3) NOT NULL,
  "purpose" "VisaPurposeCode" NOT NULL,
  "metric_type" "MetricType" NOT NULL,
  "source_category_code" TEXT NOT NULL,
  "source_category_label" TEXT,
  "period" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "value" BIGINT,
  "data_status" "DataStatus" NOT NULL,
  "comparison_group_id" TEXT NOT NULL,
  CONSTRAINT "metric_observations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "metric_observations_value_status_check" CHECK (
    ("value" IS NOT NULL AND "value" >= 0 AND "data_status" IN ('AVAILABLE', 'ESTIMATED', 'REVISED')) OR
    ("value" IS NULL AND "data_status" IN ('UNAVAILABLE', 'SUPPRESSED'))
  )
);
CREATE TABLE "visa_programs" (
  "id" TEXT NOT NULL,
  "destination_iso3" CHAR(3) NOT NULL,
  "purpose" "VisaPurposeCode" NOT NULL,
  "official_title" TEXT NOT NULL,
  "description" TEXT,
  "sponsorship_requirement" "SponsorshipRequirement" NOT NULL,
  "verified_at" TIMESTAMPTZ(3),
  "official_url" TEXT,
  CONSTRAINT "visa_programs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "official_links" (
  "id" TEXT NOT NULL,
  "country_iso3" CHAR(3) NOT NULL,
  "source_organization_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "verified_at" TIMESTAMPTZ(3),
  CONSTRAINT "official_links_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ingestion_jobs" (
  "id" TEXT NOT NULL,
  "source_dataset_id" TEXT NOT NULL,
  "started_at" TIMESTAMPTZ(3) NOT NULL,
  "finished_at" TIMESTAMPTZ(3),
  "status" "IngestionJobStatus" NOT NULL,
  "report" JSONB,
  CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "countries_iso2_key" ON "countries"("iso2");
CREATE UNIQUE INDEX "source_datasets_organization_id_code_key" ON "source_datasets"("organization_id", "code");
CREATE INDEX "dataset_releases_dataset_id_status_published_at_idx" ON "dataset_releases"("dataset_id", "status", "published_at");
CREATE UNIQUE INDEX "dataset_releases_dataset_id_checksum_key" ON "dataset_releases"("dataset_id", "checksum");
CREATE INDEX "comparison_groups_citizenship_iso3_purpose_period_metric_ty_idx" ON "comparison_groups"("citizenship_iso3", "purpose", "period", "metric_type");
CREATE UNIQUE INDEX "comparison_groups_dataset_id_metric_type_citizenship_iso3_p_key" ON "comparison_groups"("dataset_id", "metric_type", "citizenship_iso3", "purpose", "period", "unit", "methodology_version");
CREATE INDEX "metric_observations_citizenship_iso3_purpose_period_metric__idx" ON "metric_observations"("citizenship_iso3", "purpose", "period", "metric_type", "comparison_group_id");
CREATE INDEX "metric_observations_destination_iso3_period_idx" ON "metric_observations"("destination_iso3", "period");
CREATE INDEX "metric_observations_release_id_source_category_code_idx" ON "metric_observations"("release_id", "source_category_code");
CREATE UNIQUE INDEX "metric_observations_release_id_destination_iso3_citizenship_key" ON "metric_observations"("release_id", "destination_iso3", "citizenship_iso3", "purpose", "metric_type", "source_category_code", "period", "unit");
CREATE INDEX "visa_programs_destination_iso3_purpose_verified_at_idx" ON "visa_programs"("destination_iso3", "purpose", "verified_at");
CREATE INDEX "official_links_country_iso3_verified_at_idx" ON "official_links"("country_iso3", "verified_at");
CREATE INDEX "ingestion_jobs_source_dataset_id_started_at_idx" ON "ingestion_jobs"("source_dataset_id", "started_at");

ALTER TABLE "source_datasets" ADD CONSTRAINT "source_datasets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "source_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dataset_releases" ADD CONSTRAINT "dataset_releases_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "source_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "comparison_groups" ADD CONSTRAINT "comparison_groups_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "source_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "comparison_groups" ADD CONSTRAINT "comparison_groups_citizenship_iso3_fkey" FOREIGN KEY ("citizenship_iso3") REFERENCES "citizenships"("iso3") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "comparison_groups" ADD CONSTRAINT "comparison_groups_purpose_fkey" FOREIGN KEY ("purpose") REFERENCES "visa_purposes"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "metric_observations" ADD CONSTRAINT "metric_observations_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "dataset_releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "metric_observations" ADD CONSTRAINT "metric_observations_destination_iso3_fkey" FOREIGN KEY ("destination_iso3") REFERENCES "countries"("iso3") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "metric_observations" ADD CONSTRAINT "metric_observations_citizenship_iso3_fkey" FOREIGN KEY ("citizenship_iso3") REFERENCES "citizenships"("iso3") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "metric_observations" ADD CONSTRAINT "metric_observations_purpose_fkey" FOREIGN KEY ("purpose") REFERENCES "visa_purposes"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "metric_observations" ADD CONSTRAINT "metric_observations_comparison_group_id_fkey" FOREIGN KEY ("comparison_group_id") REFERENCES "comparison_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visa_programs" ADD CONSTRAINT "visa_programs_destination_iso3_fkey" FOREIGN KEY ("destination_iso3") REFERENCES "countries"("iso3") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visa_programs" ADD CONSTRAINT "visa_programs_purpose_fkey" FOREIGN KEY ("purpose") REFERENCES "visa_purposes"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "official_links" ADD CONSTRAINT "official_links_country_iso3_fkey" FOREIGN KEY ("country_iso3") REFERENCES "countries"("iso3") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "official_links" ADD CONSTRAINT "official_links_source_organization_id_fkey" FOREIGN KEY ("source_organization_id") REFERENCES "source_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_source_dataset_id_fkey" FOREIGN KEY ("source_dataset_id") REFERENCES "source_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
