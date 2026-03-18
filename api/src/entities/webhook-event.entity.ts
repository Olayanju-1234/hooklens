import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Endpoint } from './endpoint.entity.js';
import { ForwardResult } from './forward-result.entity.js';

export type ForwardStatus =
  | 'pending'
  | 'forwarded'
  | 'failed'
  | 'skipped'
  | 'blocked';

@Entity('webhook_events')
@Index('idx_events_user_time', ['userId', 'receivedAt'])
@Index('idx_events_endpoint', ['endpointId', 'receivedAt'])
@Index('idx_events_type', ['userId', 'eventType'])
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  endpointId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  workspaceId!: string;

  // Inbound data
  @Column({ type: 'varchar', length: 10 })
  method!: string;

  @Column({ type: 'text' })
  path!: string;

  @Column({ type: 'jsonb' })
  headers!: Record<string, string>;

  @Column({ type: 'jsonb', nullable: true })
  body!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  rawBody!: string | null;

  @Column({ type: 'inet', nullable: true })
  sourceIp!: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  receivedAt!: Date;

  // Parsed
  @Column({ type: 'varchar', length: 20, nullable: true })
  provider!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  eventType!: string | null;

  @Column({ type: 'boolean', nullable: true })
  signatureValid!: boolean | null;

  // Forward result
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  forwardStatus!: ForwardStatus;

  @Column({ type: 'int', nullable: true })
  forwardCode!: number | null;

  @Column({ type: 'text', nullable: true })
  forwardBody!: string | null;

  @Column({ type: 'int', nullable: true })
  forwardLatency!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  forwardedAt!: Date | null;

  // Replay tracking
  @Column({ type: 'boolean', default: false })
  isReplay!: boolean;

  @Column({ type: 'uuid', nullable: true })
  originalEventId!: string | null;

  // Deduplication
  @Column({ type: 'varchar', length: 64, nullable: true })
  bodyHash!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'boolean', default: false })
  isDuplicate!: boolean;

  @Column({ type: 'uuid', nullable: true })
  duplicateOfId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Endpoint, (endpoint) => endpoint.events, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'endpointId' })
  endpoint!: Endpoint;

  @OneToMany(() => ForwardResult, (result) => result.event)
  forwardResults!: ForwardResult[];
}
