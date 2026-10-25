import { CaseStatus, TimelineStatus } from '../enums/case.enums';
import { WorkflowState } from '../enums/workflow.enums';
import { computeTimelineStatus } from './timeline';

export const MS_DAY = 24 * 60 * 60 * 1000;
export const INACTIVE_DAYS = 14;
export const STALLED_EXECUTION_DAYS = 7;
export const ATTENTION_LIMIT = 15;
export const RECENT_LIMIT = 8;

/**
 * Metric definitions used by both operational and executive analytics.
 *
 * Active: not closed and not archived.
 * Overdue: active, and the case due date is in the past.
 * Case age: now − createdAt for active cases; lastActivityAt − createdAt when closed.
 * Resolution time: lastActivityAt − createdAt for closed/archived cases only.
 * Timeline compliance (current): share of active cases that are not overdue.
 * Timeline compliance (period): share of cases closed in the period whose
 *   lastActivityAt is on or before the due date.
 * Workflow stage duration: elapsed time between entering a stage and the next
 *   movement that leaves it, using case_movements timestamps.
 */
export type AgingBucket =
  | 'within_timeline'
  | 'approaching'
  | 'overdue'
  | 'severely_overdue';

export type AttentionReason =
  | 'awaiting_chairman'
  | 'awaiting_action'
  | 'overdue'
  | 'severely_overdue'
  | 'due_soon'
  | 'inactive'
  | 'assigned';

export function isCaseClosed(status: CaseStatus, workflowState: WorkflowState): boolean {
  return status === CaseStatus.CLOSED || workflowState === WorkflowState.ARCHIVED;
}

export function isCaseActive(status: CaseStatus, workflowState: WorkflowState): boolean {
  return !isCaseClosed(status, workflowState);
}

export function daysBetween(from: Date | string, to: Date | string): number {
  return Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / MS_DAY);
}

export function roundDays(value: number): number {
  return Math.round(value * 10) / 10;
}

export function average(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  return roundDays(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * (p / 100);
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) {
    return roundDays(sorted[low]);
  }
  return roundDays(sorted[low] + (sorted[high] - sorted[low]) * (index - low));
}

export function ratio(part: number, total: number): number | null {
  if (total <= 0) {
    return null;
  }
  return Math.round((part / total) * 1000) / 10;
}

export function inPeriod(
  value: Date | string,
  from: Date | null,
  to: Date | null,
): boolean {
  const time = new Date(value).getTime();
  if (from && time < from.getTime()) {
    return false;
  }
  if (to && time > to.getTime()) {
    return false;
  }
  return true;
}

export function agingBucket(params: {
  status: CaseStatus;
  workflowState: WorkflowState;
  dueDate: Date | string;
  targetTimelineDays: number;
  now?: Date;
}): AgingBucket | null {
  if (!isCaseActive(params.status, params.workflowState)) {
    return null;
  }
  const now = params.now ?? new Date();
  const timeline = computeTimelineStatus(params.dueDate, params.targetTimelineDays);
  if (timeline === TimelineStatus.OVERDUE) {
    const daysOverdue = daysBetween(params.dueDate, now);
    return daysOverdue > (params.targetTimelineDays || 7)
      ? 'severely_overdue'
      : 'overdue';
  }
  if (timeline === TimelineStatus.DUE_SOON) {
    return 'approaching';
  }
  return 'within_timeline';
}

export function attentionRank(reasons: AttentionReason[]): number {
  const order: AttentionReason[] = [
    'severely_overdue',
    'overdue',
    'awaiting_chairman',
    'awaiting_action',
    'due_soon',
    'inactive',
    'assigned',
  ];
  const index = order.findIndex((reason) => reasons.includes(reason));
  return index < 0 ? order.length : index;
}
