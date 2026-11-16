import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { DataSource } from 'typeorm';

export const USAGE_WINDOW_DAYS = 30;
export const SDK_PACKAGE = 'hookdash-sdk';
export const GITHUB_REPO = 'Olayanju-1234/hooklens';

export interface UsageReport {
  windowDays: number;
  generatedAt: string;
  excludedWorkspaces: number;
  workspacesWithVerifiedEvents: number;
  workspacesThatTurnedChaosOn: number;
  workspacesWithChaosRuns: number;
  chaosRuns: number;
  // published is false while the package isn't on npm, null when npm couldn't be reached
  sdk: {
    package: string;
    published: boolean | null;
    downloadsLastMonth: number | null;
  };
  github: { repo: string; stars: number | null };
}

/** Counts real use without collecting anything new: only rows Hookdash already keeps. */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);
  private readonly adminEmails: string[];

  constructor(
    private readonly dataSource: DataSource,
    private readonly httpService: HttpService,
    configService: ConfigService,
  ) {
    this.adminEmails = configService.get<string[]>('adminEmails', []);
  }

  async isAdmin(userId: string): Promise<boolean> {
    if (this.adminEmails.length === 0) return false;
    const rows = await this.dataSource.query<{ email: string }[]>(
      'SELECT email FROM users WHERE id = $1',
      [userId],
    );
    const email = rows[0]?.email?.toLowerCase();
    return Boolean(email && this.adminEmails.includes(email));
  }

  async report(): Promise<UsageReport> {
    const since = new Date(Date.now() - USAGE_WINDOW_DAYS * 86_400_000);
    // The admins' own workspaces are not usage
    const excluded = await this.dataSource.query<{ id: string }[]>(
      `SELECT DISTINCT m."workspaceId" AS id
         FROM workspace_members m JOIN users u ON u.id = m."userId"
        WHERE lower(u.email) = ANY($1::text[])`,
      [this.adminEmails],
    );
    const skip = excluded.map((r) => r.id);

    const [verified, chaosOn, runs, sdk, stars] = await Promise.all([
      this.count(
        `SELECT count(DISTINCT "workspaceId")::int AS n FROM webhook_events
          WHERE "signatureValid" = true AND "isTest" = false AND "receivedAt" >= $1
            AND NOT ("workspaceId" = ANY($2::uuid[]))`,
        [since, skip],
      ),
      this.count(
        `SELECT count(DISTINCT "workspaceId")::int AS n FROM audit_logs
          WHERE action = 'chaos.enable' AND "createdAt" >= $1
            AND NOT ("workspaceId" = ANY($2::uuid[]))`,
        [since, skip],
      ),
      this.dataSource.query<{ workspaces: number; runs: number }[]>(
        `SELECT count(DISTINCT "workspaceId")::int AS workspaces, count(*)::int AS runs FROM chaos_runs
          WHERE "createdAt" >= $1 AND NOT ("workspaceId" = ANY($2::uuid[]))`,
        [since, skip],
      ),
      this.npmDownloads(),
      this.githubStars(),
    ]);

    return {
      windowDays: USAGE_WINDOW_DAYS,
      generatedAt: new Date().toISOString(),
      excludedWorkspaces: skip.length,
      workspacesWithVerifiedEvents: verified,
      workspacesThatTurnedChaosOn: chaosOn,
      workspacesWithChaosRuns: runs[0]?.workspaces ?? 0,
      chaosRuns: runs[0]?.runs ?? 0,
      sdk: { package: SDK_PACKAGE, ...sdk },
      github: { repo: GITHUB_REPO, stars },
    };
  }

  private async count(sql: string, params: unknown[]): Promise<number> {
    const rows = await this.dataSource.query<{ n: number }[]>(sql, params);
    return rows[0]?.n ?? 0;
  }

  private async npmDownloads(): Promise<{
    published: boolean | null;
    downloadsLastMonth: number | null;
  }> {
    const url = `https://api.npmjs.org/downloads/point/last-month/${SDK_PACKAGE}`;
    try {
      const res = await this.httpService.axiosRef.get<{ downloads?: unknown }>(
        url,
        { timeout: 5000, headers: { 'user-agent': 'hookdash-usage' } },
      );
      const n = res.data.downloads;
      return {
        published: true,
        downloadsLastMonth: typeof n === 'number' ? n : null,
      };
    } catch (err) {
      if (
        (err as { response?: { status?: number } }).response?.status === 404
      ) {
        return { published: false, downloadsLastMonth: 0 };
      }
      this.logger.warn(
        `Usage lookup failed for ${url}: ${(err as Error).message}`,
      );
      return { published: null, downloadsLastMonth: null };
    }
  }

  private async githubStars(): Promise<number | null> {
    return this.fetchNumber(
      `https://api.github.com/repos/${GITHUB_REPO}`,
      (body) => body.stargazers_count,
    );
  }

  // Public numbers only; nothing about users is sent
  private async fetchNumber(
    url: string,
    pick: (body: Record<string, unknown>) => unknown,
  ): Promise<number | null> {
    try {
      const res = await this.httpService.axiosRef.get<Record<string, unknown>>(
        url,
        { timeout: 5000, headers: { 'user-agent': 'hookdash-usage' } },
      );
      const value = pick(res.data);
      return typeof value === 'number' ? value : null;
    } catch (err) {
      this.logger.warn(
        `Usage lookup failed for ${url}: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
