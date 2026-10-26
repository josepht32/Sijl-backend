import { Permission, ROLE_PERMISSIONS } from '../enums/permission.enum';
import { Role } from '../enums/role.enum';
import { WorkflowStage } from '../enums/workflow.enums';

export type PredefinedRoleSeed = {
  slug: Role;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  permissions: Permission[];
  workflowStages: WorkflowStage[];
  sortOrder: number;
};

export const PREDEFINED_ROLES: PredefinedRoleSeed[] = [
  {
    slug: Role.ADMIN,
    nameEn: 'Administrator',
    nameAr: 'مدير النظام',
    descriptionEn: 'Full access to configuration, people, and every case.',
    descriptionAr: 'صلاحية كاملة على الإعدادات والأشخاص وجميع المراسلات.',
    permissions: ROLE_PERMISSIONS[Role.ADMIN],
    workflowStages: Object.values(WorkflowStage),
    sortOrder: 10,
  },
  {
    slug: Role.CHAIRMAN,
    nameEn: 'Chairman',
    nameAr: 'الرئيس',
    descriptionEn: 'Final review, decisions, and executive oversight.',
    descriptionAr: 'المراجعة النهائية والقرارات والمتابعة التنفيذية.',
    permissions: ROLE_PERMISSIONS[Role.CHAIRMAN],
    workflowStages: [WorkflowStage.CHAIRMAN],
    sortOrder: 20,
  },
  {
    slug: Role.SECRETARIAT,
    nameEn: 'Secretariat',
    nameAr: 'الأمانة العامة',
    descriptionEn: 'Receives and routes incoming correspondence.',
    descriptionAr: 'تستلم المراسلات الواردة وتوجّهها.',
    permissions: ROLE_PERMISSIONS[Role.SECRETARIAT],
    workflowStages: [WorkflowStage.SECRETARIAT],
    sortOrder: 30,
  },
  {
    slug: Role.STUDIES_COMMITTEE,
    nameEn: 'Studies Committee',
    nameAr: 'لجنة الدراسات',
    descriptionEn: 'Studies the file and records a recommendation.',
    descriptionAr: 'تدرس المراسلة وتسجل التوصية.',
    permissions: ROLE_PERMISSIONS[Role.STUDIES_COMMITTEE],
    workflowStages: [WorkflowStage.STUDIES_COMMITTEE],
    sortOrder: 40,
  },
  {
    slug: Role.TECHNICAL_OFFICE,
    nameEn: 'Technical Office',
    nameAr: 'المكتب الفني',
    descriptionEn: 'Prepares the technical brief before the Chairman.',
    descriptionAr: 'يعد المذكرة الفنية قبل العرض على الرئيس.',
    permissions: ROLE_PERMISSIONS[Role.TECHNICAL_OFFICE],
    workflowStages: [WorkflowStage.TECHNICAL_OFFICE],
    sortOrder: 50,
  },
  {
    slug: Role.DEPARTMENT_MANAGER,
    nameEn: 'Department manager',
    nameAr: 'مدير إدارة',
    descriptionEn: 'Manages department cases and can grant access.',
    descriptionAr: 'يدير مراسلات الإدارة ويمكنه منح صلاحية الوصول.',
    permissions: ROLE_PERMISSIONS[Role.DEPARTMENT_MANAGER],
    workflowStages: [],
    sortOrder: 60,
  },
  {
    slug: Role.EMPLOYEE,
    nameEn: 'Employee',
    nameAr: 'موظف',
    descriptionEn: 'Creates and follows cases assigned to them.',
    descriptionAr: 'ينشئ المراسلات ويتابع ما يُسند إليه.',
    permissions: ROLE_PERMISSIONS[Role.EMPLOYEE],
    workflowStages: [],
    sortOrder: 70,
  },
];

export const WORKFLOW_ACTOR_EMAILS: Record<string, Role> = {
  'nora@sijil.local': Role.SECRETARIAT,
  'fahad@sijil.local': Role.STUDIES_COMMITTEE,
  'hind@sijil.local': Role.TECHNICAL_OFFICE,
  'khalid@sijil.local': Role.CHAIRMAN,
};
