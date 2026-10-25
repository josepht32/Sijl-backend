import { isAdminRole } from '../enums/role.enum';
import { Permission, hasPermission } from '../enums/permission.enum';
import { WorkflowStage } from '../enums/workflow.enums';

export function canManageCaseAccess(
  role: string,
  permissions?: Permission[],
): boolean {
  return isAdminRole(role) || hasPermission(permissions ?? role, Permission.CASES_GRANT_ACCESS);
}

export function canSignCaseDocuments(params: {
  role: string;
  assignedStages?: WorkflowStage[];
  permissions?: Permission[];
}): boolean {
  if (
    isAdminRole(params.role) ||
    hasPermission(params.permissions ?? params.role, Permission.DOCUMENTS_SIGN)
  ) {
    return true;
  }
  return Boolean(params.assignedStages?.includes(WorkflowStage.CHAIRMAN));
}

export function canViewExecutiveAnalytics(params: {
  role: string;
  assignedStages?: WorkflowStage[];
  permissions?: Permission[];
}): boolean {
  if (
    isAdminRole(params.role) ||
    hasPermission(params.permissions ?? params.role, Permission.ANALYTICS_EXECUTIVE)
  ) {
    return true;
  }
  return Boolean(params.assignedStages?.includes(WorkflowStage.CHAIRMAN));
}
