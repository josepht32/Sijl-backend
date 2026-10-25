import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Organization } from '../entities/organization.entity';
import { Department } from '../entities/department.entity';
import { User } from '../entities/user.entity';
import { CaseCategory } from '../entities/case-category.entity';
import { Case } from '../entities/case.entity';
import { CaseMovement } from '../entities/case-movement.entity';
import { WorkflowStageAssignment } from '../entities/workflow-stage-assignment.entity';
import { Role } from '../common/enums/role.enum';
import { DemoDatasetSeeder } from './demo-dataset.seeder';
import { RolesService } from '../modules/roles/roles.service';
import { WORKFLOW_ACTOR_EMAILS } from '../common/roles/predefined-roles';
import {
  WorkflowActionType,
  WorkflowStage,
  WorkflowState,
} from '../common/enums/workflow.enums';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
    @InjectRepository(Department)
    private readonly departments: Repository<Department>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(CaseCategory)
    private readonly categories: Repository<CaseCategory>,
    @InjectRepository(Case)
    private readonly cases: Repository<Case>,
    @InjectRepository(CaseMovement)
    private readonly movements: Repository<CaseMovement>,
    @InjectRepository(WorkflowStageAssignment)
    private readonly assignments: Repository<WorkflowStageAssignment>,
    private readonly rolesService: RolesService,
    private readonly demo: DemoDatasetSeeder,
  ) {}

  async onModuleInit() {
    const existing = await this.users.count();
    if (existing === 0) {
      await this.seedBaseOrganization();
    }

    await this.ensureRoles();
    await this.ensureWorkflowFoundation();
    await this.assignUserRoles();
    await this.localizeEgyptianIdentity();
    if (process.env.SKIP_DEMO_SEED !== 'true') {
      await this.demo.ensure();
    }
    await this.assignUserRoles();
  }

  private async seedBaseOrganization() {

    const organization = await this.organizations.save(
      this.organizations.create({
        nameEn: 'Cairo Correspondence Authority',
        nameAr: 'هيئة المراسلات بالقاهرة',
      }),
    );

    const passwordHash = await bcrypt.hash('Admin123!', 10);

    const generalAdmin = await this.departments.save(
      this.departments.create({
        nameEn: 'General Administration',
        nameAr: 'الإدارة العامة',
        descriptionEn: 'Central administration and coordination',
        descriptionAr: 'الإدارة المركزية والتنسيق',
        organizationId: organization.id,
      }),
    );

    const procurement = await this.departments.save(
      this.departments.create({
        nameEn: 'Procurement',
        nameAr: 'المشتريات',
        descriptionEn: 'Purchasing and contracting correspondence',
        descriptionAr: 'مراسلات الشراء والتعاقد',
        organizationId: organization.id,
      }),
    );

    const legal = await this.departments.save(
      this.departments.create({
        nameEn: 'Legal Affairs',
        nameAr: 'الشؤون القانونية',
        descriptionEn: 'Legal opinions and regulatory files',
        descriptionAr: 'الآراء القانونية والملفات التنظيمية',
        organizationId: organization.id,
      }),
    );

    await this.departments.save(
      this.departments.create({
        nameEn: 'Human Resources',
        nameAr: 'الموارد البشرية',
        descriptionEn: 'Personnel and employment correspondence',
        descriptionAr: 'مراسلات شؤون الموظفين والتوظيف',
        organizationId: organization.id,
      }),
    );

    await this.rolesService.ensureDefaults(organization.id);
    const adminRole = await this.rolesService.findBySlug(organization.id, Role.ADMIN);
    const managerRole = await this.rolesService.findBySlug(
      organization.id,
      Role.DEPARTMENT_MANAGER,
    );
    const employeeRole = await this.rolesService.findBySlug(organization.id, Role.EMPLOYEE);

    const admin = await this.users.save(
      this.users.create({
        email: 'admin@sijil.local',
        passwordHash,
        nameEn: 'Amina El-Sayed',
        nameAr: 'أمينة السيد',
        role: Role.ADMIN,
        roleId: adminRole?.id ?? null,
        organizationId: organization.id,
        departmentId: generalAdmin.id,
        isActive: true,
      }),
    );

    const manager = await this.users.save(
      this.users.create({
        email: 'layla@sijil.local',
        passwordHash,
        nameEn: 'Layla Abdelrahman',
        nameAr: 'ليلى عبد الرحمن',
        role: Role.DEPARTMENT_MANAGER,
        roleId: managerRole?.id ?? null,
        organizationId: organization.id,
        departmentId: procurement.id,
        isActive: true,
      }),
    );

    await this.users.save(
      this.users.create({
        email: 'omar@sijil.local',
        passwordHash,
        nameEn: 'Omar Hassan',
        nameAr: 'عمر حسن',
        role: Role.EMPLOYEE,
        roleId: employeeRole?.id ?? null,
        organizationId: organization.id,
        departmentId: procurement.id,
        isActive: true,
      }),
    );

    await this.users.save(
      this.users.create({
        email: 'sara@sijil.local',
        passwordHash,
        nameEn: 'Sara El-Masry',
        nameAr: 'سارة المصري',
        role: Role.EMPLOYEE,
        roleId: employeeRole?.id ?? null,
        organizationId: organization.id,
        departmentId: legal.id,
        isActive: true,
      }),
    );

    await this.departments.update(generalAdmin.id, { managerId: admin.id });
    await this.departments.update(procurement.id, { managerId: manager.id });

    await this.categories.save([
      this.categories.create({
        nameEn: 'Procurement',
        nameAr: 'المشتريات',
        descriptionEn: 'Tenders, purchase requests, and supplier correspondence',
        descriptionAr: 'المناقصات وطلبات الشراء ومراسلات الموردين',
        targetTimelineDays: 4,
        retentionPeriodYears: 10,
        organizationId: organization.id,
        isActive: true,
      }),
      this.categories.create({
        nameEn: 'Legal Opinion',
        nameAr: 'رأي قانوني',
        descriptionEn: 'Legal review and advisory files',
        descriptionAr: 'ملفات المراجعة والاستشارة القانونية',
        targetTimelineDays: 7,
        retentionPeriodYears: 15,
        organizationId: organization.id,
        isActive: true,
      }),
      this.categories.create({
        nameEn: 'General Correspondence',
        nameAr: 'مراسلات عامة',
        descriptionEn: 'Routine internal and external correspondence',
        descriptionAr: 'المراسلات الداخلية والخارجية الاعتيادية',
        targetTimelineDays: 5,
        retentionPeriodYears: 7,
        organizationId: organization.id,
        isActive: true,
      }),
      this.categories.create({
        nameEn: 'Personnel',
        nameAr: 'شؤون الموظفين',
        descriptionEn: 'Employment and personnel requests',
        descriptionAr: 'طلبات التوظيف وشؤون الموظفين',
        targetTimelineDays: 3,
        retentionPeriodYears: 5,
        organizationId: organization.id,
        isActive: true,
      }),
    ]);

    this.logger.log(
      'Seed complete. Admin login: admin@sijil.local / Admin123!',
    );
  }

  private async localizeEgyptianIdentity() {
    const organization = await this.organizations.findOne({ where: {} });
    if (organization) {
      await this.organizations.update(organization.id, {
        nameEn: 'Cairo Correspondence Authority',
        nameAr: 'هيئة المراسلات بالقاهرة',
      });
    }

    const names: Array<{ email: string; nameEn: string; nameAr: string }> = [
      { email: 'admin@sijil.local', nameEn: 'Amina El-Sayed', nameAr: 'أمينة السيد' },
      { email: 'layla@sijil.local', nameEn: 'Layla Abdelrahman', nameAr: 'ليلى عبد الرحمن' },
      { email: 'omar@sijil.local', nameEn: 'Omar Hassan', nameAr: 'عمر حسن' },
      { email: 'sara@sijil.local', nameEn: 'Sara El-Masry', nameAr: 'سارة المصري' },
      { email: 'nora@sijil.local', nameEn: 'Noura Fathy', nameAr: 'نورا فتحي' },
      { email: 'fahad@sijil.local', nameEn: 'Fahd Mostafa', nameAr: 'فهد مصطفى' },
      { email: 'hind@sijil.local', nameEn: 'Hind Mansour', nameAr: 'هند منصور' },
      { email: 'khalid@sijil.local', nameEn: 'Khaled Fouad', nameAr: 'خالد فؤاد' },
      { email: 'maha@sijil.local', nameEn: 'Maha El-Guindy', nameAr: 'مها الجندي' },
      { email: 'nasser@sijil.local', nameEn: 'Nasser El-Shafei', nameAr: 'ناصر الشافعي' },
      { email: 'tariq@sijil.local', nameEn: 'Tarek Mahmoud', nameAr: 'طارق محمود' },
    ];

    for (const person of names) {
      const found = await this.users.findOne({ where: { email: person.email } });
      if (found && (found.nameEn !== person.nameEn || found.nameAr !== person.nameAr)) {
        await this.users.update(found.id, {
          nameEn: person.nameEn,
          nameAr: person.nameAr,
        });
      }
    }
  }

  private async ensureWorkflowFoundation() {
    const organization = await this.organizations.findOne({ where: {} });
    if (!organization) {
      return;
    }

    const passwordHash = await bcrypt.hash('Admin123!', 10);

    const offices: Array<{
      nameEn: string;
      nameAr: string;
      stage: WorkflowStage;
      email: string;
      nameEnPerson: string;
      nameArPerson: string;
    }> = [
      {
        nameEn: 'Secretariat',
        nameAr: 'الأمانة العامة',
        stage: WorkflowStage.SECRETARIAT,
        email: 'nora@sijil.local',
        nameEnPerson: 'Noura Fathy',
        nameArPerson: 'نورا فتحي',
      },
      {
        nameEn: 'Studies Committee',
        nameAr: 'لجنة الدراسات',
        stage: WorkflowStage.STUDIES_COMMITTEE,
        email: 'fahad@sijil.local',
        nameEnPerson: 'Fahd Mostafa',
        nameArPerson: 'فهد مصطفى',
      },
      {
        nameEn: 'Technical Office',
        nameAr: 'المكتب الفني',
        stage: WorkflowStage.TECHNICAL_OFFICE,
        email: 'hind@sijil.local',
        nameEnPerson: 'Hind Mansour',
        nameArPerson: 'هند منصور',
      },
      {
        nameEn: 'Office of the Chairman',
        nameAr: 'مكتب الرئيس',
        stage: WorkflowStage.CHAIRMAN,
        email: 'khalid@sijil.local',
        nameEnPerson: 'Khaled Fouad',
        nameArPerson: 'خالد فؤاد',
      },
    ];

    for (const office of offices) {
      let department = await this.departments.findOne({
        where: { nameEn: office.nameEn, organizationId: organization.id },
      });
      if (!department) {
        department = await this.departments.save(
          this.departments.create({
            nameEn: office.nameEn,
            nameAr: office.nameAr,
            organizationId: organization.id,
          }),
        );
      }

      let user = await this.users.findOne({ where: { email: office.email } });
      if (!user) {
        user = await this.users.save(
          this.users.create({
            email: office.email,
            passwordHash,
            nameEn: office.nameEnPerson,
            nameAr: office.nameArPerson,
            role: office.stage,
            organizationId: organization.id,
            departmentId: department.id,
            isActive: true,
          }),
        );
      } else if (
        user.nameEn !== office.nameEnPerson ||
        user.nameAr !== office.nameArPerson
      ) {
        await this.users.update(user.id, {
          nameEn: office.nameEnPerson,
          nameAr: office.nameArPerson,
        });
      }

      const assigned = await this.assignments.findOne({
        where: { userId: user.id, stage: office.stage },
      });
      if (!assigned) {
        await this.assignments.save(
          this.assignments.create({
            userId: user.id,
            stage: office.stage,
            organizationId: organization.id,
          }),
        );
      }

      if (!department.managerId) {
        await this.departments.update(department.id, { managerId: user.id });
      }
    }

    const cases = await this.cases.find();
    for (const caseEntity of cases) {
      if (!caseEntity.currentStage) {
        await this.cases.update(caseEntity.id, {
          currentStage: WorkflowStage.SECRETARIAT,
          workflowState: caseEntity.workflowState || WorkflowState.IN_REVIEW,
        });
      }
      const movementCount = await this.movements.count({
        where: { caseId: caseEntity.id },
      });
      if (movementCount === 0) {
        await this.movements.save(
          this.movements.create({
            caseId: caseEntity.id,
            action: WorkflowActionType.CREATED,
            fromStage: null,
            toStage: caseEntity.currentStage || WorkflowStage.SECRETARIAT,
            instruction: null,
            performedById: caseEntity.createdById,
          }),
        );
      }
    }

    this.logger.log(
      'Workflow offices ready: nora / fahad / hind / khalid @sijil.local',
    );
  }

  private async ensureRoles() {
    const organizations = await this.organizations.find();
    for (const organization of organizations) {
      await this.rolesService.ensureDefaults(organization.id);
    }
  }

  private async assignUserRoles() {
    const organizations = await this.organizations.find();
    for (const organization of organizations) {
      const roles = await this.rolesService.findAll(organization.id);
      const bySlug = new Map(roles.map((role) => [role.slug, role]));
      const people = await this.users.find({ where: { organizationId: organization.id } });
      for (const person of people) {
        if (person.roleId) {
          continue;
        }
        const actorSlug = WORKFLOW_ACTOR_EMAILS[person.email];
        const desiredSlug =
          actorSlug && person.role === Role.EMPLOYEE ? actorSlug : person.role;
        const definition = bySlug.get(desiredSlug) ?? bySlug.get(Role.EMPLOYEE);
        if (!definition) {
          continue;
        }
        await this.users.update(person.id, {
          roleId: definition.id,
          role: definition.slug,
        });
      }
    }
  }
}
