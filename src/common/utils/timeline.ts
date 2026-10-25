import { TimelineStatus } from '../enums/case.enums';

const MS_DAY = 24 * 60 * 60 * 1000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_DAY);
}

export function addYears(from: Date, years: number): Date {
  const next = new Date(from);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

export function computeTimelineStatus(
  dueDate: Date | string | null,
  targetTimelineDays: number,
): TimelineStatus {
  if (!dueDate) {
    return TimelineStatus.ON_TRACK;
  }

  const due = new Date(dueDate).getTime();
  const now = Date.now();
  const daysLeft = Math.ceil((due - now) / MS_DAY);

  if (daysLeft < 0) {
    return TimelineStatus.OVERDUE;
  }

  const threshold = Math.max(1, Math.ceil((targetTimelineDays || 7) * 0.25));
  if (daysLeft <= threshold) {
    return TimelineStatus.DUE_SOON;
  }

  return TimelineStatus.ON_TRACK;
}

export function dueSoonCutoff(from = new Date()): Date {
  return addDays(from, 2);
}
