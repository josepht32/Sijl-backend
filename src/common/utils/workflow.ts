import { isAdminRole } from '../enums/role.enum';
import { CaseStatus } from '../enums/case.enums';
import {
  AvailableWorkflowAction,
  WorkflowStage,
  WorkflowState,
} from '../enums/workflow.enums';
import { isReviewLocked } from './lifecycle';

export const WORKFLOW_SEQUENCE: WorkflowStage[] = [
  WorkflowStage.SECRETARIAT,
  WorkflowStage.STUDIES_COMMITTEE,
  WorkflowStage.TECHNICAL_OFFICE,
  WorkflowStage.CHAIRMAN,
];

export function nextStage(current: WorkflowStage): WorkflowStage | null {
  const index = WORKFLOW_SEQUENCE.indexOf(current);
  if (index < 0 || index >= WORKFLOW_SEQUENCE.length - 1) {
    return null;
  }
  return WORKFLOW_SEQUENCE[index + 1];
}

export function previousStage(current: WorkflowStage): WorkflowStage | null {
  const index = WORKFLOW_SEQUENCE.indexOf(current);
  if (index <= 0) {
    return null;
  }
  return WORKFLOW_SEQUENCE[index - 1];
}

export function canActOnStage(
  role: string,
  assignedStages: WorkflowStage[] | undefined,
  stage: WorkflowStage,
): boolean {
  if (isAdminRole(role)) {
    return true;
  }
  return Boolean(assignedStages?.includes(stage));
}

export function canResubmit(params: {
  role: string;
  userId: string;
  departmentId: string | null;
  createdById: string;
  returnedToUserId: string | null;
  returnedToDepartmentId: string | null;
}): boolean {
  if (isAdminRole(params.role)) {
    return true;
  }
  if (params.userId === params.createdById) {
    return true;
  }
  if (params.returnedToUserId && params.userId === params.returnedToUserId) {
    return true;
  }
  if (
    params.returnedToDepartmentId &&
    params.departmentId &&
    params.departmentId === params.returnedToDepartmentId
  ) {
    return true;
  }
  return false;
}

export function getAvailableActions(params: {
  role: string;
  assignedStages: WorkflowStage[] | undefined;
  userId: string;
  departmentId: string | null;
  createdById: string;
  currentStage: WorkflowStage;
  workflowState: WorkflowState;
  status?: CaseStatus;
  returnedToUserId: string | null;
  returnedToDepartmentId: string | null;
}): AvailableWorkflowAction[] {
  if (params.status && isReviewLocked(params.status, params.workflowState)) {
    return [];
  }

  if (params.workflowState === WorkflowState.AWAITING_INFO) {
    return canResubmit(params) ? ['resubmit'] : [];
  }

  if (params.currentStage === WorkflowStage.CHAIRMAN) {
    return [];
  }

  if (!canActOnStage(params.role, params.assignedStages, params.currentStage)) {
    return [];
  }

  return ['forward', 'return'];
}
