import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
} from './dto/auth.dto.js';
import { EmailService } from '../email/email.service.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async signup(
    dto: SignupDto,
  ): Promise<{ accessToken: string; ingressSlug: string }> {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const ingressSlug = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
      ingressSlug,
      verificationToken,
    });
    await this.userRepo.save(user);

    // Create default workspace for the user
    const workspace = this.workspaceRepo.create({
      name: 'My Workspace',
      slug: `ws_${crypto.randomBytes(6).toString('hex')}`,
    });
    const savedWorkspace = await this.workspaceRepo.save(workspace);

    const membership = this.memberRepo.create({
      workspaceId: savedWorkspace.id,
      userId: user.id,
      role: 'owner',
    });
    await this.memberRepo.save(membership);

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
      .where('user.email = :email', { email: dto.email })
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
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
    });

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
    await this.userRepo.update(user.id, {
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
      createdAt: user.createdAt,
    };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ success: boolean }> {
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
    await this.userRepo.update(userId, { passwordHash: newHash });

    this.logger.log(`Password changed for user ${userId}`);
    return { success: true };
  }

  async findOrCreateOAuthUser(profile: {
    email: string;
    provider: string;
  }): Promise<{ accessToken: string; ingressSlug: string }> {
    let user = await this.userRepo.findOne({
      where: { email: profile.email },
    });

    if (!user) {
      const ingressSlug = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      user = this.userRepo.create({
        email: profile.email,
        ingressSlug,
        oauthProvider: profile.provider,
        emailVerified: true,
        passwordHash: null,
      });
      await this.userRepo.save(user);

      // Create default workspace
      const workspace = this.workspaceRepo.create({
        name: 'My Workspace',
        slug: `ws_${crypto.randomBytes(6).toString('hex')}`,
      });
      const savedWorkspace = await this.workspaceRepo.save(workspace);

      const membership = this.memberRepo.create({
        workspaceId: savedWorkspace.id,
        userId: user.id,
        role: 'owner',
      });
      await this.memberRepo.save(membership);

      this.logger.log(`OAuth user created: ${user.id} (${profile.provider})`);
    }

    const accessToken = this.generateToken(user);
    return { accessToken, ingressSlug: user.ingressSlug };
  }

  private generateToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
    });
  }
}
