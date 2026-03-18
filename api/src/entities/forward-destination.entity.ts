import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Endpoint } from './endpoint.entity.js';
import { ForwardResult } from './forward-result.entity.js';

@Entity('forward_destinations')
export class ForwardDestination {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  endpointId!: string;

  @Column({ type: 'text' })
  url!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  label!: string | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Endpoint, (endpoint) => endpoint.destinations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'endpointId' })
  endpoint!: Endpoint;

  @OneToMany(() => ForwardResult, (result) => result.destination)
  results!: ForwardResult[];
}
