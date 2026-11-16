import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { ChaosRun } from '../../entities/chaos-run.entity.js';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import {
  ForwardResult,
  type ChaosKind,
} from '../../entities/forward-result.entity.js';
import { EndpointsService } from '../endpoints/endpoints.service.js';
import { IngressService } from '../ingress/ingress.service.js';
import { TestPayloadsService } from '../test-payloads/test-payloads.service.js';
import { ChaosService, FALLBACK_TARGET } from './chaos.service.js';
import {
  SCENARIOS,
  buildScenarioBodies,
  expectedDeliveries,
  findScenario,
  longestHoldMs,
  type ChaosScenario,
} from './scenarios.js';

/** After the longest planned hold, allow this long for the last deliveries before calling a run done. */
const RUN_GRACE_MS = 60_000;
const BODY_EXCERPT = 300;

export interface ScenarioView {
  id: string;
  title: string;
  provider: string;
  summary: string;
  steps: { eventType: string; note: string }[];
  checklist: string[];
  expectedDeliveries: number;
  longestHoldMs: number;
}

export interface RunDeliveryView {
  eventId: string;
  step: number | null;
  eventType: string | null;
  chaosKind: ChaosKind | null;
  chaosSeq: number;
  attempt: number;
  status: string;
  responseCode: number | null;
  latencyMs: number | null;
  startedAt: string | null;
  offsetMs: number | null;
  bodyExcerpt: string | null;
}

export interface ChaosRunView {
  id: string;
  scenarioId: string;
  title: string;
  provider: string;
  endpointId: string;
  endpointName: string;
  target: string;
  targetLabel: string;
  createdAt: string;
  finishesBy: string;
  expectedDeliveries: number;
  recordedDeliveries: number;
  complete: boolean;
  checklist: string[];
  steps: {
    index: number;
    eventType: string;
    note: string;
    eventId: string | null;
  }[];
  deliveries: RunDeliveryView[];
}

export interface ChaosRunSummary {
  id: string;
  scenarioId: string;
  title: string;
  target: string;
  createdAt: string;
}

function toScenarioView(s: ChaosScenario): ScenarioView {
  return {
    id: s.id,
    title: s.title,
    provider: s.provider,
    summary: s.summary,
    steps: s.steps.map((step) => ({
      eventType: step.eventType,
      note: step.note,
    })),
    checklist: s.checklist,
    expectedDeliveries: expectedDeliveries(s),
    longestHoldMs: longestHoldMs(s),
  };
}

@Injectable()
export class ChaosRunsService {
  private readonly logger = new Logger(ChaosRunsService.name);

  constructor(
    @InjectRepository(ChaosRun)
    private readonly runRepo: Repository<ChaosRun>,
    @InjectRepository(WebhookEvent)
    private readonly eventRepo: Repository<WebhookEvent>,
    @InjectRepository(ForwardResult)
    private readonly resultRepo: Repository<ForwardResult>,
    private readonly chaosService: ChaosService,
    private readonly endpointsService: EndpointsService,
    private readonly ingressService: IngressService,
    private readonly testPayloads: TestPayloadsService,
  ) {}

  listScenarios(): ScenarioView[] {
    return SCENARIOS.map(toScenarioView);
  }

  /** Sends a scenario's linked test events to one target, each with its scripted chaos plan. */
  async run(
    scenarioId: string,
    endpointId: string,
    target: string,
    userId: string,
  ): Promise<ChaosRunView> {
    const scenario = findScenario(scenarioId);
    if (!scenario) throw new NotFoundException('Scenario not found');
    const { endpoint, destinationId } = await this.chaosService.resolveTarget(
      endpointId,
      target,
      userId,
    );

    if (!(await this.chaosService.reserveRun(endpoint.workspaceId))) {
      throw new HttpException(
        'Up to 10 scenario runs every 10 minutes per workspace. Try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const extras = scenario.steps.reduce((n, s) => n + s.plan.extras.length, 0);
    const granted = await this.chaosService.reserveExtras(
      endpoint.workspaceId,
      extras,
      { allOrNothing: true },
    );
    if (extras > 0 && granted < extras) {
      throw new HttpException(
        'This workspace hit its chaos limit for the minute. Try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const run = await this.runRepo.save(
      this.runRepo.create({
        workspaceId: endpoint.workspaceId,
        endpointId: endpoint.id,
        destinationId,
        scenarioId: scenario.id,
        createdBy: userId,
      }),
    );

    const bodies = buildScenarioBodies(scenario, this.testPayloads);
    // Sent one after another, so receivedAt follows the script; the plans decide the landing order
    for (const [index, step] of scenario.steps.entries()) {
      const event = await this.ingressService.capture({
        endpointId: endpoint.id,
        userId: endpoint.userId,
        method: 'POST',
        path: `/in/${endpoint.ingressSlug}`,
        headers: { 'content-type': 'application/json' },
        rawBody: JSON.stringify(bodies[index]),
        body: bodies[index],
        sourceIp: null,
        isTest: true,
        chaosRunId: run.id,
        chaosStep: index,
      });
      await this.ingressService.processEvent(event, endpoint, {
        trusted: true,
        scenario: { runId: run.id, destinationId, plan: step.plan },
      });
    }

    this.logger.log(
      `Chaos scenario ${scenario.id} run ${run.id} started on ${endpoint.id} (${destinationId ?? FALLBACK_TARGET})`,
    );
    return this.getRun(run.id, userId);
  }

  async getRun(runId: string, userId: string): Promise<ChaosRunView> {
    const run = await this.runRepo.findOne({
      where: { id: runId },
      relations: ['destination'],
    });
    if (!run) throw new NotFoundException('Run not found');
    const endpoint = await this.endpointsService.findOne(
      run.endpointId,
      userId,
    );
    const scenario = findScenario(run.scenarioId);
    if (!scenario) throw new NotFoundException('Scenario not found');

    const events = await this.eventRepo.find({
      where: { chaosRunId: run.id },
      select: ['id', 'chaosStep', 'eventType'],
      order: { chaosStep: 'ASC' },
    });
    const results = events.length
      ? await this.resultRepo.find({
          where: { eventId: In(events.map((e) => e.id)), target: IsNull() },
          order: { startedAt: 'ASC' },
        })
      : [];

    const byEvent = new Map(events.map((e) => [e.id, e]));
    const started = run.createdAt.getTime();
    const deliveries: RunDeliveryView[] = results.map((r) => {
      const event = byEvent.get(r.eventId);
      return {
        eventId: r.eventId,
        step: event?.chaosStep ?? null,
        eventType: event?.eventType ?? null,
        chaosKind: r.chaosKind,
        chaosSeq: r.chaosSeq,
        attempt: r.attempt,
        status: r.status,
        responseCode: r.responseCode || null,
        latencyMs: r.latency,
        startedAt: r.startedAt?.toISOString() ?? null,
        offsetMs: r.startedAt ? r.startedAt.getTime() - started : null,
        bodyExcerpt: r.responseBody?.slice(0, BODY_EXCERPT) ?? null,
      };
    });

    // Retries of the same delivery count once
    const recorded = new Set(results.map((r) => `${r.eventId}:${r.chaosSeq}`))
      .size;
    const expected = expectedDeliveries(scenario);
    const finishesBy = new Date(
      started + longestHoldMs(scenario) + RUN_GRACE_MS,
    );
    const stepEvents = new Map(events.map((e) => [e.chaosStep, e.id]));

    return {
      id: run.id,
      scenarioId: scenario.id,
      title: scenario.title,
      provider: scenario.provider,
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      target: run.destinationId ?? FALLBACK_TARGET,
      targetLabel: run.destination
        ? run.destination.label || run.destination.url
        : 'forward URL',
      createdAt: run.createdAt.toISOString(),
      finishesBy: finishesBy.toISOString(),
      expectedDeliveries: expected,
      recordedDeliveries: recorded,
      complete: recorded >= expected || Date.now() > finishesBy.getTime(),
      checklist: scenario.checklist,
      steps: scenario.steps.map((s, index) => ({
        index,
        eventType: s.eventType,
        note: s.note,
        eventId: stepEvents.get(index) ?? null,
      })),
      deliveries,
    };
  }

  async listRuns(
    endpointId: string,
    userId: string,
  ): Promise<ChaosRunSummary[]> {
    await this.endpointsService.findOne(endpointId, userId);
    const runs = await this.runRepo.find({
      where: { endpointId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    return runs.map((r) => ({
      id: r.id,
      scenarioId: r.scenarioId,
      title: findScenario(r.scenarioId)?.title ?? r.scenarioId,
      target: r.destinationId ?? FALLBACK_TARGET,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
