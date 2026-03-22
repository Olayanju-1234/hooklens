import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WorkspacesService } from './workspaces.service.js';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  InviteMemberDto,
} from './dto/workspace.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { AuditService } from '../audit/audit.service.js';

@Controller('workspaces')
@UseGuards(AuthGuard('jwt'))
export class WorkspacesController {
  private readonly logger = new Logger(WorkspacesController.name);

  constructor(
    private readonly workspacesService: WorkspacesService,
    @Inject(forwardRef(() => AuditService))
    private readonly auditService: AuditService,
  ) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateWorkspaceDto) {
    return this.workspacesService.create(user.sub, dto);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.workspacesService.findAllForUser(user.sub);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.workspacesService.assertMembership(id, user.sub);
    return this.workspacesService.findOne(id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    await this.workspacesService.assertOwner(id, user.sub);
    const workspace = await this.workspacesService.update(id, dto);
    this.auditService
      .log({
        workspaceId: id,
        userId: user.sub,
        action: 'workspace.update',
        resource: 'workspace',
        resourceId: id,
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Audit log failed for workspace.update: ${(err as Error).message}`,
        );
      });
    return workspace;
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.workspacesService.assertOwner(id, user.sub);
    await this.workspacesService.remove(id);
    this.auditService
      .log({
        workspaceId: id,
        userId: user.sub,
        action: 'workspace.delete',
        resource: 'workspace',
        resourceId: id,
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Audit log failed for workspace.delete: ${(err as Error).message}`,
        );
      });
  }

  @Post(':id/invite')
  async invite(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteMemberDto,
  ) {
    await this.workspacesService.assertOwner(id, user.sub);
    const result = await this.workspacesService.invite(id, dto);
    this.auditService
      .log({
        workspaceId: id,
        userId: user.sub,
        action: 'workspace.invite',
        resource: 'workspace',
        resourceId: id,
        metadata: { invitedEmail: dto.email },
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Audit log failed for workspace.invite: ${(err as Error).message}`,
        );
      });
    return result;
  }

  @Post('accept-invite/:token')
  acceptInvite(@CurrentUser() user: JwtPayload, @Param('token') token: string) {
    return this.workspacesService.acceptInvite(token, user.sub);
  }

  @Get(':id/invites')
  async listInvites(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.workspacesService.assertOwner(id, user.sub);
    return this.workspacesService.listInvites(id);
  }

  @Delete(':id/invites/:inviteId')
  async revokeInvite(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ) {
    await this.workspacesService.assertOwner(id, user.sub);
    await this.workspacesService.revokeInvite(id, inviteId);
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.workspacesService.assertOwner(id, user.sub);
    await this.workspacesService.removeMember(id, userId);
    this.auditService
      .log({
        workspaceId: id,
        userId: user.sub,
        action: 'workspace.removeMember',
        resource: 'workspace',
        resourceId: id,
        metadata: { removedUserId: userId },
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Audit log failed for workspace.removeMember: ${(err as Error).message}`,
        );
      });
  }
}
