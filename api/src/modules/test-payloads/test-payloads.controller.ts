import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Logger,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { CombinedAuthGuard } from '../auth/guards/auth.guard.js';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { User } from '../../entities/user.entity.js';
import { Endpoint, type Provider } from '../../entities/endpoint.entity.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { TestPayloadsService } from './test-payloads.service.js';
import { IngressService } from '../ingress/ingress.service.js';
import { ingressResponseBody } from '../ingress/ingress-response.js';

@ApiTags('Test Payloads')
@ApiBearerAuth()
@Controller('test-payloads')
@UseGuards(CombinedAuthGuard)
export class TestPayloadsController {
  private readonly logger = new Logger(TestPayloadsController.name);

  constructor(
    private readonly testPayloadsService: TestPayloadsService,
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Endpoint)
    private readonly endpointRepo: Repository<Endpoint>,
    private readonly ingressService: IngressService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List available test payload providers' })
  @ApiResponse({ status: 200, description: 'Returns list of providers' })
  getProviders() {
    return this.testPayloadsService.getProviders();
  }

  @Get(':provider')
  @ApiOperation({ summary: 'List event types for a provider' })
  @ApiResponse({ status: 200, description: 'Returns list of event types' })
  @ApiParam({ name: 'provider', type: String })
  getEventTypes(
    @CurrentUser() _user: JwtPayload,
    @Param('provider') provider: string,
  ) {
    return this.testPayloadsService.getEventTypes(provider);
  }

  @Get(':provider/:eventType')
  @ApiOperation({ summary: 'Get a specific test payload' })
  @ApiResponse({ status: 200, description: 'Returns the test payload' })
  @ApiParam({ name: 'provider', type: String })
  @ApiParam({ name: 'eventType', type: String })
  getPayload(
    @CurrentUser() _user: JwtPayload,
    @Param('provider') provider: string,
    @Param('eventType') eventType: string,
  ) {
    return this.testPayloadsService.getPayload(provider, eventType);
  }

  @Post(':provider/:eventType/send')
  @ApiOperation({ summary: 'Send a test payload to the ingress endpoint' })
  @ApiResponse({ status: 201, description: 'Test payload sent successfully' })
  @ApiParam({ name: 'provider', type: String })
  @ApiParam({ name: 'eventType', type: String })
  async sendTestPayload(
    @CurrentUser() jwtUser: JwtPayload,
    @Param('provider') provider: string,
    @Param('eventType') eventType: string,
    @Body() body: Record<string, unknown>,
  ) {
    // Use custom body if provided, otherwise fall back to template payload
    const payload =
      body && Object.keys(body).length > 0
        ? body
        : this.testPayloadsService.getPayload(provider, eventType).payload;

    const user = await this.userRepo.findOne({ where: { id: jwtUser.sub } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const port = this.configService.get<number>('port') ?? 3000;
    const baseUrl = `http://localhost:${port}`;
    // Route to this provider's endpoint when there is one, else the shared slug URL
    const endpoint = await this.endpointRepo.findOne({
      where: {
        userId: user.id,
        provider: provider as Provider,
        isActive: true,
      },
      order: { createdAt: 'DESC' },
    });
    const slug = endpoint ? endpoint.ingressSlug : user.ingressSlug;
    // Ingress route is excluded from global 'api' prefix — must NOT include /api/
    const ingressUrl = `${baseUrl}/in/${slug}`;

    try {
      // In-process rather than over HTTP, so only Hookdash itself can mark an event as a test
      const resolved = await this.ingressService.resolveEndpoint(slug, {
        headers: {},
      });
      if (!resolved) {
        return {
          sent: true,
          provider,
          eventType,
          ingressUrl,
          eventId: null,
          responseStatus: 200,
          responseBody: { status: 'ok' },
        };
      }

      const rawBody = JSON.stringify(payload);
      const event = await this.ingressService.capture({
        endpointId: resolved.endpoint.id,
        userId: resolved.userId,
        method: 'POST',
        path: `/in/${slug}`,
        headers: { 'content-type': 'application/json' },
        rawBody,
        body: payload,
        sourceIp: null,
        isTest: true,
      });
      await this.ingressService.processEvent(event, resolved.endpoint, {
        urls: [ingressUrl],
      });

      this.logger.log(
        `Test payload sent: ${provider}/${eventType} as event ${event.id} for user ${jwtUser.sub}`,
      );

      return {
        sent: true,
        provider,
        eventType,
        ingressUrl,
        eventId: event.id,
        responseStatus: resolved.endpoint.responseStatusCode ?? 200,
        responseBody: ingressResponseBody(resolved.endpoint.responseBody),
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
