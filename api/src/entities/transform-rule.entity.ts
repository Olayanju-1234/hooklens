import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Endpoint } from './endpoint.entity.js';

@Entity('transform_rules')
export class TransformRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  endpointId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'jsonb', default: [] })
  operations!: unknown[];

  @Column({ type: 'integer', default: 0 })
  priority!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Endpoint, (endpoint) => endpoint.transformRules, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'endpointId' })
  endpoint!: Endpoint;
}
