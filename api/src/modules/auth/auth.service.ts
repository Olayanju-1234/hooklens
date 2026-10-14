import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, DeepPartial, QueryFailedError, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '../../entities/user.entity.js';
import { Workspace } from '../../entities/workspace.entity.js';
import { WorkspaceMember } from '../../entities/workspace-member.entity.js';
import {
  SignupDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
  ChangePasswordDto,
  UpdateAvatarDto,
  UpdateNotificationPreferencesDto,
} from './dto/auth.dto.js';
import { EmailService } from '../email/email.service.js';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async signup(
    dto: SignupDto,
  ): Promise<{ accessToken: string; ingressSlug: string }> {
    const email = normalizeEmail(dto.email);
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const ingressSlug = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const verificationToken = crypto.randomBytes(32).toString('hex');

    let user: User;
    try {
      user = await this.createAccount({
        email,
        passwordHash,
        ingressSlug,
        verificationToken,
      });
    } catch (err: unknown) {
      // A concurrent signup for the same address lost the race on the unique index
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }

    // Send verification email (non-blocking)
    this.emailService
      .sendEmailVerification(user.email, verificationToken)
      .catch((err: Error) => {
        this.logger.error(
          `Failed to send verification email to ${user.email}: ${err.message}`,
        );
      });

    this.logger.log(`User registered: ${user.id}`);

    const accessToken = this.generateToken(user);
    return { accessToken, ingressSlug };
  }

  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; ingressSlug: string }> {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('LOWER(user.email) = :email', { email: normalizeEmail(dto.email) })
      .getOne();
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses OAuth login. Please sign in with your provider.',
      );
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.generateToken(user);
    return { accessToken, ingressSlug: user.ingressSlug };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ sent: boolean }> {
    if (!this.emailService.isConfigured()) {
      throw new ServiceUnavailableException(
        'Password reset by email is not available right now. Sign in with Google or GitHub, or contact support.',
      );
    }

    const user = await this.findByEmail(normalizeEmail(dto.email));

    // Always return success to prevent email enumeration
    if (!user) {
      return { sent: true };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.userRepo.update(user.id, {
      resetToken,
      resetTokenExpiresAt,
    });

    await this.emailService.sendPasswordReset(user.email, resetToken);

    this.logger.log(`Password reset requested for user ${user.id}`);
    return { sent: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ success: boolean }> {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.resetToken')
      .addSelect('user.resetTokenExpiresAt')
      .where('user.resetToken = :token', { token: dto.token })
      .getOne();

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (!user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.updateAndRevokeSessions(user.id, {
      passwordHash,
      resetToken: null,
      resetTokenExpiresAt: null,
    });

    this.logger.log(`Password reset completed for user ${user.id}`);
    return { success: true };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ success: boolean }> {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.verificationToken')
      .where('user.verificationToken = :token', { token: dto.token })
      .getOne();

    if (!user) {
      throw new NotFoundException('Invalid verification token');
    }

    await this.userRepo.update(user.id, {
      emailVerified: true,
      verificationToken: null,
    });

    this.logger.log(`Email verified for user ${user.id}`);
    return { success: true };
  }

  async getProfile(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      email: user.email,
      ingressSlug: user.ingressSlug,
      emailVerified: user.emailVerified,
      oauthProvider: user.oauthProvider,
      avatarUrl: user.avatarUrl,
      notificationPreferences: user.notificationPreferences ?? {
        emailOnFailedForward: true,
        emailOnSignatureFailure: true,
        emailOnNewMember: false,
      },
      createdAt: user.createdAt,
    };
  }

  async updateAvatar(
    userId: string,
    dto: UpdateAvatarDto,
  ): Promise<{ avatarUrl: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.userRepo.update(userId, { avatarUrl: dto.avatarUrl });
    this.logger.log(`Avatar updated for user ${userId}`);
    return { avatarUrl: dto.avatarUrl };
  }

  async removeAvatar(userId: string): Promise<{ success: boolean }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.userRepo.update(userId, { avatarUrl: null });
    this.logger.log(`Avatar removed for user ${userId}`);
    return { success: true };
  }

  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const current = user.notificationPreferences ?? {
      emailOnFailedForward: true,
      emailOnSignatureFailure: true,
      emailOnNewMember: false,
    };

    const merged = { ...current, ...dto };
    await this.userRepo.update(userId, { notificationPreferences: merged });
    this.logger.log(`Notification preferences updated for user ${userId}`);
    return merged;
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ success: boolean; accessToken: string }> {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) throw new NotFoundException('User not found');

    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account uses OAuth login. Password cannot be changed.',
      );
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    const tokenVersion = await this.updateAndRevokeSessions(userId, {
      passwordHash: newHash,
    });

    this.logger.log(`Password changed for user ${userId}`);
    // Other sessions are revoked; hand the caller a token for the new version
    return {
      success: true,
      accessToken: this.generateToken({ ...user, tokenVersion }),
    };
  }

  async findOrCreateOAuthUser(profile: {
    email: string;
    provider: string;
  }): Promise<{ accessToken: string; ingressSlug: string }> {
    const email = normalizeEmail(profile.email);
    let user = await this.findByEmail(email);

    if (user && !user.emailVerified) {
      // The provider just proved ownership; drop any password and sessions held by whoever registered it unverified
      user.tokenVersion = await this.updateAndRevokeSessions(user.id, {
        emailVerified: true,
        verificationToken: null,
        passwordHash: null,
        oauthProvider: profile.provider,
      });
      this.logger.warn(
        `OAuth sign-in verified unverified account ${user.id}; password login removed`,
      );
    }

    if (!user) {
      const ingressSlug = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      user = await this.createAccount({
        email,
        ingressSlug,
        oauthProvider: profile.provider,
        emailVerified: true,
        passwordHash: null,
      });

      this.logger.log(`OAuth user created: ${user.id} (${profile.provider})`);
    }

    const accessToken = this.generateToken(user);
    return { accessToken, ingressSlug: user.ingressSlug };
  }

  private findByEmail(email: string): Promise<User | null> {
    return this.userRepo
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email })
      .getOne();
  }

  // User, default workspace and owner membership land together or not at all
  private createAccount(fields: DeepPartial<User>): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const workspaces = manager.getRepository(Workspace);
      const members = manager.getRepository(WorkspaceMember);

      const user = await users.save(users.create(fields));
      const workspace = await workspaces.save(
        workspaces.create({
          name: 'My Workspace',
          slug: `ws_${crypto.randomBytes(6).toString('hex')}`,
        }),
      );
      await members.save(
        members.create({
          workspaceId: workspace.id,
          userId: user.id,
          role: 'owner',
        }),
      );
      return user;
    });
  }

  // Atomic increment so concurrent resets can't both land on the same version
  private async updateAndRevokeSessions(
    userId: string,
    changes: Partial<
      Pick<
        User,
        | 'passwordHash'
        | 'resetToken'
        | 'resetTokenExpiresAt'
        | 'emailVerified'
        | 'verificationToken'
        | 'oauthProvider'
      >
    >,
  ): Promise<number> {
    const result = await this.userRepo
      .createQueryBuilder()
      .update()
      .set({ ...changes, tokenVersion: () => '"tokenVersion" + 1' })
      .where('id = :id', { id: userId })
      .returning(['tokenVersion'])
      .execute();
    const rows = result.raw as Array<{ tokenVersion: number }>;
    return rows[0].tokenVersion;
  }

  private generateToken(
    user: Pick<User, 'id' | 'email' | 'tokenVersion'>,
  ): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      ver: user.tokenVersion ?? 0,
    });
  }
}
