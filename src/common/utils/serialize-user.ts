import { User } from '../../entities/user.entity';
import { grantedPermissions } from '../enums/permission.enum';

export function serializeUser(user: User) {
  const roleDefinition = user.roleDefinition;
  return {
    id: user.id,
    email: user.email,
    nameEn: user.nameEn,
    nameAr: user.nameAr,
    role: user.role,
    roleId: user.roleId,
    roleNameEn: roleDefinition?.nameEn ?? null,
    roleNameAr: roleDefinition?.nameAr ?? null,
    isActive: user.isActive,
    organizationId: user.organizationId,
    departmentId: user.departmentId,
    department: user.department
      ? {
          id: user.department.id,
          nameEn: user.department.nameEn,
          nameAr: user.department.nameAr,
        }
      : null,
    workflowStages: user.workflowStages ?? [],
    permissions: grantedPermissions(user),
    createdAt: user.createdAt,
  };
}
