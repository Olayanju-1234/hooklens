import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase2Features1710900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── User entity updates ──────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "emailVerified" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "verificationToken" varchar(255),
        ADD COLUMN IF NOT EXISTS "resetToken" varchar(255),
        ADD COLUMN IF NOT EXISTS "resetTokenExpiresAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "oauthProvider" varchar(20)
    `);

    // Make passwordHash nullable for OAuth users
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL
    `);

    // ─── Endpoint entity updates ──────────────────────────
    await queryRunner.query(`
      ALTER TABLE "endpoints"
        ADD COLUMN IF NOT EXISTS "responseStatusCode" integer NOT NULL DEFAULT 200,
        ADD COLUMN IF NOT EXISTS "responseBody" text,
        ADD COLUMN IF NOT EXISTS "blockInvalidSignatures" boolean NOT NULL DEFAULT false
    `);

    // ─── API Keys table ──────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "api_keys" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "createdByUserId" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "keyHash" varchar(255) NOT NULL UNIQUE,
        "keyPrefix" varchar(12) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "lastUsedAt" timestamptz,
        "expiresAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // ─── Audit Logs table ─────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspaceId" uuid NOT NULL,
        "userId" uuid,
        "action" varchar(100) NOT NULL,
        "resource" varchar(100) NOT NULL,
        "resourceId" uuid,
        "metadata" jsonb,
        "ipAddress" varchar(45),
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_workspace_created"
        ON "audit_logs" ("workspaceId", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_audit_logs_workspace_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "api_keys"`);

    await queryRunner.query(`
      ALTER TABLE "endpoints"
        DROP COLUMN IF EXISTS "responseStatusCode",
        DROP COLUMN IF EXISTS "responseBody",
        DROP COLUMN IF EXISTS "blockInvalidSignatures"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "emailVerified",
        DROP COLUMN IF EXISTS "verificationToken",
        DROP COLUMN IF EXISTS "resetToken",
        DROP COLUMN IF EXISTS "resetTokenExpiresAt",
        DROP COLUMN IF EXISTS "oauthProvider"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "passwordHash" SET NOT NULL
    `);
  }
}
