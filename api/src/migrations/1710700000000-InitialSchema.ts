import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1710700000000 implements MigrationInterface {
  name = 'InitialSchema1710700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp"
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar(255) NOT NULL,
        "passwordHash" varchar(255) NOT NULL,
        "ingressSlug" varchar(20) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "UQ_users_ingressSlug" UNIQUE ("ingressSlug"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "endpoints" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "provider" varchar(20) NOT NULL,
        "webhookSecret" varchar(255),
        "forwardUrl" text,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_endpoints" PRIMARY KEY ("id"),
        CONSTRAINT "FK_endpoints_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "webhook_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "endpointId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "method" varchar(10) NOT NULL,
        "path" text NOT NULL,
        "headers" jsonb NOT NULL,
        "body" jsonb,
        "rawBody" text,
        "sourceIp" inet,
        "receivedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "provider" varchar(20),
        "eventType" varchar(100),
        "signatureValid" boolean,
        "forwardStatus" varchar(20) NOT NULL DEFAULT 'pending',
        "forwardCode" integer,
        "forwardBody" text,
        "forwardLatency" integer,
        "forwardedAt" TIMESTAMP WITH TIME ZONE,
        "isReplay" boolean NOT NULL DEFAULT false,
        "originalEventId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_webhook_events_endpointId" FOREIGN KEY ("endpointId")
          REFERENCES "endpoints"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_events_user_time" ON "webhook_events" ("userId", "receivedAt")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_events_endpoint" ON "webhook_events" ("endpointId", "receivedAt")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_events_type" ON "webhook_events" ("userId", "eventType")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "webhook_events"`);
    await queryRunner.query(`DROP TABLE "endpoints"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
