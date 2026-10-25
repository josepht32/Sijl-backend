import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Case } from '../../entities/case.entity';
import { CaseMovement } from '../../entities/case-movement.entity';
import { CaseDecision } from '../../entities/case-decision.entity';
import { ExecutionActivity } from '../../entities/execution-activity.entity';
import { Department } from '../../entities/department.entity';
import { User } from '../../entities/user.entity';
import { CasesService } from '../cases/cases.service';
import { serializeCase } from '../cases/serialize-case';
import { AnalyticsPeriodDto } from './dto/analytics.dto';
import { CaseDirection, CaseStatus, CaseType, TimelineStatus } from '../../common/enums/case.enums';
import { DecisionType } from '../../common/enums/decision.enums';
import {
  WorkflowActionType,
  WorkflowStage,
  WorkflowState,
} from '../../common/enums/workflow.enums';
import { computeTimelineStatus } from '../../common/utils/timeline';
import {
  canAddExecutionActivity,
  canDecide,
} from '../../common/utils/lifecycle';
import { getAvailableActions, WORKFLOW_SEQUENCE } from '../../common/utils/workflow';
import { canViewExecutiveAnalytics } from '../../common/utils/case-access';
import {
  ATTENTION_LIMIT,
  AgingBucket,
  AttentionReason,
  INACTIVE_DAYS,
  RECENT_LIMIT,
  STALLED_EXECUTION_DAYS,
  agingBucket,
  attentionRank,
  average,
  daysBetween,
  inPeriod,
  isCaseActive,
  isCaseClosed,
  percentile,
  ratio,
} from '../../common/utils/analytics-metrics';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly casesService: CasesService,
    @InjectRepository(CaseMovement)
    private readonly movementsRepo: Repository<CaseMovement>,
    @InjectRepository(CaseDecision)
    private readonly decisionsRepo: Repository<CaseDecision>,
    @InjectRepository(ExecutionActivity)
    private readonly activitiesRepo: Repository<ExecutionActivity>,
    @InjectRepository(Department)
    private readonly departmentsRepo: Repository<Department>,
  ) {}

  async operational(user: User) {
    const cases = await this.loadCases(this.casesService.accessibleQuery(user));
    const now = new Date();
    const kpis = {
      active: 0,
      awaitingAction: 0,
      dueSoon: 0,
      overdue: 0,
      recentlyUpdated: 0,
    };
    const attention: Array<ReturnType<typeof serializeCase> & { reasons: AttentionReason[] }> =
      [];

    for (const item of cases) {
      if (!isCaseActive(item.status, item.workflowState)) {
        continue;
      }
      kpis.active += 1;
      const timeline = computeTimelineStatus(item.dueDate, item.targetTimelineDays);
      if (timeline === TimelineStatus.DUE_SOON) {
        kpis.dueSoon += 1;
      }
      if (timeline === TimelineStatus.OVERDUE) {
        kpis.overdue += 1;
      }
      if (daysBetween(item.lastActivityAt, now) <= 3) {
        kpis.recentlyUpdated += 1;
      }
      const reasons = this.operationalReasons(item, user, now);
      if (reasons.includes('awaiting_action') || reasons.includes('awaiting_chairman')) {
        kpis.awaitingAction += 1;
      }
      if (reasons.length) {
        attention.push({ ...serializeCase(item), reasons });
      }
    }

    attention.sort(this.compareAttention);
    const recent = [...cases]
      .sort(
        (left, right) =>
          new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime(),
      )
      .slice(0, RECENT_LIMIT)
      .map((item) => serializeCase(item));

    return {
      scope: 'accessible',
      kpis,
      attention: attention.slice(0, ATTENTION_LIMIT),
      recent,
    };
  }

  async executive(user: User, query: AnalyticsPeriodDto) {
    if (
      !canViewExecutiveAnalytics({
        role: user.role,
        assignedStages: user.workflowStages,
        permissions: user.permissions,
      })
    ) {
      throw new ForbiddenException('Executive analytics are not available for this account');
    }

    const now = new Date();
    const from = query.from ? new Date(`${query.from}T00:00:00`) : null;
    const to = query.to ? new Date(`${query.to}T23:59:59`) : null;
    const cases = await this.loadCases(this.casesService.organizationQuery(user));
    const caseIds = cases.map((item) => item.id);
    const [movements, decisions, activities, departments] = await Promise.all([
      caseIds.length
        ? this.movementsRepo.find({
            where: { caseId: In(caseIds) },
            order: { createdAt: 'ASC' },
          })
        : Promise.resolve([] as CaseMovement[]),
      caseIds.length
        ? this.decisionsRepo.find({
            where: { caseId: In(caseIds) },
            order: { createdAt: 'ASC' },
          })
        : Promise.resolve([] as CaseDecision[]),
      caseIds.length
        ? this.activitiesRepo.find({
            where: { caseId: In(caseIds) },
            order: { createdAt: 'ASC' },
          })
        : Promise.resolve([] as ExecutionActivity[]),
      this.departmentsRepo.find({
        where: { organizationId: user.organizationId },
        order: { nameEn: 'ASC' },
      }),
    ]);

    const movementsByCase = this.groupBy(movements, (item) => item.caseId);
    const decisionsByCase = this.groupBy(decisions, (item) => item.caseId);
    const activitiesByCase = this.groupBy(activities, (item) => item.caseId);

    const current = {
      active: 0,
      awaitingChairman: 0,
      overdue: 0,
      onTrack: 0,
      dueSoon: 0,
      severelyOverdue: 0,
      inactive: 0,
      inExecution: 0,
      awaitingReport: 0,
      stalledExecution: 0,
    };
    const period = {
      created: 0,
      closed: 0,
      closedOnTime: 0,
      returns: 0,
      resubmits: 0,
      forwards: 0,
    };
    const previous = { created: 0, closed: 0, closedOnTime: 0 };
    const previousWindow = this.previousWindow(from, to);
    const resolutionDays: number[] = [];
    const activeAgeDays: number[] = [];
    const chairmanWaitDays: number[] = [];
    const decisionWaitDays: number[] = [];
    const agingCounts: Record<AgingBucket, number> = {
      within_timeline: 0,
      approaching: 0,
      overdue: 0,
      severely_overdue: 0,
    };
    const workflowMix: Record<string, number> = {};
    const typeMix: Record<string, number> = {
      [CaseType.INTERNAL]: 0,
      [CaseType.EXTERNAL]: 0,
    };
    const directionMix: Record<string, number> = {
      [CaseDirection.INCOMING]: 0,
      [CaseDirection.OUTGOING]: 0,
    };
    const decisionMix: Record<DecisionType, number> = {
      [DecisionType.APPROVAL]: 0,
      [DecisionType.ARCHIVE]: 0,
      [DecisionType.REQUEST_DETAILED_REPORT]: 0,
    };
    const attention: Array<ReturnType<typeof serializeCase> & { reasons: AttentionReason[] }> =
      [];

    for (const item of cases) {
      const active = isCaseActive(item.status, item.workflowState);
      const closed = isCaseClosed(item.status, item.workflowState);
      const timeline = computeTimelineStatus(item.dueDate, item.targetTimelineDays);
      const bucket = agingBucket(item);
      if (active) {
        current.active += 1;
        activeAgeDays.push(daysBetween(item.createdAt, now));
        typeMix[item.type] += 1;
        directionMix[item.direction] += 1;
        workflowMix[item.workflowState] = (workflowMix[item.workflowState] || 0) + 1;
        if (timeline === TimelineStatus.OVERDUE) {
          current.overdue += 1;
        } else {
          current.onTrack += 1;
        }
        if (timeline === TimelineStatus.DUE_SOON) {
          current.dueSoon += 1;
        }
        if (bucket === 'severely_overdue') {
          current.severelyOverdue += 1;
        }
        if (
          item.currentStage === WorkflowStage.CHAIRMAN &&
          item.workflowState === WorkflowState.AWAITING_CHAIRMAN
        ) {
          current.awaitingChairman += 1;
          chairmanWaitDays.push(
            daysBetween(this.chairmanEnteredAt(item, movementsByCase.get(item.id) || []), now),
          );
        }
        if (item.workflowState === WorkflowState.IN_EXECUTION) {
          current.inExecution += 1;
        }
        if (item.workflowState === WorkflowState.AWAITING_REPORT) {
          current.awaitingReport += 1;
        }
        if (
          (item.workflowState === WorkflowState.IN_EXECUTION ||
            item.workflowState === WorkflowState.AWAITING_REPORT) &&
          daysBetween(item.lastActivityAt, now) >= STALLED_EXECUTION_DAYS
        ) {
          current.stalledExecution += 1;
        }
        if (daysBetween(item.lastActivityAt, now) >= INACTIVE_DAYS) {
          current.inactive += 1;
        }
        if (bucket) {
          agingCounts[bucket] += 1;
        }
      }
      if (inPeriod(item.createdAt, from, to)) {
        period.created += 1;
      }
      if (previousWindow && inPeriod(item.createdAt, previousWindow.from, previousWindow.to)) {
        previous.created += 1;
      }
      if (closed && inPeriod(item.lastActivityAt, from, to)) {
        period.closed += 1;
        if (new Date(item.lastActivityAt).getTime() <= new Date(item.dueDate).getTime()) {
          period.closedOnTime += 1;
        }
        resolutionDays.push(daysBetween(item.createdAt, item.lastActivityAt));
      }
      if (
        previousWindow &&
        closed &&
        inPeriod(item.lastActivityAt, previousWindow.from, previousWindow.to)
      ) {
        previous.closed += 1;
        if (new Date(item.lastActivityAt).getTime() <= new Date(item.dueDate).getTime()) {
          previous.closedOnTime += 1;
        }
      }
      const reasons = this.executiveReasons(item, now);
      if (reasons.length) {
        attention.push({ ...serializeCase(item), reasons });
      }
    }

    for (const movement of movements) {
      if (!inPeriod(movement.createdAt, from, to)) {
        continue;
      }
      if (movement.action === WorkflowActionType.FORWARD) {
        period.forwards += 1;
      }
      if (movement.action === WorkflowActionType.RETURN) {
        period.returns += 1;
      }
      if (movement.action === WorkflowActionType.RESUBMIT) {
        period.resubmits += 1;
      }
    }

    const caseById = new Map(cases.map((item) => [item.id, item]));
    for (const decision of decisions) {
      if (!inPeriod(decision.createdAt, from, to)) {
        continue;
      }
      if (decision.type in decisionMix) {
        decisionMix[decision.type] += 1;
      }
      const related = caseById.get(decision.caseId);
      if (related) {
        decisionWaitDays.push(daysBetween(related.createdAt, decision.createdAt));
      }
    }

    attention.sort(this.compareAttention);
    const previousCompliance = ratio(previous.closedOnTime, previous.closed);
    const periodCompliance = ratio(period.closedOnTime, period.closed);
    const trendRange = this.trendRange(from, to, cases);

    return {
      scope: 'organization',
      period: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
      current: {
        ...current,
        timelineComplianceRate: ratio(current.onTrack, current.active),
        medianAgeDays: percentile(activeAgeDays, 50),
        chairmanMedianWaitDays: percentile(chairmanWaitDays, 50),
        chairmanP90WaitDays: percentile(chairmanWaitDays, 90),
      },
      periodMetrics: {
        ...period,
        timelineComplianceRate: periodCompliance,
        averageResolutionDays: average(resolutionDays),
        medianResolutionDays: percentile(resolutionDays, 50),
        p90ResolutionDays: percentile(resolutionDays, 90),
        returnRate: ratio(period.returns, period.forwards),
        throughputRate: ratio(period.closed, period.created),
        netBacklog: period.created - period.closed,
        decisions: Object.values(decisionMix).reduce((sum, value) => sum + value, 0),
        averageDaysToDecision: average(decisionWaitDays),
        comparison: previousWindow
          ? {
              createdDelta: period.created - previous.created,
              closedDelta: period.closed - previous.closed,
              complianceDelta:
                periodCompliance == null || previousCompliance == null
                  ? null
                  : Math.round((periodCompliance - previousCompliance) * 10) / 10,
            }
          : null,
      },
      attention: attention.slice(0, ATTENTION_LIMIT),
      aging: (Object.keys(agingCounts) as AgingBucket[]).map((bucket) => ({
        bucket,
        count: agingCounts[bucket],
      })),
      workflowMix: Object.entries(workflowMix).map(([state, count]) => ({ state, count })),
      composition: {
        types: Object.entries(typeMix).map(([type, count]) => ({ type, count })),
        directions: Object.entries(directionMix).map(([direction, count]) => ({
          direction,
          count,
        })),
      },
      decisions: (Object.keys(decisionMix) as DecisionType[]).map((type) => ({
        type,
        count: decisionMix[type],
      })),
      trend: this.trendSeries(cases, decisions, trendRange.from, trendRange.to),
      stages: this.stageInsights(cases, movementsByCase, now),
      departments: this.departmentInsights(
        departments,
        cases,
        decisionsByCase,
        activitiesByCase,
        from,
        to,
      ),
      heatmap: this.departmentStageHeatmap(departments, cases),
      categories: this.categoryInsights(cases, from, to),
    };
  }

  private async loadCases(qb: ReturnType<CasesService['accessibleQuery']>) {
    return qb
      .leftJoinAndSelect('c.concernedDepartments', 'cd')
      .leftJoinAndSelect('cd.department', 'cdDepartment')
      .leftJoinAndSelect('c.ownerDepartment', 'ownerDepartment')
      .leftJoinAndSelect('c.createdBy', 'createdBy')
      .leftJoinAndSelect('c.assignedTo', 'assignedTo')
      .getMany();
  }

  private operationalReasons(item: Case, user: User, now: Date): AttentionReason[] {
    const reasons: AttentionReason[] = [];
    if (!isCaseActive(item.status, item.workflowState)) {
      return reasons;
    }
    const timeline = computeTimelineStatus(item.dueDate, item.targetTimelineDays);
    const bucket = agingBucket(item);
    if (bucket === 'severely_overdue') {
      reasons.push('severely_overdue');
    } else if (timeline === TimelineStatus.OVERDUE) {
      reasons.push('overdue');
    } else if (timeline === TimelineStatus.DUE_SOON) {
      reasons.push('due_soon');
    }
    if (this.needsUserAction(item, user)) {
      if (
        item.currentStage === WorkflowStage.CHAIRMAN &&
        item.workflowState === WorkflowState.AWAITING_CHAIRMAN
      ) {
        reasons.push('awaiting_chairman');
      } else {
        reasons.push('awaiting_action');
      }
    }
    if (item.assignedToId === user.id) {
      reasons.push('assigned');
    }
    if (daysBetween(item.lastActivityAt, now) >= INACTIVE_DAYS) {
      reasons.push('inactive');
    }
    return [...new Set(reasons)];
  }

  private executiveReasons(item: Case, now: Date): AttentionReason[] {
    const reasons: AttentionReason[] = [];
    if (!isCaseActive(item.status, item.workflowState)) {
      return reasons;
    }
    if (
      item.currentStage === WorkflowStage.CHAIRMAN &&
      item.workflowState === WorkflowState.AWAITING_CHAIRMAN
    ) {
      reasons.push('awaiting_chairman');
    }
    const timeline = computeTimelineStatus(item.dueDate, item.targetTimelineDays);
    const bucket = agingBucket(item);
    if (bucket === 'severely_overdue') {
      reasons.push('severely_overdue');
    } else if (timeline === TimelineStatus.OVERDUE) {
      reasons.push('overdue');
    }
    if (daysBetween(item.lastActivityAt, now) >= INACTIVE_DAYS) {
      reasons.push('inactive');
    }
    return reasons;
  }

  private needsUserAction(item: Case, user: User): boolean {
    const concernedIds = (item.concernedDepartments || []).map((entry) => entry.departmentId);
    if (
      getAvailableActions({
        role: user.role,
        assignedStages: user.workflowStages,
        userId: user.id,
        departmentId: user.departmentId,
        createdById: item.createdById,
        currentStage: item.currentStage,
        workflowState: item.workflowState,
        status: item.status,
        returnedToUserId: item.returnedToUserId,
        returnedToDepartmentId: item.returnedToDepartmentId,
      }).length
    ) {
      return true;
    }
    if (
      canDecide({
        role: user.role,
        assignedStages: user.workflowStages,
        permissions: user.permissions,
        status: item.status,
        currentStage: item.currentStage,
        workflowState: item.workflowState,
      })
    ) {
      return true;
    }
    return canAddExecutionActivity({
      role: user.role,
      departmentId: user.departmentId,
      status: item.status,
      workflowState: item.workflowState,
      concernedDepartmentIds: concernedIds,
    });
  }

  private compareAttention(
    left: { reasons: AttentionReason[]; dueDate: Date | string },
    right: { reasons: AttentionReason[]; dueDate: Date | string },
  ) {
    const rank = attentionRank(left.reasons) - attentionRank(right.reasons);
    if (rank !== 0) {
      return rank;
    }
    return new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime();
  }

  private stageInsights(
    cases: Case[],
    movementsByCase: Map<string, CaseMovement[]>,
    now: Date,
  ) {
    const completed: Record<WorkflowStage, number[]> = {
      [WorkflowStage.SECRETARIAT]: [],
      [WorkflowStage.STUDIES_COMMITTEE]: [],
      [WorkflowStage.TECHNICAL_OFFICE]: [],
      [WorkflowStage.CHAIRMAN]: [],
    };
    const waiting: Record<WorkflowStage, number> = {
      [WorkflowStage.SECRETARIAT]: 0,
      [WorkflowStage.STUDIES_COMMITTEE]: 0,
      [WorkflowStage.TECHNICAL_OFFICE]: 0,
      [WorkflowStage.CHAIRMAN]: 0,
    };
    const overdueWaiting: Record<WorkflowStage, number> = {
      [WorkflowStage.SECRETARIAT]: 0,
      [WorkflowStage.STUDIES_COMMITTEE]: 0,
      [WorkflowStage.TECHNICAL_OFFICE]: 0,
      [WorkflowStage.CHAIRMAN]: 0,
    };

    for (const item of cases) {
      const stays = this.stageStays(item, movementsByCase.get(item.id) || [], now);
      for (const stay of stays) {
        if (stay.endedAt) {
          completed[stay.stage].push(daysBetween(stay.startedAt, stay.endedAt));
        }
      }
      if (
        isCaseActive(item.status, item.workflowState) &&
        WORKFLOW_SEQUENCE.includes(item.currentStage)
      ) {
        waiting[item.currentStage] += 1;
        if (computeTimelineStatus(item.dueDate, item.targetTimelineDays) === TimelineStatus.OVERDUE) {
          overdueWaiting[item.currentStage] += 1;
        }
      }
    }

    return WORKFLOW_SEQUENCE.map((stage) => ({
      stage,
      waiting: waiting[stage],
      overdueWaiting: overdueWaiting[stage],
      averageDays: average(completed[stage]),
      sampleSize: completed[stage].length,
    }));
  }

  private stageStays(
    item: Case,
    movements: CaseMovement[],
    now: Date,
  ): Array<{ stage: WorkflowStage; startedAt: Date; endedAt: Date | null }> {
    const ordered = [...movements].sort(
      (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );
    let stage = WorkflowStage.SECRETARIAT;
    let startedAt = new Date(item.createdAt);
    const stays: Array<{ stage: WorkflowStage; startedAt: Date; endedAt: Date | null }> = [];

    for (const movement of ordered) {
      const next =
        movement.action === WorkflowActionType.DECISION
          ? null
          : movement.toStage && movement.toStage !== stage
            ? movement.toStage
            : null;
      if (movement.action === WorkflowActionType.CREATED) {
        stage = movement.toStage || WorkflowStage.SECRETARIAT;
        startedAt = new Date(movement.createdAt);
        continue;
      }
      if (next || movement.action === WorkflowActionType.DECISION) {
        stays.push({
          stage,
          startedAt,
          endedAt: new Date(movement.createdAt),
        });
        if (movement.action === WorkflowActionType.DECISION) {
          return stays;
        }
        stage = next as WorkflowStage;
        startedAt = new Date(movement.createdAt);
      }
    }

    if (isCaseActive(item.status, item.workflowState)) {
      stays.push({ stage: item.currentStage, startedAt, endedAt: null });
    } else {
      stays.push({
        stage,
        startedAt,
        endedAt: new Date(item.lastActivityAt || now),
      });
    }
    return stays;
  }

  private departmentInsights(
    departments: Department[],
    cases: Case[],
    decisionsByCase: Map<string, CaseDecision[]>,
    activitiesByCase: Map<string, ExecutionActivity[]>,
    from: Date | null,
    to: Date | null,
  ) {
    return departments.map((department) => {
      const involved = cases.filter((item) => this.involvesDepartment(item, department.id));
      const active = involved.filter((item) => isCaseActive(item.status, item.workflowState));
      const overdue = active.filter(
        (item) =>
          computeTimelineStatus(item.dueDate, item.targetTimelineDays) === TimelineStatus.OVERDUE,
      );
      const awaitingExecution = active.filter(
        (item) =>
          item.workflowState === WorkflowState.IN_EXECUTION ||
          item.workflowState === WorkflowState.AWAITING_REPORT,
      );
      const closedInPeriod = involved.filter(
        (item) =>
          isCaseClosed(item.status, item.workflowState) &&
          inPeriod(item.lastActivityAt, from, to),
      );
      const responseDays: number[] = [];
      for (const item of involved) {
        const approval = (decisionsByCase.get(item.id) || []).find(
          (decision) => decision.type === DecisionType.APPROVAL,
        );
        const firstActivity = (activitiesByCase.get(item.id) || []).find(
          (activity) => activity.departmentId === department.id,
        );
        if (approval && firstActivity) {
          responseDays.push(daysBetween(approval.createdAt, firstActivity.createdAt));
        }
      }
      return {
        id: department.id,
        nameEn: department.nameEn,
        nameAr: department.nameAr,
        active: active.length,
        overdue: overdue.length,
        awaitingExecution: awaitingExecution.length,
        closedInPeriod: closedInPeriod.length,
        overdueRatio: ratio(overdue.length, active.length),
        averageResponseDays: average(responseDays),
        responseSampleSize: responseDays.length,
      };
    });
  }

  private categoryInsights(cases: Case[], from: Date | null, to: Date | null) {
    const groups = new Map<
      string,
      {
        id: string;
        nameEn: string;
        nameAr: string;
        createdInPeriod: number;
        active: number;
        overdue: number;
        closedInPeriod: number;
        closedOnTime: number;
      }
    >();
    for (const item of cases) {
      const current = groups.get(item.categoryId) ?? {
        id: item.categoryId,
        nameEn: item.categoryNameEn,
        nameAr: item.categoryNameAr,
        createdInPeriod: 0,
        active: 0,
        overdue: 0,
        closedInPeriod: 0,
        closedOnTime: 0,
      };
      if (inPeriod(item.createdAt, from, to)) {
        current.createdInPeriod += 1;
      }
      if (isCaseActive(item.status, item.workflowState)) {
        current.active += 1;
        if (
          computeTimelineStatus(item.dueDate, item.targetTimelineDays) === TimelineStatus.OVERDUE
        ) {
          current.overdue += 1;
        }
      }
      if (
        isCaseClosed(item.status, item.workflowState) &&
        inPeriod(item.lastActivityAt, from, to)
      ) {
        current.closedInPeriod += 1;
        if (new Date(item.lastActivityAt).getTime() <= new Date(item.dueDate).getTime()) {
          current.closedOnTime += 1;
        }
      }
      groups.set(item.categoryId, current);
    }
    return [...groups.values()]
      .map((item) => ({
        ...item,
        overdueRatio: ratio(item.overdue, item.active),
        timelineComplianceRate: ratio(item.closedOnTime, item.closedInPeriod),
      }))
      .sort((left, right) => right.active - left.active || right.createdInPeriod - left.createdInPeriod);
  }

  private involvesDepartment(item: Case, departmentId: string): boolean {
    if (item.ownerDepartmentId === departmentId) {
      return true;
    }
    return (item.concernedDepartments || []).some((entry) => entry.departmentId === departmentId);
  }

  private chairmanEnteredAt(item: Case, movements: CaseMovement[]): Date {
    const entered = [...movements]
      .filter(
        (movement) =>
          movement.toStage === WorkflowStage.CHAIRMAN &&
          (movement.action === WorkflowActionType.FORWARD ||
            movement.action === WorkflowActionType.CREATED),
      )
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
    if (entered.length) {
      return entered[entered.length - 1].createdAt;
    }
    return item.createdAt;
  }

  private previousWindow(from: Date | null, to: Date | null) {
    if (!from || !to) {
      return null;
    }
    const span = to.getTime() - from.getTime();
    if (span <= 0) {
      return null;
    }
    const previousTo = new Date(from.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - span);
    return { from: previousFrom, to: previousTo };
  }

  private trendRange(from: Date | null, to: Date | null, cases: Case[]) {
    const end = to ?? new Date();
    if (from) {
      return { from, to: end };
    }
    const created = cases.map((item) => new Date(item.createdAt).getTime());
    const earliest = created.length ? Math.min(...created) : end.getTime() - 90 * 24 * 60 * 60 * 1000;
    return { from: new Date(earliest), to: end };
  }

  private trendSeries(cases: Case[], decisions: CaseDecision[], from: Date, to: Date) {
    const spanDays = Math.max(1, daysBetween(from, to));
    const grain: 'week' | 'month' = spanDays <= 120 ? 'week' : 'month';
    const buckets = this.makeBuckets(from, to, grain);
    const series = buckets.map((bucket) => {
      let created = 0;
      let closed = 0;
      let closedOnTime = 0;
      for (const item of cases) {
        if (inPeriod(item.createdAt, bucket.start, bucket.end)) {
          created += 1;
        }
        if (
          isCaseClosed(item.status, item.workflowState) &&
          inPeriod(item.lastActivityAt, bucket.start, bucket.end)
        ) {
          closed += 1;
          if (new Date(item.lastActivityAt).getTime() <= new Date(item.dueDate).getTime()) {
            closedOnTime += 1;
          }
        }
      }
      const decisionCount = decisions.filter((decision) =>
        inPeriod(decision.createdAt, bucket.start, bucket.end),
      ).length;
      return {
        key: bucket.key,
        start: bucket.start.toISOString(),
        grain,
        created,
        closed,
        closedOnTime,
        decisions: decisionCount,
      };
    });
    const firstActive = series.findIndex(
      (item) => item.created || item.closed || item.decisions,
    );
    return firstActive > 0 ? series.slice(firstActive) : series;
  }

  private makeBuckets(from: Date, to: Date, grain: 'week' | 'month') {
    const buckets: Array<{ key: string; start: Date; end: Date }> = [];
    if (grain === 'week') {
      const cursor = new Date(from);
      cursor.setHours(0, 0, 0, 0);
      while (cursor <= to) {
        const start = new Date(cursor);
        const end = new Date(cursor);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        buckets.push({
          key: this.isoDay(start),
          start,
          end: end > to ? new Date(to) : end,
        });
        cursor.setDate(cursor.getDate() + 7);
        if (buckets.length > 400) {
          break;
        }
      }
      return buckets;
    }
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    while (cursor <= to) {
      const start = cursor < from ? new Date(from) : new Date(cursor);
      const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
      buckets.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        start,
        end: end > to ? new Date(to) : end,
      });
      cursor.setMonth(cursor.getMonth() + 1);
      if (buckets.length > 400) {
        break;
      }
    }
    return buckets;
  }

  private isoDay(value: Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  private departmentStageHeatmap(departments: Department[], cases: Case[]) {
    return departments.map((department) => ({
      id: department.id,
      nameEn: department.nameEn,
      nameAr: department.nameAr,
      stages: WORKFLOW_SEQUENCE.map((stage) => ({
        stage,
        count: cases.filter(
          (item) =>
            isCaseActive(item.status, item.workflowState) &&
            item.ownerDepartmentId === department.id &&
            item.currentStage === stage,
        ).length,
      })),
    }));
  }

  private groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const item of items) {
      const list = groups.get(key(item)) ?? [];
      list.push(item);
      groups.set(key(item), list);
    }
    return groups;
  }
}
