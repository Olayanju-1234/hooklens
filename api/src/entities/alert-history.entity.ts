import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AlertRule } from './alert-rule.entity.js';
import { AlertChannel } from './alert-channel.entity.js';

@Entity('alert_history')
export class AlertHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  alertRuleId!: string;

  @Column({ type: 'uuid' })
  channelId!: string;

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  sentAt!: Date;

  @ManyToOne(() => AlertRule, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alertRuleId' })
  alertRule!: AlertRule;

  @ManyToOne(() => AlertChannel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channelId' })
  channel!: AlertChannel;
}
