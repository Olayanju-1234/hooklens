import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChaosMode1711700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chaos_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "endpointId" uuid NOT NULL,
        "destinationId" uuid,
        "enabled" boolean NOT NULL DEFAULT false,
        "expiresAt" timestamptz,
        "scope" varchar(8) NOT NULL DEFAULT 'test',
        "seed" varchar(64) NOT NULL,
        "duplicateProbability" real NOT NULL DEFAULT 0,
        "duplicateCopies" smallint NOT NULL DEFAULT 1,
        "duplicateGapMs" integer NOT NULL DEFAULT 5000,
        "delayProbability" real NOT NULL DEFAULT 0,
        "delayMinMs" integer NOT NULL DEFAULT 30000,
        "delayMaxMs" integer NOT NULL DEFAULT 120000,
        "reorderProbability" real NOT NULL DEFAULT 0,
        "reorderWindowMs" integer NOT NULL DEFAULT 10000,
        "staleProbability" real NOT NULL DEFAULT 0,
        "updatedBy" uuid,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chaos_settings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chaos_settings_endpoint" FOREIGN KEY ("endpointId")
          REFERENCES "endpoints"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chaos_settings_destination" FOREIGN KEY ("destinationId")
          REFERENCES "forward_destinations"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_chaos_settings_scope" CHECK ("scope" IN ('test', 'all')),
        CONSTRAINT "CHK_chaos_settings_expiry" CHECK (NOT "enabled" OR "expiresAt" IS NOT NULL),
        CONSTRAINT "CHK_chaos_settings_probabilities" CHECK (
          "duplicateProbability" BETWEEN 0 AND 1
          AND "delayProbability" BETWEEN 0 AND 1
          AND "reorderProbability" BETWEEN 0 AND 1
          AND "staleProbability" BETWEEN 0 AND 1
        ),
        CONSTRAINT "CHK_chaos_settings_duplicate" CHECK (
          "duplicateCopies" BETWEEN 1 AND 3 AND "duplicateGapMs" BETWEEN 0 AND 300000
        ),
        CONSTRAINT "CHK_chaos_settings_delay" CHECK (
          "delayMinMs" >= 0 AND "delayMinMs" <= "delayMaxMs" AND "delayMaxMs" <= 900000
        ),
        CONSTRAINT "CHK_chaos_settings_reorder" CHECK ("reorderWindowMs" BETWEEN 1000 AND 300000)
      )
    `);
    // One row per delivery target: the fallback forward URL (no destination) or one destination
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_chaos_settings_fallback" ON "chaos_settings" ("endpointId") WHERE "destinationId" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_chaos_settings_destination" ON "chaos_settings" ("destinationId") WHERE "destinationId" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_chaos_settings_endpoint" ON "chaos_settings" ("endpointId")`,
    );

    await queryRunner.query(`
      ALTER TABLE "forward_results"
        ADD COLUMN IF NOT EXISTS "chaosKind" varchar(16),
        ADD COLUMN IF NOT EXISTS "chaosSeq" smallint NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "chaosDelayMs" integer,
        ADD CONSTRAINT "CHK_forward_results_chaos_kind"
          CHECK ("chaosKind" IS NULL OR "chaosKind" IN ('duplicate', 'delay', 'reorder', 'stale'))
    `);
    await queryRunner.query(
      `ALTER TABLE "webhook_events" ADD COLUMN IF NOT EXISTS "isTest" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Older code would count extra chaos copies as real attempts, so they go first
    await queryRunner.query(
      `DELETE FROM "forward_results" WHERE "chaosSeq" > 0`,
    );
    await queryRunner.query(`
      ALTER TABLE "forward_results"
        DROP CONSTRAINT IF EXISTS "CHK_forward_results_chaos_kind",
        DROP COLUMN IF EXISTS "chaosKind",
        DROP COLUMN IF EXISTS "chaosSeq",
        DROP COLUMN IF EXISTS "chaosDelayMs"
    `);
    await queryRunner.query(
      `ALTER TABLE "webhook_events" DROP COLUMN IF EXISTS "isTest"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "chaos_settings"`);
  }
}
