import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChaosRuns1711800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chaos_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "endpointId" uuid NOT NULL,
        "destinationId" uuid,
        "scenarioId" varchar(64) NOT NULL,
        "createdBy" uuid,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chaos_runs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chaos_runs_endpoint" FOREIGN KEY ("endpointId")
          REFERENCES "endpoints"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chaos_runs_destination" FOREIGN KEY ("destinationId")
          REFERENCES "forward_destinations"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_chaos_runs_endpoint" ON "chaos_runs" ("endpointId", "createdAt")`,
    );
    // The event's place in a scenario run: which run, and which scripted step
    await queryRunner.query(`
      ALTER TABLE "webhook_events"
        ADD COLUMN IF NOT EXISTS "chaosRunId" uuid,
        ADD COLUMN IF NOT EXISTS "chaosStep" smallint,
        ADD CONSTRAINT "FK_webhook_events_chaos_run" FOREIGN KEY ("chaosRunId")
          REFERENCES "chaos_runs"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_events_chaos_run" ON "webhook_events" ("chaosRunId") WHERE "chaosRunId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_events_chaos_run"`);
    await queryRunner.query(`
      ALTER TABLE "webhook_events"
        DROP CONSTRAINT IF EXISTS "FK_webhook_events_chaos_run",
        DROP COLUMN IF EXISTS "chaosRunId",
        DROP COLUMN IF EXISTS "chaosStep"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "chaos_runs"`);
  }
}
