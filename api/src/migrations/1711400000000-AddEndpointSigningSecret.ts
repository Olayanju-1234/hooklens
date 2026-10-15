import { MigrationInterface, QueryRunner } from 'typeorm';

// 32 random bytes (two v4 UUIDs) as whsec_<base64>, without needing pgcrypto
const NEW_SECRET = `'whsec_' || encode(decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64')`;

export class AddEndpointSigningSecret1711400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "endpoints" ADD COLUMN IF NOT EXISTS "signingSecret" varchar(64)`,
    );
    await queryRunner.query(
      `UPDATE "endpoints" SET "signingSecret" = ${NEW_SECRET} WHERE "signingSecret" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "endpoints" ALTER COLUMN "signingSecret" SET DEFAULT (${NEW_SECRET}), ALTER COLUMN "signingSecret" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "endpoints" DROP COLUMN IF EXISTS "signingSecret"`,
    );
  }
}
