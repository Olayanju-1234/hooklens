import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WebhookEvent } from './webhook-event.entity.js';
import { Endpoint } from './endpoint.entity.js';

@Entity('dead_letter_events')
export class DeadLetterEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  eventId!: string;

  @Column({ type: 'uuid' })
  endpointId!: string;

  @Column({ type: 'uuid', nullable: true })
  destinationId!: string | null;

  @Column({ type: 'integer' })
  lastAttempt!: number;

  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  exhaustedAt!: Date;

  @ManyToOne(() => WebhookEvent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event!: WebhookEvent;

  @ManyToOne(() => Endpoint, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'endpointId' })
  endpoint!: Endpoint;
}
