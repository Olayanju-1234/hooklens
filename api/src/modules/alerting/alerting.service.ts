import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan } from 'typeorm';
import { AlertChannel } from '../../entities/alert-channel.entity.js';
import { AlertRule } from '../../entities/alert-rule.entity.js';
import { AlertHistory } from '../../entities/alert-history.entity.js';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import {
  CreateAlertChannelDto,
  UpdateAlertChannelDto,
  CreateAlertRuleDto,
  UpdateAlertRuleDto,
} from './dto/alert.dto.js';
import { SlackSender } from './channels/slack.sender.js';
import { DiscordSender } from './channels/discord.sender.js';
import { EmailSender } from './channels/email.sender.js';

@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);

  constructor(
    @InjectRepository(AlertChannel)
    private readonly channelRepo: Repository<AlertChannel>,
    @InjectRepository(AlertRule)
    private readonly ruleRepo: Repository<AlertRule>,
    @InjectRepository(AlertHistory)
    private readonly historyRepo: Repository<AlertHistory>,
    @InjectRepository(WebhookEvent)
    private readonly eventRepo: Repository<WebhookEvent>,
    private readonly slackSender: SlackSender,
    private readonly discordSender: DiscordSender,
    private readonly emailSender: EmailSender,
  ) {}

  // ─── Channels ──────────────────────────────────────────

  async createChannel(
    workspaceId: string,
    dto: CreateAlertChannelDto,
  ): Promise<AlertChannel> {
    const channel = this.channelRepo.create({
      workspaceId,
      type: dto.type,
      name: dto.name,
      config: dto.config as Record<string, unknown>,
    });
    const saved = await this.channelRepo.save(channel);
    this.logger.log(
      `Alert channel created: ${saved.id} (${dto.type}) in workspace ${workspaceId}`,
    );
    return saved;
  }

  async listChannels(workspaceId: string): Promise<AlertChannel[]> {
    return this.channelRepo.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateChannel(
    channelId: string,
    dto: UpdateAlertChannelDto,
  ): Promise<AlertChannel> {
    const channel = await this.channelRepo.findOne({
      where: { id: channelId },
    });
    if (!channel) {
      throw new NotFoundException('Alert channel not found');
    }
    if (dto.name !== undefined) {
      channel.name = dto.name;
    }
    if (dto.config !== undefined) {
      channel.config = dto.config as Record<string, unknown>;
    }
    if (dto.isActive !== undefined) {
      channel.isActive = dto.isActive;
    }
    const saved = await this.channelRepo.save(channel);
    this.logger.log(`Alert channel updated: ${channelId}`);
    return saved;
  }

  async deleteChannel(channelId: string): Promise<void> {
    const channel = await this.channelRepo.findOne({
      where: { id: channelId },
    });
    if (!channel) {
      throw new NotFoundException('Alert channel not found');
    }
    await this.channelRepo.remove(channel);
    this.logger.log(`Alert channel deleted: ${channelId}`);
  }

  async testChannel(channelId: string): Promise<{ success: boolean }> {
    const channel = await this.channelRepo.findOne({
      where: { id: channelId },
    });
    if (!channel) {
      throw new NotFoundException('Alert channel not found');
    }

    const testMessage =
      '[Hookdash] Test notification — your alert channel is configured correctly.';
    try {
      await this.sendNotification(channel, testMessage);
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  // ─── Rules ─────────────────────────────────────────────

  async createRule(
    workspaceId: string,
    dto: CreateAlertRuleDto,
  ): Promise<AlertRule> {
    const channels = await this.channelRepo.find({
      where: { id: In(dto.channelIds), workspaceId },
    });
    if (channels.length !== dto.channelIds.length) {
      throw new BadRequestException(
        'One or more channel IDs are invalid or do not belong to this workspace',
      );
    }

    const rule = this.ruleRepo.create({
      workspaceId,
      name: dto.name,
      type: dto.type,
      config: dto.config,
      channels,
    });
    const saved = await this.ruleRepo.save(rule);
    this.logger.log(
      `Alert rule created: ${saved.id} (${dto.type}) in workspace ${workspaceId}`,
    );
    return saved;
  }

  async listRules(workspaceId: string): Promise<AlertRule[]> {
    return this.ruleRepo.find({
      where: { workspaceId },
      relations: ['channels'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateRule(
    ruleId: string,
    dto: UpdateAlertRuleDto,
  ): Promise<AlertRule> {
    const rule = await this.ruleRepo.findOne({
      where: { id: ruleId },
      relations: ['channels'],
    });
    if (!rule) {
      throw new NotFoundException('Alert rule not found');
    }
    if (dto.name !== undefined) {
      rule.name = dto.name;
    }
    if (dto.type !== undefined) {
      rule.type = dto.type;
    }
    if (dto.config !== undefined) {
      rule.config = dto.config;
    }
    if (dto.isActive !== undefined) {
      rule.isActive = dto.isActive;
    }
    if (dto.channelIds !== undefined) {
      const channels = await this.channelRepo.find({
        where: { id: In(dto.channelIds), workspaceId: rule.workspaceId },
      });
      if (channels.length !== dto.channelIds.length) {
        throw new BadRequestException(
          'One or more channel IDs are invalid or do not belong to this workspace',
        );
      }
      rule.channels = channels;
    }
    const saved = await this.ruleRepo.save(rule);
    this.logger.log(`Alert rule updated: ${ruleId}`);
    return saved;
  }

  async deleteRule(ruleId: string): Promise<void> {
    const rule = await this.ruleRepo.findOne({ where: { id: ruleId } });
    if (!rule) {
      throw new NotFoundException('Alert rule not found');
    }
    await this.ruleRepo.remove(rule);
    this.logger.log(`Alert rule deleted: ${ruleId}`);
  }

  // ─── Evaluation ────────────────────────────────────────

  async evaluateForwardFailure(
    workspaceId: string,
    eventId: string,
  ): Promise<void> {
    const rules = await this.ruleRepo.find({
      where: { workspaceId, type: 'forward_failure', isActive: true },
      relations: ['channels'],
    });
    if (rules.length === 0) return;

    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event || event.forwardStatus !== 'failed') return;

    const message = `[Hookdash Alert] Forward failure detected for event ${event.id} (endpoint: ${event.endpointId}, status: ${event.forwardCode ?? 'N/A'})`;

    const notifications = rules.flatMap((rule) =>
      rule.channels
        .filter((ch) => ch.isActive)
        .map(async (channel) => {
          await this.sendNotification(channel, message);
          await this.recordHistory(rule.id, channel.id, {
            eventId: event.id,
            type: 'forward_failure',
            message,
          });
        }),
    );
    await Promise.all(notifications);
  }

  async evaluateSignatureFailure(
    workspaceId: string,
    eventId: string,
  ): Promise<void> {
    const rules = await this.ruleRepo.find({
      where: { workspaceId, type: 'signature_failure', isActive: true },
      relations: ['channels'],
    });
    if (rules.length === 0) return;

    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event || event.signatureValid !== false) return;

    const message = `[Hookdash Alert] Signature verification failed for event ${event.id} (endpoint: ${event.endpointId}, provider: ${event.provider ?? 'unknown'})`;

    const notifications = rules.flatMap((rule) =>
      rule.channels
        .filter((ch) => ch.isActive)
        .map(async (channel) => {
          await this.sendNotification(channel, message);
          await this.recordHistory(rule.id, channel.id, {
            eventId: event.id,
            type: 'signature_failure',
            message,
          });
        }),
    );
    await Promise.all(notifications);
  }

  async evaluateNoEvents(workspaceId: string): Promise<void> {
    const rules = await this.ruleRepo.find({
      where: { workspaceId, type: 'no_events', isActive: true },
      relations: ['channels'],
    });
    if (rules.length === 0) return;

    for (const rule of rules) {
      const windowMinutes =
        (rule.config['windowMinutes'] as number | undefined) ?? 60;
      const since = new Date(Date.now() - windowMinutes * 60 * 1000);

      const eventCount = await this.eventRepo.count({
        where: { workspaceId, receivedAt: MoreThan(since) },
      });

      if (eventCount === 0) {
        const message = `[Hookdash Alert] No events received in workspace for the last ${windowMinutes} minutes`;

        const notifications = rule.channels
          .filter((ch) => ch.isActive)
          .map(async (channel) => {
            await this.sendNotification(channel, message);
            await this.recordHistory(rule.id, channel.id, {
              type: 'no_events',
              windowMinutes,
              message,
            });
          });
        await Promise.all(notifications);
      }
    }
  }

  // ─── Bags Alerts ─────────────────────────────────────────

  async evaluateBagsFeeClaim(
    workspaceId: string,
    wallet: string,
    claimableSol: number,
    positionCount: number,
  ): Promise<void> {
    const rules = await this.ruleRepo.find({
      where: { workspaceId, type: 'bags_fee_claim', isActive: true },
      relations: ['channels'],
    });
    if (rules.length === 0) return;

    for (const rule of rules) {
      const minSol =
        (rule.config['minClaimableSol'] as number | undefined) ?? 0;
      if (claimableSol < minSol) continue;

      const message =
        `💰 [Hookdash × Bags] Fee claim available!\n` +
        `Wallet: ${wallet.slice(0, 8)}...${wallet.slice(-4)}\n` +
        `Claimable: ${claimableSol.toFixed(4)} SOL across ${positionCount} position${positionCount === 1 ? '' : 's'}\n` +
        `Claim at: https://bags.fm`;

      const notifications = rule.channels
        .filter((ch) => ch.isActive)
        .map(async (channel) => {
          await this.sendNotification(channel, message);
          await this.recordHistory(rule.id, channel.id, {
            type: 'bags_fee_claim',
            wallet,
            claimableSol,
            positionCount,
            message,
          });
        });
      await Promise.all(notifications);
    }
  }

  async evaluateBagsTokenLaunch(
    workspaceId: string,
    token: { mint: string; name: string; symbol: string; creator: string },
  ): Promise<void> {
    const rules = await this.ruleRepo.find({
      where: { workspaceId, type: 'bags_token_launch', isActive: true },
      relations: ['channels'],
    });
    if (rules.length === 0) return;

    const message =
      `🚀 [Hookdash × Bags] New token launched!\n` +
      `Name: ${token.name} ($${token.symbol})\n` +
      `Mint: ${token.mint.slice(0, 8)}...${token.mint.slice(-4)}\n` +
      `Creator: ${token.creator.slice(0, 8)}...${token.creator.slice(-4)}\n` +
      `View: https://bags.fm/${token.mint}`;

    const notifications = rules.flatMap((rule) =>
      rule.channels
        .filter((ch) => ch.isActive)
        .map(async (channel) => {
          await this.sendNotification(channel, message);
          await this.recordHistory(rule.id, channel.id, {
            type: 'bags_token_launch',
            ...token,
            message,
          });
        }),
    );
    await Promise.all(notifications);
  }

  // ─── Notification Dispatch ─────────────────────────────

  async sendNotification(
    channel: AlertChannel,
    message: string,
  ): Promise<void> {
    switch (channel.type) {
      case 'slack': {
        const webhookUrl = channel.config['webhookUrl'] as string | undefined;
        if (!webhookUrl) {
          this.logger.warn(
            `Slack channel ${channel.id} has no webhookUrl configured`,
          );
          return;
        }
        await this.slackSender.send(webhookUrl, message);
        break;
      }
      case 'discord': {
        const webhookUrl = channel.config['webhookUrl'] as string | undefined;
        if (!webhookUrl) {
          this.logger.warn(
            `Discord channel ${channel.id} has no webhookUrl configured`,
          );
          return;
        }
        await this.discordSender.send(webhookUrl, message);
        break;
      }
      case 'email': {
        const email = channel.config['email'] as string | undefined;
        if (!email) {
          this.logger.warn(
            `Email channel ${channel.id} has no email configured`,
          );
          return;
        }
        await this.emailSender.send(email, 'Hookdash Alert', message);
        break;
      }
      default:
        this.logger.warn(`Unknown channel type: ${String(channel.type)}`);
    }
  }

  // ─── History ───────────────────────────────────────────

  async listHistory(
    workspaceId: string,
    limit: number = 50,
  ): Promise<AlertHistory[]> {
    return this.historyRepo
      .createQueryBuilder('h')
      .innerJoinAndSelect('h.alertRule', 'alertRule')
      .leftJoinAndSelect('h.channel', 'channel')
      .where('alertRule.workspaceId = :workspaceId', { workspaceId })
      .orderBy('h.sentAt', 'DESC')
      .limit(limit)
      .getMany();
  }

  private async recordHistory(
    alertRuleId: string,
    channelId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const history = this.historyRepo.create({
      alertRuleId,
      channelId,
      payload,
    });
    await this.historyRepo.save(history);
  }
}
