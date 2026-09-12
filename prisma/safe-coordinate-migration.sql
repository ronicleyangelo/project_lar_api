-- Migração idempotente: preserva coordenadas existentes ao trocar Float por
-- texto criptografável. Deve rodar antes de `prisma db push`.
ALTER TABLE "ClientProfile" ADD COLUMN IF NOT EXISTS "approximateLat" DOUBLE PRECISION;
ALTER TABLE "ClientProfile" ADD COLUMN IF NOT EXISTS "approximateLng" DOUBLE PRECISION;
ALTER TABLE "CoverageArea" ADD COLUMN IF NOT EXISTS "approximateLat" DOUBLE PRECISION;
ALTER TABLE "CoverageArea" ADD COLUMN IF NOT EXISTS "approximateLng" DOUBLE PRECISION;
ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "approximateLat" DOUBLE PRECISION;
ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "approximateLng" DOUBLE PRECISION;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientProfile' AND column_name = 'latitude' AND data_type = 'double precision') THEN
    UPDATE "ClientProfile" SET
      "approximateLat" = COALESCE("approximateLat", ROUND("latitude"::numeric, 2)::double precision),
      "approximateLng" = COALESCE("approximateLng", ROUND("longitude"::numeric, 2)::double precision);
    ALTER TABLE "ClientProfile" ALTER COLUMN "latitude" TYPE TEXT USING "latitude"::text;
    ALTER TABLE "ClientProfile" ALTER COLUMN "longitude" TYPE TEXT USING "longitude"::text;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'CoverageArea' AND column_name = 'latitude' AND data_type = 'double precision') THEN
    UPDATE "CoverageArea" SET
      "approximateLat" = COALESCE("approximateLat", ROUND("latitude"::numeric, 2)::double precision),
      "approximateLng" = COALESCE("approximateLng", ROUND("longitude"::numeric, 2)::double precision);
    ALTER TABLE "CoverageArea" ALTER COLUMN "latitude" TYPE TEXT USING "latitude"::text;
    ALTER TABLE "CoverageArea" ALTER COLUMN "longitude" TYPE TEXT USING "longitude"::text;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ServiceRequest' AND column_name = 'latitude' AND data_type = 'double precision') THEN
    UPDATE "ServiceRequest" SET
      "approximateLat" = COALESCE("approximateLat", ROUND("latitude"::numeric, 2)::double precision),
      "approximateLng" = COALESCE("approximateLng", ROUND("longitude"::numeric, 2)::double precision);
    ALTER TABLE "ServiceRequest" ALTER COLUMN "latitude" TYPE TEXT USING "latitude"::text;
    ALTER TABLE "ServiceRequest" ALTER COLUMN "longitude" TYPE TEXT USING "longitude"::text;
  END IF;
END $$;
