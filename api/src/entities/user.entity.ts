import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Endpoint } from './endpoint.entity.js';
import { WorkspaceMember } from './workspace-member.entity.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Exclude()
  @Column({ type: 'varchar', length: 255, select: false, nullable: true })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 20, unique: true })
  ingressSlug!: string;

  @Column({ type: 'boolean', default: false })
  emailVerified!: boolean;

  @Exclude()
  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  verificationToken!: string | null;

  @Exclude()
  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  resetToken!: string | null;

  @Exclude()
  @Column({ type: 'timestamptz', nullable: true, select: false })
  resetTokenExpiresAt!: Date | null;

  // Bumped on password reset/change; JWTs carrying an older value are rejected
  @Column({ type: 'integer', default: 0 })
  tokenVersion!: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  oauthProvider!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl!: string | null;

  @Column({ type: 'jsonb', nullable: true, default: null })
  notificationPreferences!: {
    emailOnFailedForward: boolean;
    emailOnSignatureFailure: boolean;
    emailOnNewMember: boolean;
  } | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => Endpoint, (endpoint) => endpoint.user)
  endpoints!: Endpoint[];

  @OneToMany(() => WorkspaceMember, (member) => member.user)
  memberships!: WorkspaceMember[];
}
