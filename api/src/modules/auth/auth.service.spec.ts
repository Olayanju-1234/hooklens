import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
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
        {
          provide: getRepositoryToken(Workspace),
          useValue: mockWorkspaceRepo,
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: mockMemberRepo,
        },
        { provide: JwtService, useValue: mockJwtService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    mockUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.addSelect.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
  });

  describe('signup', () => {
    it('should create a user and return access token + ingress slug', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
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

      const result = await service.signup({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('mock_jwt_token');
      expect(result.ingressSlug).toMatch(/^usr_[a-f0-9]{12}$/);
      expect(mockUserRepo.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce({ id: 'existing' });

      await expect(
        service.signup({ email: 'Taken@Example.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
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
