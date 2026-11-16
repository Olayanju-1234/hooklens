import { NotFoundException } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import {
  GITHUB_REPO,
  SDK_PACKAGE,
  UsageService,
  USAGE_WINDOW_DAYS,
} from './usage.service.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';

describe('UsageService', () => {
  const query = jest.fn();
  const get = jest.fn();
  const make = (adminEmails: string[]) =>
    new UsageService(
      { query } as never,
      { axiosRef: { get } } as never,
      { get: () => adminEmails } as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isAdmin', () => {
    it('is nobody when ADMIN_EMAILS is unset, without touching the database', async () => {
      expect(await make([]).isAdmin('user-1')).toBe(false);
      expect(query).not.toHaveBeenCalled();
    });

    it("matches the user's current email, ignoring case", async () => {
      query.mockResolvedValue([{ email: 'Joseph@Example.test' }]);
      expect(await make(['joseph@example.test']).isAdmin('user-1')).toBe(true);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('FROM users'),
        ['user-1'],
      );
    });

    it('refuses everyone else, and unknown users', async () => {
      query.mockResolvedValueOnce([{ email: 'someone@example.test' }]);
      expect(await make(['joseph@example.test']).isAdmin('user-2')).toBe(false);
      query.mockResolvedValueOnce([]);
      expect(await make(['joseph@example.test']).isAdmin('ghost')).toBe(false);
    });
  });

  describe('report', () => {
    function stubQueries() {
      query.mockImplementation((sql: string) => {
        if (sql.includes('workspace_members')) {
          return Promise.resolve([{ id: 'ws-joseph' }, { id: 'ws-joseph-2' }]);
        }
        if (sql.includes('webhook_events')) return Promise.resolve([{ n: 4 }]);
        if (sql.includes('audit_logs')) return Promise.resolve([{ n: 2 }]);
        if (sql.includes('chaos_runs')) {
          return Promise.resolve([{ workspaces: 1, runs: 6 }]);
        }
        return Promise.resolve([]);
      });
    }

    it("counts the last 30 days outside the admins' own workspaces, plus npm downloads and stars", async () => {
      stubQueries();
      get.mockImplementation((url: string) =>
        Promise.resolve({
          data: url.includes('npmjs')
            ? { downloads: 37 }
            : { stargazers_count: 12 },
        }),
      );
      const before = Date.now();
      const report = await make(['joseph@example.test']).report();

      expect(report).toMatchObject({
        windowDays: USAGE_WINDOW_DAYS,
        excludedWorkspaces: 2,
        workspacesWithVerifiedEvents: 4,
        workspacesThatTurnedChaosOn: 2,
        workspacesWithChaosRuns: 1,
        chaosRuns: 6,
        sdk: { package: SDK_PACKAGE, published: true, downloadsLastMonth: 37 },
        github: { repo: GITHUB_REPO, stars: 12 },
      });

      const calls = query.mock.calls as [string, unknown[]][];
      expect(calls[0][1]).toEqual([['joseph@example.test']]);
      for (const [sql, params] of calls.slice(1)) {
        expect(sql).toContain('NOT ("workspaceId" = ANY($2::uuid[]))');
        const since = params[0] as Date;
        expect(before - since.getTime()).toBeGreaterThanOrEqual(
          USAGE_WINDOW_DAYS * 86_400_000 - 1000,
        );
        expect(params[1]).toEqual(['ws-joseph', 'ws-joseph-2']);
      }
      const eventsSql = calls.find(([sql]) =>
        sql.includes('webhook_events'),
      )![0];
      expect(eventsSql).toContain('"signatureValid" = true');
      expect(eventsSql).toContain('"isTest" = false');
    });

    it('reports npm and GitHub as unknown when they fail, without failing the report', async () => {
      stubQueries();
      get.mockRejectedValue(new Error('ETIMEDOUT'));
      const report = await make(['joseph@example.test']).report();
      expect(report.sdk).toMatchObject({
        published: null,
        downloadsLastMonth: null,
      });
      expect(report.github.stars).toBeNull();
      expect(report.workspacesWithVerifiedEvents).toBe(4);
    });

    it('says the SDK is not published when npm answers 404, rather than unknown', async () => {
      stubQueries();
      get.mockImplementation((url: string) =>
        url.includes('npmjs')
          ? Promise.reject(
              Object.assign(new Error('Not Found'), {
                response: { status: 404 },
              }),
            )
          : Promise.resolve({ data: { stargazers_count: 0 } }),
      );
      const report = await make(['joseph@example.test']).report();
      expect(report.sdk).toMatchObject({
        published: false,
        downloadsLastMonth: 0,
      });
      expect(report.github.stars).toBe(0);
    });

    it('sends nothing about users to npm or GitHub', async () => {
      stubQueries();
      get.mockResolvedValue({ data: {} });
      await make(['joseph@example.test']).report();
      const urls = (get.mock.calls as [string][]).map(([u]) => u);
      expect(urls).toEqual([
        `https://api.npmjs.org/downloads/point/last-month/${SDK_PACKAGE}`,
        `https://api.github.com/repos/${GITHUB_REPO}`,
      ]);
    });
  });
});

describe('AdminController', () => {
  const usage = { isAdmin: jest.fn(), report: jest.fn() };
  const controller = new AdminController(usage as never);
  const user = { sub: 'user-1', email: '' } as JwtPayload;

  it('404s anyone who is not an admin', async () => {
    usage.isAdmin.mockResolvedValue(false);
    await expect(controller.usage(user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(usage.report).not.toHaveBeenCalled();
  });

  it('returns the report to an admin', async () => {
    usage.isAdmin.mockResolvedValue(true);
    usage.report.mockResolvedValue({ chaosRuns: 3 });
    expect(await controller.usage(user)).toEqual({ chaosRuns: 3 });
  });
});
