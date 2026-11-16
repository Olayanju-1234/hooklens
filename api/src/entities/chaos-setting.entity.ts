import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Endpoint } from './endpoint.entity.js';
import { ForwardDestination } from './forward-destination.entity.js';

export const CHAOS_SCOPES = ['test', 'all'] as const;
export type ChaosScope = (typeof CHAOS_SCOPES)[number];

/** Fault injection for one delivery target; a null destination is the endpoint's fallback forward URL. */
@Entity('chaos_settings')
@Index('idx_chaos_settings_endpoint', ['endpointId'])
export class ChaosSetting {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  workspaceId!: string;

  @Column({ type: 'uuid' })
  endpointId!: string;

  @Column({ type: 'uuid', nullable: true })
  destinationId!: string | null;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  // `test` only touches events sent from Hookdash's test payloads; `all` touches real provider traffic too
  @Column({ type: 'varchar', length: 8, default: 'test' })
  scope!: ChaosScope;

  @Column({ type: 'varchar', length: 64 })
  seed!: string;

  @Column({ type: 'real', default: 0 })
  duplicateProbability!: number;

  @Column({ type: 'smallint', default: 1 })
  duplicateCopies!: number;

  @Column({ type: 'integer', default: 5000 })
  duplicateGapMs!: number;

  @Column({ type: 'real', default: 0 })
  delayProbability!: number;

  @Column({ type: 'integer', default: 30_000 })
  delayMinMs!: number;

  @Column({ type: 'integer', default: 120_000 })
  delayMaxMs!: number;

  @Column({ type: 'real', default: 0 })
  reorderProbability!: number;

  @Column({ type: 'integer', default: 10_000 })
  reorderWindowMs!: number;

  @Column({ type: 'real', default: 0 })
  staleProbability!: number;

  @Column({ type: 'uuid', nullable: true })
  updatedBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => Endpoint, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'endpointId' })
  endpoint!: Endpoint;

  @ManyToOne(() => ForwardDestination, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'destinationId' })
  destination!: ForwardDestination | null;
}
