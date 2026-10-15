import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddForwardResultTarget1711600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Deliveries Hookdash didn't make itself (e.g. `hookdash listen` to localhost) are labelled here
    await queryRunner.query(
      `ALTER TABLE "forward_results" ADD COLUMN IF NOT EXISTS "target" varchar(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "forward_results" WHERE "target" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "forward_results" DROP COLUMN IF EXISTS "target"`,
    );
  }
}
