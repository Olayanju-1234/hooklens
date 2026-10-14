import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { User } from '../../entities/user.entity.js';
import { Workspace } from '../../entities/workspace.entity.js';
import { WorkspaceMember } from '../../entities/workspace-member.entity.js';
import { EmailService } from '../email/email.service.js';

describe('AuthService', () => {
  let service: AuthService;

  const mockQueryBuilder = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };
  const mockWorkspaceRepo = {
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockMemberRepo = {
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockManager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === User) return mockUserRepo;
      if (entity === Workspace) return mockWorkspaceRepo;
      return mockMemberRepo;
    }),
  };
  const mockDataSource = {
    transaction: jest.fn(
      (work: (manager: typeof mockManager) => Promise<unknown>) =>
        work(mockManager),
    ),
  };
  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock_jwt_token'),
  };
  const mockEmailService = {
    sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: JwtService, useValue: mockJwtService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    mockUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.addSelect.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.update.mockReturnThis();
    mockQueryBuilder.set.mockReturnThis();
    mockQueryBuilder.returning.mockReturnThis();
  });

  function mockAccountInserts() {
    mockUserRepo.create.mockImplementation((data: Partial<User>) => data);
    mockUserRepo.save.mockImplementation((user: Partial<User>) => ({
      ...user,
      id: 'user-uuid',
    }));
    mockWorkspaceRepo.create.mockImplementation(
      (data: Partial<Workspace>) => data,
    );
    mockWorkspaceRepo.save.mockImplementation((ws: Partial<Workspace>) => ({
      ...ws,
      id: 'ws-uuid',
    }));
    mockMemberRepo.create.mockImplementation(
      (data: Partial<WorkspaceMember>) => data,
    );
    mockMemberRepo.save.mockResolvedValue({});
  }

  function revocationChanges(): Record<string, unknown> {
    const [[changes]] = mockQueryBuilder.set.mock.calls as [
      [Record<string, unknown>],
    ];
    return changes;
  }

  function mockBumpedVersion(tokenVersion: number) {
    mockQueryBuilder.execute.mockResolvedValue({ raw: [{ tokenVersion }] });
  }

  describe('signup', () => {
    it('should create a user and return access token + ingress slug', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);
      mockAccountInserts();

      const result = await service.signup({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('mock_jwt_token');
      expect(result.ingressSlug).toMatch(/^usr_[a-f0-9]{12}$/);
      expect(mockUserRepo.save).toHaveBeenCalled();
      expect(mockMemberRepo.create).toHaveBeenCalledWith({
        workspaceId: 'ws-uuid',
        userId: 'user-uuid',
        role: 'owner',
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'user-uuid',
        email: 'test@example.com',
        ver: 0,
      });
    });

    it('creates user, workspace and membership inside one transaction', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);
      mockAccountInserts();

      await service.signup({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockManager.getRepository).toHaveBeenCalledWith(User);
      expect(mockManager.getRepository).toHaveBeenCalledWith(Workspace);
      expect(mockManager.getRepository).toHaveBeenCalledWith(WorkspaceMember);
    });

    it('propagates a failed membership insert so the transaction rolls back', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);
      mockAccountInserts();
      mockMemberRepo.save.mockRejectedValueOnce(new Error('insert failed'));

      await expect(
        service.signup({ email: 'test@example.com', password: 'password123' }),
      ).rejects.toThrow('insert failed');
      expect(mockEmailService.sendEmailVerification).not.toHaveBeenCalled();
    });

    it('maps a concurrent duplicate-email insert to ConflictException', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);
      mockAccountInserts();
      mockUserRepo.save.mockRejectedValueOnce(
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('duplicate key'), { code: '23505' }),
        ),
      );

      await expect(
        service.signup({ email: 'test@example.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if email already exists', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce({ id: 'existing' });

      await expect(
        service.signup({ email: 'Taken@Example.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('resetPassword', () => {
    it('bumps tokenVersion so existing sessions are revoked', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce({
        id: 'user-uuid',
        resetTokenExpiresAt: new Date(Date.now() + 60_000),
      });
      mockBumpedVersion(1);

      await expect(
        service.resetPassword({ token: 'tok', newPassword: 'newpass123' }),
      ).resolves.toEqual({ success: true });

      const changes = revocationChanges();
      expect(changes.resetToken).toBeNull();
      expect(changes.resetTokenExpiresAt).toBeNull();
      expect(typeof changes.passwordHash).toBe('string');
      expect((changes.tokenVersion as () => string)()).toBe(
        '"tokenVersion" + 1',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('id = :id', {
        id: 'user-uuid',
      });
    });

    it('does not touch the user for an expired reset token', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce({
        id: 'user-uuid',
        resetTokenExpiresAt: new Date(Date.now() - 1),
      });

      await expect(
        service.resetPassword({ token: 'tok', newPassword: 'newpass123' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockQueryBuilder.execute).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('revokes other sessions and returns a token for the new version', async () => {
      const hash = await bcrypt.hash('oldpass123', 4);
      mockQueryBuilder.getOne.mockResolvedValueOnce({
        id: 'user-uuid',
        email: 'test@example.com',
        passwordHash: hash,
        tokenVersion: 2,
      });
      mockBumpedVersion(3);

      const result = await service.changePassword('user-uuid', {
        currentPassword: 'oldpass123',
        newPassword: 'newpass123',
      });

      expect(result).toEqual({ success: true, accessToken: 'mock_jwt_token' });
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'user-uuid',
        email: 'test@example.com',
        ver: 3,
      });
      const changes = revocationChanges();
      expect((changes.tokenVersion as () => string)()).toBe(
        '"tokenVersion" + 1',
      );
    });

    it('keeps the version when the current password is wrong', async () => {
      const hash = await bcrypt.hash('oldpass123', 4);
      mockQueryBuilder.getOne.mockResolvedValueOnce({
        id: 'user-uuid',
        email: 'test@example.com',
        passwordHash: hash,
        tokenVersion: 2,
      });

      await expect(
        service.changePassword('user-uuid', {
          currentPassword: 'wrong',
          newPassword: 'newpass123',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockQueryBuilder.execute).not.toHaveBeenCalled();
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });
  });

  describe('findOrCreateOAuthUser', () => {
    it('revokes sessions of whoever registered the address unverified', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce({
        id: 'user-uuid',
        email: 'victim@example.com',
        emailVerified: false,
        tokenVersion: 0,
        ingressSlug: 'usr_abc123def456',
      });
      mockBumpedVersion(1);

      await service.findOrCreateOAuthUser({
        email: 'victim@example.com',
        provider: 'google',
      });

      const changes = revocationChanges();
      expect(changes).toMatchObject({
        emailVerified: true,
        passwordHash: null,
        oauthProvider: 'google',
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'user-uuid',
        email: 'victim@example.com',
        ver: 1,
      });
    });

    it('creates a new OAuth account in one transaction', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);
      mockAccountInserts();

      const result = await service.findOrCreateOAuthUser({
        email: 'New@Example.com',
        provider: 'github',
      });

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockUserRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          oauthProvider: 'github',
          emailVerified: true,
          passwordHash: null,
        }),
      );
      expect(result.ingressSlug).toMatch(/^usr_[a-f0-9]{12}$/);
    });
  });

  describe('login', () => {
    it('should return token for valid credentials', async () => {
      const hash = await bcrypt.hash('password123', 12);
      mockQueryBuilder.getOne.mockResolvedValue({
        id: 'user-uuid',
        email: 'test@example.com',
        passwordHash: hash,
        ingressSlug: 'usr_abc123def456',
      });

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('mock_jwt_token');
      expect(result.ingressSlug).toBe('usr_abc123def456');
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const hash = await bcrypt.hash('password123', 12);
      mockQueryBuilder.getOne.mockResolvedValue({
        id: 'user-uuid',
        email: 'test@example.com',
        passwordHash: hash,
      });

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
