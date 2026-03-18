import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAllFeatures1710800000000 implements MigrationInterface {
  name = 'AddAllFeatures1710800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Workspaces ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "workspaces" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "slug" varchar(20) NOT NULL,
        "retentionDays" integer NOT NULL DEFAULT 30,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_workspaces_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_workspaces" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "workspace_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "role" varchar(20) NOT NULL DEFAULT 'member',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_workspace_members" UNIQUE ("workspaceId", "userId"),
        CONSTRAINT "PK_workspace_members" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workspace_members_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_workspace_members_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "workspace_invites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "email" varchar(255) NOT NULL,
        "role" varchar(20) NOT NULL DEFAULT 'member',
        "token" varchar(64) NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_workspace_invites_token" UNIQUE ("token"),
        CONSTRAINT "PK_workspace_invites" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workspace_invites_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);

    // Add workspaceId to endpoints and webhook_events
    await queryRunner.query(`ALTER TABLE "endpoints" ADD "workspaceId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "webhook_events" ADD "workspaceId" uuid`,
    );

    // Migrate existing data: create personal workspace per user
    await queryRunner.query(`
      INSERT INTO "workspaces" ("id", "name", "slug")
      SELECT "id", "email", "ingressSlug" FROM "users"
    `);
    await queryRunner.query(`
      INSERT INTO "workspace_members" ("workspaceId", "userId", "role")
      SELECT "id", "id", 'owner' FROM "users"
    `);
    await queryRunner.query(`UPDATE "endpoints" SET "workspaceId" = "userId"`);
    await queryRunner.query(
      `UPDATE "webhook_events" SET "workspaceId" = "userId"`,
    );

    // Now make non-nullable
    await queryRunner.query(
      `ALTER TABLE "endpoints" ALTER COLUMN "workspaceId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_events" ALTER COLUMN "workspaceId" SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "endpoints" ADD CONSTRAINT "FK_endpoints_workspace"
        FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE
    `);

    // ── Forward Destinations ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "forward_destinations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "endpointId" uuid NOT NULL,
        "url" text NOT NULL,
        "label" varchar(255),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_forward_destinations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_forward_destinations_endpoint" FOREIGN KEY ("endpointId")
          REFERENCES "endpoints"("id") ON DELETE CASCADE
      )
    `);

    // Migrate existing forwardUrl to destinations table
    await queryRunner.query(`
      INSERT INTO "forward_destinations" ("endpointId", "url", "label")
      SELECT "id", "forwardUrl", 'Primary'
      FROM "endpoints"
      WHERE "forwardUrl" IS NOT NULL
    `);

    // ── Forward Results ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "forward_results" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "eventId" uuid NOT NULL,
        "destinationId" uuid NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "responseCode" integer,
        "responseBody" text,
        "latency" integer,
        "forwardedAt" TIMESTAMP WITH TIME ZONE,
        "attempt" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_forward_results" PRIMARY KEY ("id"),
        CONSTRAINT "FK_forward_results_event" FOREIGN KEY ("eventId")
          REFERENCES "webhook_events"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_forward_results_destination" FOREIGN KEY ("destinationId")
          REFERENCES "forward_destinations"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_forward_results_event" ON "forward_results" ("eventId")
    `);

    // ── Retry config on endpoints ───────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "endpoints" ADD "retryMaxAttempts" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "endpoints" ADD "retryBackoffMs" integer NOT NULL DEFAULT 1000
    `);

    // ── Dead Letter Events ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "dead_letter_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "eventId" uuid NOT NULL,
        "endpointId" uuid NOT NULL,
        "destinationId" uuid,
        "lastAttempt" integer NOT NULL,
        "lastError" text,
        "exhaustedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dead_letter_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_dead_letter_events_event" FOREIGN KEY ("eventId")
          REFERENCES "webhook_events"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_dead_letter_events_endpoint" FOREIGN KEY ("endpointId")
          REFERENCES "endpoints"("id") ON DELETE CASCADE
      )
    `);

    // ── Idempotency columns on webhook_events ───────────────────────
    await queryRunner.query(
      `ALTER TABLE "webhook_events" ADD "bodyHash" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_events" ADD "idempotencyKey" varchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_events" ADD "isDuplicate" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_events" ADD "duplicateOfId" uuid`,
    );
    await queryRunner.query(`
      CREATE INDEX "idx_events_body_hash" ON "webhook_events" ("endpointId", "bodyHash")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_events_idempotency" ON "webhook_events" ("endpointId", "idempotencyKey")
    `);

    // ── Transform Rules ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "transform_rules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "endpointId" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "operations" jsonb NOT NULL DEFAULT '[]',
        "priority" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transform_rules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transform_rules_endpoint" FOREIGN KEY ("endpointId")
          REFERENCES "endpoints"("id") ON DELETE CASCADE
      )
    `);

    // ── Alert Channels ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "alert_channels" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "type" varchar(20) NOT NULL,
        "name" varchar(255) NOT NULL,
        "config" jsonb NOT NULL DEFAULT '{}',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_alert_channels" PRIMARY KEY ("id"),
        CONSTRAINT "FK_alert_channels_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);

    // ── Alert Rules ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "alert_rules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "type" varchar(30) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "config" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_alert_rules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_alert_rules_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "alert_rule_channels" (
        "alertRuleId" uuid NOT NULL,
        "channelId" uuid NOT NULL,
        CONSTRAINT "PK_alert_rule_channels" PRIMARY KEY ("alertRuleId", "channelId"),
        CONSTRAINT "FK_arc_rule" FOREIGN KEY ("alertRuleId")
          REFERENCES "alert_rules"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_arc_channel" FOREIGN KEY ("channelId")
          REFERENCES "alert_channels"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "alert_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "alertRuleId" uuid NOT NULL,
        "channelId" uuid NOT NULL,
        "payload" jsonb,
        "sentAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_alert_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_alert_history_rule" FOREIGN KEY ("alertRuleId")
          REFERENCES "alert_rules"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_alert_history_channel" FOREIGN KEY ("channelId")
          REFERENCES "alert_channels"("id") ON DELETE CASCADE
      )
    `);

    // ── Search indexes ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX "idx_events_body_gin" ON "webhook_events" USING gin (body jsonb_path_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_events_provider" ON "webhook_events" ("userId", "provider")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_events_workspace_time" ON "webhook_events" ("workspaceId", "receivedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_events_workspace_time"`);
    await queryRunner.query(`DROP INDEX "idx_events_provider"`);
    await queryRunner.query(`DROP INDEX "idx_events_body_gin"`);
    await queryRunner.query(`DROP TABLE "alert_history"`);
    await queryRunner.query(`DROP TABLE "alert_rule_channels"`);
    await queryRunner.query(`DROP TABLE "alert_rules"`);
    await queryRunner.query(`DROP TABLE "alert_channels"`);
    await queryRunner.query(`DROP TABLE "transform_rules"`);
    await queryRunner.query(`DROP INDEX "idx_events_idempotency"`);
    await queryRunner.query(`DROP INDEX "idx_events_body_hash"`);
    await queryRunner.query(
      `ALTER TABLE "webhook_events" DROP COLUMN "duplicateOfId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_events" DROP COLUMN "isDuplicate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_events" DROP COLUMN "idempotencyKey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_events" DROP COLUMN "bodyHash"`,
    );
    await queryRunner.query(`DROP TABLE "dead_letter_events"`);
    await queryRunner.query(
      `ALTER TABLE "endpoints" DROP COLUMN "retryBackoffMs"`,
    );
    await queryRunner.query(
      `ALTER TABLE "endpoints" DROP COLUMN "retryMaxAttempts"`,
    );
    await queryRunner.query(`DROP INDEX "idx_forward_results_event"`);
    await queryRunner.query(`DROP TABLE "forward_results"`);
    await queryRunner.query(`DROP TABLE "forward_destinations"`);
    await queryRunner.query(
      `ALTER TABLE "endpoints" DROP CONSTRAINT "FK_endpoints_workspace"`,
    );
    await queryRunner.query(
      `ALTER TABLE "endpoints" DROP COLUMN "workspaceId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_events" DROP COLUMN "workspaceId"`,
    );
    await queryRunner.query(`DROP TABLE "workspace_invites"`);
    await queryRunner.query(`DROP TABLE "workspace_members"`);
    await queryRunner.query(`DROP TABLE "workspaces"`);
  }
}
