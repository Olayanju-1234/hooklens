import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { WebhookEvent } from './webhook-event.entity.js';
import { ForwardDestination } from './forward-destination.entity.js';

@Entity('forward_results')
@Index('idx_forward_results_event', ['eventId'])
export class ForwardResult {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  eventId!: string;

  // Null for attempts to the endpoint's fallback forward URL
  @Column({ type: 'uuid', nullable: true })
  destinationId!: string | null;

  // Set for deliveries reported from outside Hookdash, e.g. `cli · localhost:3000/webhooks`
  @Column({ type: 'varchar', length: 255, nullable: true })
  target!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: string;

  @Column({ type: 'integer', nullable: true })
  responseCode!: number | null;

  @Column({ type: 'text', nullable: true })
  responseBody!: string | null;

  @Column({ type: 'integer', nullable: true })
  latency!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  forwardedAt!: Date | null;

  @Column({ type: 'integer', default: 1 })
  attempt!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => WebhookEvent, (event) => event.forwardResults, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'eventId' })
  event!: WebhookEvent;

  @ManyToOne(() => ForwardDestination, (dest) => dest.results, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'destinationId' })
  destination!: ForwardDestination | null;
}
