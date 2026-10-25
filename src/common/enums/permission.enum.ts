import { Role } from './role.enum';

export enum Permission {
  CASES_CREATE = 'cases.create',
  CASES_READ = 'cases.read',
  CASES_READ_ALL = 'cases.read_all',
  CASES_READ_DEPARTMENT = 'cases.read_department',
  CASES_DECIDE = 'cases.decide',
  CASES_ASSIGN_DEPARTMENTS = 'cases.assign_departments',
  CASES_GRANT_ACCESS = 'cases.grant_access',
  DOCUMENTS_SIGN = 'documents.sign',
  ANALYTICS_EXECUTIVE = 'analytics.executive',
  CATEGORIES_READ = 'categories.read',
  CATEGORIES_MANAGE = 'categories.manage',
  DEPARTMENTS_READ = 'departments.read',
  DEPARTMENTS_MANAGE = 'departments.manage',
  USERS_READ = 'users.read',
  USERS_MANAGE = 'users.manage',
  ROLES_READ = 'roles.read',
  ROLES_MANAGE = 'roles.manage',
}

export const PERMISSION_GROUPS: Array<{ id: string; permissions: Permission[] }> = [
  {
    id: 'cases',
    permissions: [
      Permission.CASES_CREATE,
      Permission.CASES_READ,
      Permission.CASES_READ_ALL,
      Permission.CASES_READ_DEPARTMENT,
      Permission.CASES_DECIDE,
      Permission.CASES_ASSIGN_DEPARTMENTS,
      Permission.CASES_GRANT_ACCESS,
    ],
  },
  {
    id: 'documents',
    permissions: [Permission.DOCUMENTS_SIGN],
  },
  {
    id: 'analytics',
    permissions: [Permission.ANALYTICS_EXECUTIVE],
  },
  {
    id: 'catalog',
    permissions: [
      Permission.CATEGORIES_READ,
      Permission.CATEGORIES_MANAGE,
      Permission.DEPARTMENTS_READ,
      Permission.DEPARTMENTS_MANAGE,
    ],
  },
  {
    id: 'people',
    permissions: [
      Permission.USERS_READ,
      Permission.USERS_MANAGE,
      Permission.ROLES_READ,
      Permission.ROLES_MANAGE,
    ],
  },
];

const EMPLOYEE_PERMISSIONS: Permission[] = [
  Permission.CASES_CREATE,
  Permission.CASES_READ,
  Permission.CATEGORIES_READ,
  Permission.DEPARTMENTS_READ,
  Permission.USERS_READ,
];

const REVIEW_OFFICE_PERMISSIONS: Permission[] = [...EMPLOYEE_PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.ADMIN]: Object.values(Permission),
  [Role.DEPARTMENT_MANAGER]: [
    Permission.CASES_CREATE,
    Permission.CASES_READ,
    Permission.CASES_READ_DEPARTMENT,
    Permission.CASES_GRANT_ACCESS,
    Permission.DOCUMENTS_SIGN,
    Permission.CATEGORIES_READ,
    Permission.DEPARTMENTS_READ,
    Permission.USERS_READ,
  ],
  [Role.EMPLOYEE]: EMPLOYEE_PERMISSIONS,
  [Role.SECRETARIAT]: REVIEW_OFFICE_PERMISSIONS,
  [Role.STUDIES_COMMITTEE]: REVIEW_OFFICE_PERMISSIONS,
  [Role.TECHNICAL_OFFICE]: REVIEW_OFFICE_PERMISSIONS,
  [Role.CHAIRMAN]: [
    ...EMPLOYEE_PERMISSIONS,
    Permission.CASES_READ_ALL,
    Permission.CASES_DECIDE,
    Permission.CASES_ASSIGN_DEPARTMENTS,
    Permission.CASES_GRANT_ACCESS,
    Permission.DOCUMENTS_SIGN,
    Permission.ANALYTICS_EXECUTIVE,
  ],
};

export function hasPermission(
  source: Permission[] | string | undefined,
  permission: Permission,
): boolean {
  if (Array.isArray(source)) {
    return source.includes(permission);
  }
  if (!source) {
    return false;
  }
  return ROLE_PERMISSIONS[source as Role]?.includes(permission) ?? false;
}

export function permissionsFor(role: string | undefined): Permission[] {
  if (!role) {
    return [];
  }
  return ROLE_PERMISSIONS[role as Role] ?? [];
}

export function grantedPermissions(user: {
  permissions?: Permission[];
  role?: string;
}): Permission[] {
  if (user.permissions?.length) {
    return user.permissions;
  }
  return permissionsFor(user.role);
}
