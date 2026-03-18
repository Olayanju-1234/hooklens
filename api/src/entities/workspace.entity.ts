import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { WorkspaceMember } from './workspace-member.entity.js';
import { Endpoint } from './endpoint.entity.js';

@Entity('workspaces')
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  slug!: string;

  @Column({ type: 'integer', default: 30 })
  retentionDays!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => WorkspaceMember, (member) => member.workspace)
  members!: WorkspaceMember[];

  @OneToMany(() => Endpoint, (endpoint) => endpoint.workspace)
  endpoints!: Endpoint[];
}
