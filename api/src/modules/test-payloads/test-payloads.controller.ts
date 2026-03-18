import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Logger,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { TestPayloadsService } from './test-payloads.service.js';

@Controller('test-payloads')
@UseGuards(AuthGuard('jwt'))
export class TestPayloadsController {
  private readonly logger = new Logger(TestPayloadsController.name);

  constructor(
    private readonly testPayloadsService: TestPayloadsService,
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  @Get()
  getProviders() {
    return this.testPayloadsService.getProviders();
  }

  @Get(':provider')
  getEventTypes(
    @CurrentUser() _user: JwtPayload,
    @Param('provider') provider: string,
  ) {
    return this.testPayloadsService.getEventTypes(provider);
  }

  @Get(':provider/:eventType')
  getPayload(
    @CurrentUser() _user: JwtPayload,
    @Param('provider') provider: string,
    @Param('eventType') eventType: string,
  ) {
    return this.testPayloadsService.getPayload(provider, eventType);
  }

  @Post(':provider/:eventType/send')
  async sendTestPayload(
    @CurrentUser() jwtUser: JwtPayload,
    @Param('provider') provider: string,
    @Param('eventType') eventType: string,
  ) {
    const testPayload = this.testPayloadsService.getPayload(
      provider,
      eventType,
    );

    const user = await this.userRepo.findOne({ where: { id: jwtUser.sub } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const port = this.configService.get<number>('port') ?? 3000;
    const baseUrl = `http://localhost:${port}`;
    const ingressUrl = `${baseUrl}/api/in/${user.ingressSlug}`;

    try {
      const response = await fetch(ingressUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload.payload),
      });

      const responseBody = (await response.json()) as Record<string, unknown>;

      this.logger.log(
        `Test payload sent: ${provider}/${eventType} to ${ingressUrl} for user ${jwtUser.sub}`,
      );

      return {
        sent: true,
        provider,
        eventType,
        ingressUrl,
        responseStatus: response.status,
        responseBody,
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Failed to send test payload: ${message}`);
      throw new HttpException(
        `Failed to send test payload: ${message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
