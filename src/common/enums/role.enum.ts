export enum Role {
  ADMIN = 'admin',
  DEPARTMENT_MANAGER = 'department_manager',
  EMPLOYEE = 'employee',
  SECRETARIAT = 'secretariat',
  STUDIES_COMMITTEE = 'studies_committee',
  TECHNICAL_OFFICE = 'technical_office',
  CHAIRMAN = 'chairman',
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === Role.ADMIN;
}
