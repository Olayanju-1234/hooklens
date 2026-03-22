import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { WorkspacesService } from './workspaces.service.js';
import { Workspace } from '../../entities/workspace.entity.js';
import { WorkspaceMember } from '../../entities/workspace-member.entity.js';
import { WorkspaceInvite } from '../../entities/workspace-invite.entity.js';
import { EmailService } from '../email/email.service.js';

describe('WorkspacesService', () => {
  let service: WorkspacesService;

  const mockWorkspaceRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };
  const mockMemberRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
  };
  const mockInviteRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
  };
  const mockEmailService = {
    sendInvite: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: getRepositoryToken(Workspace), useValue: mockWorkspaceRepo },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: mockMemberRepo,
        },
        {
          provide: getRepositoryToken(WorkspaceInvite),
          useValue: mockInviteRepo,
        },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<WorkspacesService>(WorkspacesService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create workspace and owner membership', async () => {
      mockWorkspaceRepo.create.mockImplementation(
        (data: Partial<Workspace>) => data,
      );
      mockWorkspaceRepo.save.mockImplementation(
        (ws: Partial<Workspace>) => ({
          ...ws,
          id: 'ws-uuid',
        }),
      );
      mockMemberRepo.create.mockImplementation(
        (data: Partial<WorkspaceMember>) => data,
      );
      mockMemberRepo.save.mockResolvedValue({});

      const result = await service.create('user-1', { name: 'My Workspace' });

      expect(result.id).toBe('ws-uuid');
      expect(result.name).toBe('My Workspace');
      expect(result.slug).toMatch(/^ws_[a-f0-9]{12}$/);
      expect(mockMemberRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-uuid',
          userId: 'user-1',
          role: 'owner',
        }),
      );
      expect(mockMemberRepo.save).toHaveBeenCalled();
    });
  });

  describe('findAllForUser', () => {
    it('should return workspaces for a user', async () => {
      const workspaces = [
        { workspace: { id: 'ws-1', name: 'WS 1' } },
        { workspace: { id: 'ws-2', name: 'WS 2' } },
      ];
      mockMemberRepo.find.mockResolvedValue(workspaces);

      const result = await service.findAllForUser('user-1');

      expect(result).toEqual([
        { id: 'ws-1', name: 'WS 1' },
        { id: 'ws-2', name: 'WS 2' },
      ]);
      expect(mockMemberRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        relations: ['workspace'],
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('should return workspace when found', async () => {
      const workspace = { id: 'ws-1', name: 'Test', members: [] };
      mockWorkspaceRepo.findOne.mockResolvedValue(workspace);

      const result = await service.findOne('ws-1');
      expect(result).toEqual(workspace);
    });

    it('should throw NotFoundException when workspace not found', async () => {
      mockWorkspaceRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('ws-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update name and retentionDays', async () => {
      const workspace = { id: 'ws-1', name: 'Old Name', retentionDays: 30 };
      mockWorkspaceRepo.findOne.mockResolvedValue(workspace);
      mockWorkspaceRepo.save.mockImplementation(
        (ws: Partial<Workspace>) => ws,
      );

      const result = await service.update('ws-1', {
        name: 'New Name',
        retentionDays: 90,
      });

      expect(result.name).toBe('New Name');
      expect(result.retentionDays).toBe(90);
    });

    it('should throw NotFoundException when workspace not found', async () => {
      mockWorkspaceRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update('ws-999', { name: 'Nope' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete workspace', async () => {
      const workspace = { id: 'ws-1', name: 'Test' };
      mockWorkspaceRepo.findOne.mockResolvedValue(workspace);
      mockWorkspaceRepo.remove.mockResolvedValue(workspace);

      await service.remove('ws-1');

      expect(mockWorkspaceRepo.remove).toHaveBeenCalledWith(workspace);
    });

    it('should throw NotFoundException when workspace not found', async () => {
      mockWorkspaceRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('ws-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('invite', () => {
    it('should create invite and send email', async () => {
      mockInviteRepo.findOne.mockResolvedValue(null);
      mockInviteRepo.create.mockImplementation(
        (data: Partial<WorkspaceInvite>) => data,
      );
      mockInviteRepo.save.mockImplementation(
        (invite: Partial<WorkspaceInvite>) => ({
          ...invite,
          id: 'inv-uuid',
        }),
      );
      mockWorkspaceRepo.findOne.mockResolvedValue({
        id: 'ws-1',
        name: 'My Workspace',
      });

      const result = await service.invite('ws-1', {
        email: 'new@example.com',
      });

      expect(result.id).toBe('inv-uuid');
      expect(result.workspaceId).toBe('ws-1');
      expect(result.email).toBe('new@example.com');
      expect(result.role).toBe('member');
      expect(result.token).toBeDefined();
      expect(mockEmailService.sendInvite).toHaveBeenCalledWith(
        'new@example.com',
        'My Workspace',
        expect.any(String),
        'team@hookdash.dev',
      );
    });

    it('should throw ConflictException for duplicate invite', async () => {
      mockInviteRepo.findOne.mockResolvedValue({
        id: 'inv-existing',
        email: 'dup@example.com',
      });

      await expect(
        service.invite('ws-1', { email: 'dup@example.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('acceptInvite', () => {
    it('should accept valid invite and create membership', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 3);

      const invite = {
        id: 'inv-1',
        workspaceId: 'ws-1',
        role: 'member',
        token: 'valid-token',
        expiresAt: futureDate,
      };
      mockInviteRepo.findOne.mockResolvedValue(invite);
      mockMemberRepo.findOne.mockResolvedValue(null);
      mockMemberRepo.create.mockImplementation(
        (data: Partial<WorkspaceMember>) => data,
      );
      mockMemberRepo.save.mockImplementation(
        (m: Partial<WorkspaceMember>) => ({
          ...m,
          id: 'mem-uuid',
        }),
      );
      mockInviteRepo.remove.mockResolvedValue(invite);

      const result = await service.acceptInvite('valid-token', 'user-2');

      expect(result.workspaceId).toBe('ws-1');
      expect(result.userId).toBe('user-2');
      expect(result.role).toBe('member');
      expect(mockInviteRepo.remove).toHaveBeenCalledWith(invite);
    });

    it('should throw BadRequestException on expired invite', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const invite = {
        id: 'inv-1',
        workspaceId: 'ws-1',
        token: 'expired-token',
        expiresAt: pastDate,
      };
      mockInviteRepo.findOne.mockResolvedValue(invite);
      mockInviteRepo.remove.mockResolvedValue(invite);

      await expect(
        service.acceptInvite('expired-token', 'user-2'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when user is already a member', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 3);

      const invite = {
        id: 'inv-1',
        workspaceId: 'ws-1',
        token: 'token-abc',
        expiresAt: futureDate,
      };
      mockInviteRepo.findOne.mockResolvedValue(invite);
      mockMemberRepo.findOne.mockResolvedValue({
        id: 'mem-existing',
        workspaceId: 'ws-1',
        userId: 'user-2',
      });
      mockInviteRepo.remove.mockResolvedValue(invite);

      await expect(
        service.acceptInvite('token-abc', 'user-2'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('removeMember', () => {
    it('should remove member', async () => {
      const membership = {
        id: 'mem-1',
        workspaceId: 'ws-1',
        userId: 'user-2',
        role: 'member',
      };
      mockMemberRepo.findOne.mockResolvedValue(membership);
      mockMemberRepo.remove.mockResolvedValue(membership);

      await service.removeMember('ws-1', 'user-2');

      expect(mockMemberRepo.remove).toHaveBeenCalledWith(membership);
    });

    it('should prevent removing last owner', async () => {
      const membership = {
        id: 'mem-1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        role: 'owner',
      };
      mockMemberRepo.findOne.mockResolvedValue(membership);
      mockMemberRepo.count.mockResolvedValue(1);

      await expect(
        service.removeMember('ws-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow removing owner when other owners exist', async () => {
      const membership = {
        id: 'mem-1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        role: 'owner',
      };
      mockMemberRepo.findOne.mockResolvedValue(membership);
      mockMemberRepo.count.mockResolvedValue(2);
      mockMemberRepo.remove.mockResolvedValue(membership);

      await service.removeMember('ws-1', 'user-1');

      expect(mockMemberRepo.remove).toHaveBeenCalledWith(membership);
    });

    it('should throw NotFoundException when member not found', async () => {
      mockMemberRepo.findOne.mockResolvedValue(null);

      await expect(
        service.removeMember('ws-1', 'user-999'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertMembership', () => {
    it('should pass for member', async () => {
      mockMemberRepo.findOne.mockResolvedValue({
        id: 'mem-1',
        role: 'member',
      });

      await expect(
        service.assertMembership('ws-1', 'user-1'),
      ).resolves.toBeUndefined();
    });

    it('should throw ForbiddenException for non-member', async () => {
      mockMemberRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assertMembership('ws-1', 'user-999'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertOwner', () => {
    it('should pass for owner', async () => {
      mockMemberRepo.findOne.mockResolvedValue({
        id: 'mem-1',
        role: 'owner',
      });

      await expect(
        service.assertOwner('ws-1', 'user-1'),
      ).resolves.toBeUndefined();
    });

    it('should throw ForbiddenException for member (non-owner)', async () => {
      mockMemberRepo.findOne.mockResolvedValue({
        id: 'mem-1',
        role: 'member',
      });

      await expect(
        service.assertOwner('ws-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for non-member', async () => {
      mockMemberRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assertOwner('ws-1', 'user-999'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
