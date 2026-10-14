import { MigrationInterface, QueryRunner } from 'typeorm';

const NEW_SLUG = `'src_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24)`;

export class AddEndpointIngressSlug1711300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "endpoints" ADD COLUMN IF NOT EXISTS "ingressSlug" varchar(32)`,
    );
    await queryRunner.query(
      `UPDATE "endpoints" SET "ingressSlug" = ${NEW_SLUG} WHERE "ingressSlug" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "endpoints" ALTER COLUMN "ingressSlug" SET DEFAULT (${NEW_SLUG}), ALTER COLUMN "ingressSlug" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_endpoints_ingressSlug" ON "endpoints" ("ingressSlug")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_endpoints_ingressSlug"`);
    await queryRunner.query(
      `ALTER TABLE "endpoints" DROP COLUMN IF EXISTS "ingressSlug"`,
    );
  }
}
