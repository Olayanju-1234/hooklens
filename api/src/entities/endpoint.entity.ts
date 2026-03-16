import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { User } from './user.entity.js';
import { WebhookEvent } from './webhook-event.entity.js';

export type Provider = 'paystack' | 'flutterwave' | 'mono' | 'custom';

@Entity('endpoints')
export class Endpoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  provider!: Provider;

  @Exclude()
  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  webhookSecret!: string | null;

  @Column({ type: 'text', nullable: true })
  forwardUrl!: string | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User, (user) => user.endpoints, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @OneToMany(() => WebhookEvent, (event) => event.endpoint)
  events!: WebhookEvent[];
}
