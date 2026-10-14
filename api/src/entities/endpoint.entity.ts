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
import { Workspace } from './workspace.entity.js';
import { ForwardDestination } from './forward-destination.entity.js';
import { TransformRule } from './transform-rule.entity.js';

export const PROVIDERS = [
  'stripe',
  'paystack',
  'flutterwave',
  'mono',
  'bags',
  'github',
  'shopify',
  'standard-webhooks',
  'clerk',
  'resend',
  'openai',
  'custom',
] as const;

export type Provider = (typeof PROVIDERS)[number];

@Entity('endpoints')
export class Endpoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Per-source ingress URL: /in/<ingressSlug>
  @Column({ type: 'varchar', length: 32, unique: true })
  ingressSlug!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  workspaceId!: string;

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

  @Column({ type: 'integer', default: 0 })
  retryMaxAttempts!: number;

  @Column({ type: 'integer', default: 1000 })
  retryBackoffMs!: number;

  @Column({ type: 'integer', default: 200 })
  responseStatusCode!: number;

  @Column({ type: 'text', nullable: true })
  responseBody!: string | null;

  @Column({ type: 'boolean', default: false })
  blockInvalidSignatures!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User, (user) => user.endpoints, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @ManyToOne(() => Workspace, (workspace) => workspace.endpoints, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workspaceId' })
  workspace!: Workspace;

  @OneToMany(() => WebhookEvent, (event) => event.endpoint)
  events!: WebhookEvent[];

  @OneToMany(() => ForwardDestination, (dest) => dest.endpoint)
  destinations!: ForwardDestination[];

  @OneToMany(() => TransformRule, (rule) => rule.endpoint)
  transformRules!: TransformRule[];
}
