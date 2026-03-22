import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Workspace } from '../../entities/workspace.entity.js';
import { WorkspaceMember } from '../../entities/workspace-member.entity.js';
import { WorkspaceInvite } from '../../entities/workspace-invite.entity.js';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  InviteMemberDto,
} from './dto/workspace.dto.js';
import { EmailService } from '../email/email.service.js';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(WorkspaceInvite)
    private readonly inviteRepo: Repository<WorkspaceInvite>,
    private readonly emailService: EmailService,
  ) {}

  async create(userId: string, dto: CreateWorkspaceDto): Promise<Workspace> {
    const slug = `ws_${randomBytes(6).toString('hex')}`;

    const workspace = this.workspaceRepo.create({
      name: dto.name,
      slug,
    });
    const saved = await this.workspaceRepo.save(workspace);

    const membership = this.memberRepo.create({
      workspaceId: saved.id,
      userId,
      role: 'owner',
    });
    await this.memberRepo.save(membership);

    this.logger.log(
      `Workspace created: ${saved.id} (slug=${slug}) by user ${userId}`,
    );
    return saved;
  }

  async findAllForUser(userId: string): Promise<Workspace[]> {
    const memberships = await this.memberRepo.find({
      where: { userId },
      relations: ['workspace'],
      order: { createdAt: 'DESC' },
    });
    return memberships.map((m) => m.workspace);
  }

  async findOne(workspaceId: string): Promise<Workspace> {
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
      relations: ['members', 'members.user'],
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    return workspace;
  }

  async update(
    workspaceId: string,
    dto: UpdateWorkspaceDto,
  ): Promise<Workspace> {
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    if (dto.name !== undefined) {
      workspace.name = dto.name;
    }
    if (dto.retentionDays !== undefined) {
      workspace.retentionDays = dto.retentionDays;
    }
    const saved = await this.workspaceRepo.save(workspace);
    this.logger.log(`Workspace updated: ${workspaceId}`);
    return saved;
  }

  async remove(workspaceId: string): Promise<void> {
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    await this.workspaceRepo.remove(workspace);
    this.logger.log(`Workspace deleted: ${workspaceId}`);
  }

  async invite(
    workspaceId: string,
    dto: InviteMemberDto,
  ): Promise<WorkspaceInvite> {
    const existing = await this.inviteRepo.findOne({
      where: { workspaceId, email: dto.email },
    });
    if (existing) {
      throw new ConflictException(
        'An invite already exists for this email in this workspace',
      );
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = this.inviteRepo.create({
      workspaceId,
      email: dto.email,
      role: dto.role ?? 'member',
      token,
      expiresAt,
    });
    const saved = await this.inviteRepo.save(invite);

    // Send invite email
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });
    this.emailService
      .sendInvite(
        dto.email,
        workspace?.name ?? 'Hookdash Workspace',
        token,
        'team@hookdash.dev',
      )
      .catch((err: Error) => {
        this.logger.error(
          `Failed to send invite email to ${dto.email}: ${err.message}`,
        );
      });

    this.logger.log(
      `Invite created for ${dto.email} in workspace ${workspaceId}`,
    );
    return saved;
  }

  async acceptInvite(token: string, userId: string): Promise<WorkspaceMember> {
    const invite = await this.inviteRepo.findOne({ where: { token } });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    if (new Date() > invite.expiresAt) {
      await this.inviteRepo.remove(invite);
      throw new BadRequestException('Invite has expired');
    }

    const existingMembership = await this.memberRepo.findOne({
      where: { workspaceId: invite.workspaceId, userId },
    });
    if (existingMembership) {
      await this.inviteRepo.remove(invite);
      throw new ConflictException('User is already a member of this workspace');
    }

    const membership = this.memberRepo.create({
      workspaceId: invite.workspaceId,
      userId,
      role: invite.role as 'owner' | 'member',
    });
    const saved = await this.memberRepo.save(membership);
    await this.inviteRepo.remove(invite);

    this.logger.log(
      `Invite accepted: user ${userId} joined workspace ${invite.workspaceId}`,
    );
    return saved;
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const membership = await this.memberRepo.findOne({
      where: { workspaceId, userId },
    });
    if (!membership) {
      throw new NotFoundException('Member not found');
    }

    if (membership.role === 'owner') {
      const ownerCount = await this.memberRepo.count({
        where: { workspaceId, role: 'owner' },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException(
          'Cannot remove the last owner of a workspace',
        );
      }
    }

    await this.memberRepo.remove(membership);
    this.logger.log(`Member ${userId} removed from workspace ${workspaceId}`);
  }

  async listInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
    return this.inviteRepo.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  async revokeInvite(workspaceId: string, inviteId: string): Promise<void> {
    const invite = await this.inviteRepo.findOne({
      where: { id: inviteId, workspaceId },
    });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    await this.inviteRepo.remove(invite);
    this.logger.log(`Invite ${inviteId} revoked in workspace ${workspaceId}`);
  }

  async assertMembership(workspaceId: string, userId: string): Promise<void> {
    const membership = await this.memberRepo.findOne({
      where: { workspaceId, userId },
    });
    if (!membership) {
      throw new ForbiddenException('Not a member of this workspace');
    }
  }

  async assertOwner(workspaceId: string, userId: string): Promise<void> {
    const membership = await this.memberRepo.findOne({
      where: { workspaceId, userId },
    });
    if (!membership || membership.role !== 'owner') {
      throw new ForbiddenException('Owner access required');
    }
  }
}
