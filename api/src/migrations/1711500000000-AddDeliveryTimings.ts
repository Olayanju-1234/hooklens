import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveryTimings1711500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "webhook_events"
        ADD COLUMN IF NOT EXISTS "processedAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "queuedAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "targetCount" integer
    `);
    // Fallback forward-URL attempts are now recorded too, and they have no destination row
    await queryRunner.query(`
      ALTER TABLE "forward_results"
        ALTER COLUMN "destinationId" DROP NOT NULL,
        ADD COLUMN IF NOT EXISTS "startedAt" timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "forward_results" WHERE "destinationId" IS NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "forward_results"
        DROP COLUMN IF EXISTS "startedAt",
        ALTER COLUMN "destinationId" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "webhook_events"
        DROP COLUMN IF EXISTS "processedAt",
        DROP COLUMN IF EXISTS "queuedAt",
        DROP COLUMN IF EXISTS "targetCount"
    `);
  }
}
