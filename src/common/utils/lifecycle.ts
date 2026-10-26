import { isAdminRole } from '../enums/role.enum';
import { CaseStatus } from '../enums/case.enums';
import { Permission, hasPermission } from '../enums/permission.enum';
import { DecisionType } from '../enums/decision.enums';
import { WorkflowStage, WorkflowState } from '../enums/workflow.enums';

const POST_REVIEW_STATES: WorkflowState[] = [
  WorkflowState.AWAITING_CHAIRMAN,
  WorkflowState.IN_EXECUTION,
  WorkflowState.AWAITING_REPORT,
  WorkflowState.COMPLETED,
  WorkflowState.ARCHIVED,
];

export function isReviewLocked(
  status: CaseStatus,
  workflowState: WorkflowState,
): boolean {
  return status === CaseStatus.CLOSED || POST_REVIEW_STATES.includes(workflowState);
}

export function canDecide(params: {
  role: string;
  assignedStages?: WorkflowStage[];
  permissions?: Permission[];
  status: CaseStatus;
  currentStage: WorkflowStage;
  workflowState: WorkflowState;
}): boolean {
  if (params.status === CaseStatus.CLOSED) {
    return false;
  }
  if (
    params.currentStage !== WorkflowStage.CHAIRMAN ||
    params.workflowState !== WorkflowState.AWAITING_CHAIRMAN
  ) {
    return false;
  }
  if (
    isAdminRole(params.role) ||
    hasPermission(params.permissions ?? params.role, Permission.CASES_DECIDE)
  ) {
    return true;
  }
  return Boolean(params.assignedStages?.includes(WorkflowStage.CHAIRMAN));
}

export function availableDecisionTypes(params: {
  role: string;
  assignedStages?: WorkflowStage[];
  permissions?: Permission[];
  status: CaseStatus;
  currentStage: WorkflowStage;
  workflowState: WorkflowState;
}): DecisionType[] {
  return canDecide(params) ? Object.values(DecisionType) : [];
}

export function canManageConcernedDepartments(params: {
  role: string;
  assignedStages?: WorkflowStage[];
  permissions?: Permission[];
  status: CaseStatus;
  workflowState: WorkflowState;
}): boolean {
  if (
    params.status === CaseStatus.CLOSED ||
    params.workflowState === WorkflowState.ARCHIVED ||
    params.workflowState === WorkflowState.COMPLETED
  ) {
    return false;
  }
  if (
    isAdminRole(params.role) ||
    hasPermission(params.permissions ?? params.role, Permission.CASES_ASSIGN_DEPARTMENTS)
  ) {
    return true;
  }
  return Boolean(params.assignedStages?.includes(WorkflowStage.CHAIRMAN));
}

export function canAddExecutionActivity(params: {
  role: string;
  departmentId: string | null;
  status: CaseStatus;
  workflowState: WorkflowState;
  concernedDepartmentIds: string[];
}): boolean {
  if (
    params.status === CaseStatus.CLOSED ||
    params.workflowState === WorkflowState.ARCHIVED ||
    params.workflowState === WorkflowState.COMPLETED
  ) {
    return false;
  }
  if (
    params.workflowState !== WorkflowState.IN_EXECUTION &&
    params.workflowState !== WorkflowState.AWAITING_REPORT
  ) {
    return false;
  }
  if (isAdminRole(params.role)) {
    return true;
  }
  return Boolean(
    params.departmentId && params.concernedDepartmentIds.includes(params.departmentId),
  );
}

export function canCompleteCase(params: {
  role: string;
  departmentId: string | null;
  permissions?: Permission[];
  status: CaseStatus;
  workflowState: WorkflowState;
  concernedDepartmentIds: string[];
}): boolean {
  if (params.status === CaseStatus.CLOSED || params.workflowState !== WorkflowState.IN_EXECUTION) {
    return false;
  }
  if (
    isAdminRole(params.role) ||
    hasPermission(params.permissions ?? params.role, Permission.CASES_DECIDE)
  ) {
    return true;
  }
  return Boolean(
    params.departmentId && params.concernedDepartmentIds.includes(params.departmentId),
  );
}
