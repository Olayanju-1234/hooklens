import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Endpoint } from './endpoint.entity.js';
import { ForwardDestination } from './forward-destination.entity.js';

/** One run of a scripted chaos scenario against one delivery target. */
@Entity('chaos_runs')
@Index('idx_chaos_runs_endpoint', ['endpointId', 'createdAt'])
export class ChaosRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  workspaceId!: string;

  @Column({ type: 'uuid' })
  endpointId!: string;

  // Null when the run targeted the endpoint's fallback forward URL
  @Column({ type: 'uuid', nullable: true })
  destinationId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  scenarioId!: string;

  @Column({ type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Endpoint, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'endpointId' })
  endpoint!: Endpoint;

  @ManyToOne(() => ForwardDestination, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'destinationId' })
  destination!: ForwardDestination | null;
}
