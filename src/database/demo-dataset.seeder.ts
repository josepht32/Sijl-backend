import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Organization } from '../entities/organization.entity';
import { Department } from '../entities/department.entity';
import { User } from '../entities/user.entity';
import { CaseCategory } from '../entities/case-category.entity';
import { Case } from '../entities/case.entity';
import { CaseMovement } from '../entities/case-movement.entity';
import { CaseDecision } from '../entities/case-decision.entity';
import { CaseConcernedDepartment } from '../entities/case-concerned-department.entity';
import { ExecutionActivity } from '../entities/execution-activity.entity';
import { Document } from '../entities/document.entity';
import { DocumentDownload } from '../entities/document-download.entity';
import { CaseGrant } from '../entities/case-grant.entity';
import { CaseRelation } from '../entities/case-relation.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { Role } from '../common/enums/role.enum';
import {
  CaseDirection,
  CaseStatus,
  CaseType,
} from '../common/enums/case.enums';
import { DecisionType } from '../common/enums/decision.enums';
import {
  ReturnTarget,
  WorkflowActionType,
  WorkflowStage,
  WorkflowState,
} from '../common/enums/workflow.enums';
import { addYears } from '../common/utils/timeline';
import { makeTraceCode } from '../common/utils/watermark';
import { extractDocumentText } from '../common/utils/document-text';

const DEMO_COUNT = 32;
const PASSWORD = 'Admin123!';
const EGYPT_DEMO_TITLE = 'Stationery contract for the Nasr City headquarters';

function at(daysFromNow: number, hour = 10): Date {
  const date = new Date();
  date.setHours(hour, 15, 0, 0);
  date.setDate(date.getDate() + daysFromNow);
  return date;
}

@Injectable()
export class DemoDatasetSeeder {
  private readonly logger = new Logger(DemoDatasetSeeder.name);

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
    @InjectRepository(CaseDecision)
    private readonly decisions: Repository<CaseDecision>,
    @InjectRepository(CaseConcernedDepartment)
    private readonly concerned: Repository<CaseConcernedDepartment>,
    @InjectRepository(ExecutionActivity)
    private readonly activities: Repository<ExecutionActivity>,
    @InjectRepository(Document)
    private readonly documents: Repository<Document>,
    @InjectRepository(DocumentDownload)
    private readonly downloads: Repository<DocumentDownload>,
    @InjectRepository(CaseGrant)
    private readonly grants: Repository<CaseGrant>,
    @InjectRepository(CaseRelation)
    private readonly relations: Repository<CaseRelation>,
    @InjectRepository(AuditLog)
    private readonly audits: Repository<AuditLog>,
  ) {}

  async ensure() {
    if (process.env.SKIP_DEMO_SEED === 'true') {
      return;
    }
    const organization = await this.organizations.findOne({ where: {} });
    if (!organization) {
      return;
    }

    await this.ensurePeopleAndCatalog(organization.id);

    const existing = await this.cases.find({
      where: { referenceNumber: Like('DEMO-%') },
    });
    const alreadyEgyptian = existing.some(
      (item) =>
        item.referenceNumber === 'DEMO-031' &&
        item.title.includes('Alexandria'),
    );
    if (existing.length >= DEMO_COUNT && alreadyEgyptian) {
      this.logger.log(`Demo dataset already loaded (${existing.length} cases)`);
      return;
    }
    if (existing.length) {
      await this.wipeDemoCases(existing.map((item) => item.id));
    }

    await this.seedCases(organization.id);
    this.logger.log(
      `Demo dataset ready: ${DEMO_COUNT} cases covering every lifecycle state. Password ${PASSWORD}`,
    );
  }

  private async ensurePeopleAndCatalog(organizationId: string) {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const hr = await this.departments.findOne({
      where: { nameEn: 'Human Resources', organizationId },
    });
    const procurement = await this.departments.findOne({
      where: { nameEn: 'Procurement', organizationId },
    });

    const extras: Array<{
      email: string;
      nameEn: string;
      nameAr: string;
      role: Role;
      departmentId: string | null;
      isActive: boolean;
    }> = [
      {
        email: 'maha@sijil.local',
        nameEn: 'Maha El-Guindy',
        nameAr: 'مها الجندي',
        role: Role.DEPARTMENT_MANAGER,
        departmentId: hr?.id ?? null,
        isActive: true,
      },
      {
        email: 'nasser@sijil.local',
        nameEn: 'Nasser El-Shafei',
        nameAr: 'ناصر الشافعي',
        role: Role.EMPLOYEE,
        departmentId: hr?.id ?? null,
        isActive: true,
      },
      {
        email: 'tariq@sijil.local',
        nameEn: 'Tarek Mahmoud',
        nameAr: 'طارق محمود',
        role: Role.EMPLOYEE,
        departmentId: procurement?.id ?? null,
        isActive: false,
      },
    ];

    for (const person of extras) {
      const found = await this.users.findOne({ where: { email: person.email } });
      if (!found) {
        const saved = await this.users.save(this.users.create({ ...person, passwordHash, organizationId }));
        if (person.email === 'maha@sijil.local' && hr) {
          await this.departments.update(hr.id, { managerId: saved.id });
        }
      } else {
        await this.users.update(found.id, {
          nameEn: person.nameEn,
          nameAr: person.nameAr,
        });
      }
    }

    const inactiveCategory = await this.categories.findOne({
      where: { nameEn: 'Retired classification', organizationId },
    });
    if (!inactiveCategory) {
      await this.categories.save(
        this.categories.create({
          nameEn: 'Retired classification',
          nameAr: 'تصنيف متوقف',
          descriptionEn: 'Kept for history; not used for new cases',
          descriptionAr: 'يُحفظ للسجل التاريخي ولا يُستخدم للمراسلات الجديدة',
          targetTimelineDays: 5,
          retentionPeriodYears: 5,
          organizationId,
          isActive: false,
        }),
      );
    }
  }

  private async seedCases(organizationId: string) {
    const users = await this.byEmail();
    const depts = await this.byDepartment(organizationId);
    const cats = await this.byCategory(organizationId);
    const allDeptIds = Object.values(depts).map((department) => department.id);

    const created: Record<string, Case> = {};
    const docs: Record<string, Document> = {};

    const specs: Array<Parameters<DemoDatasetSeeder['insertCase']>[0]> = [
      {
        ref: 'DEMO-001',
        title: EGYPT_DEMO_TITLE,
        description: 'ملف تأهيل مورد القرطاسية لمقر الهيئة في مدينة نصر',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.procurement,
        owner: depts.procurement,
        createdBy: users.omar,
        assignedTo: users.omar,
        createdDaysAgo: 2,
        dueInDays: 8,
        lastActivityDaysAgo: 0,
        stage: WorkflowStage.SECRETARIAT,
        state: WorkflowState.IN_REVIEW,
        status: CaseStatus.OPEN,
        path: [{ day: 0, action: 'created', by: users.omar }],
      },
      {
        ref: 'DEMO-002',
        title: 'Purchase request for committee equipment in the New Administrative Capital',
        description: 'طلب شراء لتجهيزات اجتماع اللجنة في العاصمة الإدارية الجديدة',
        type: CaseType.INTERNAL,
        direction: CaseDirection.OUTGOING,
        category: cats.procurement,
        owner: depts.procurement,
        createdBy: users.layla,
        createdDaysAgo: 3,
        dueInDays: 1,
        lastActivityDaysAgo: 1,
        stage: WorkflowStage.SECRETARIAT,
        state: WorkflowState.IN_REVIEW,
        status: CaseStatus.OPEN,
        path: [{ day: 0, action: 'created', by: users.layla }],
      },
      {
        ref: 'DEMO-003',
        title: 'Delayed tender clarification from Arab Contractors',
        description: 'استيضاح متأخر من شركة المقاولون العرب على مناقصة التوريد',
        type: CaseType.EXTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.procurement,
        owner: depts.procurement,
        createdBy: users.omar,
        createdDaysAgo: 12,
        dueInDays: -3,
        lastActivityDaysAgo: 2,
        stage: WorkflowStage.SECRETARIAT,
        state: WorkflowState.IN_REVIEW,
        status: CaseStatus.OPEN,
        sourceEntity: 'Arab Contractors',
        path: [{ day: 0, action: 'created', by: users.omar }],
      },
      {
        ref: 'DEMO-004',
        title: 'Legal opinion on the framework agreement with Arab Contractors',
        description: 'رأي قانوني حول بنود الاتفاقية الإطارية مع المقاولون العرب',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.legal,
        owner: depts.legal,
        createdBy: users.sara,
        createdDaysAgo: 8,
        dueInDays: 6,
        lastActivityDaysAgo: 1,
        stage: WorkflowStage.STUDIES_COMMITTEE,
        state: WorkflowState.IN_REVIEW,
        status: CaseStatus.OPEN,
        path: [
          { day: 0, action: 'created', by: users.sara },
          { day: 2, action: 'forward', from: WorkflowStage.SECRETARIAT, to: WorkflowStage.STUDIES_COMMITTEE, by: users.nora, instruction: 'Complete the legal screening against the Egyptian tenders law before committee review.' },
        ],
      },
      {
        ref: 'DEMO-005',
        title: 'Egyptian Tax Authority notice requiring a formal legal reply',
        description: 'إشعار من مصلحة الضرائب المصرية يتطلب رداً قانونياً رسمياً',
        type: CaseType.EXTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.legal,
        owner: depts.legal,
        createdBy: users.sara,
        createdDaysAgo: 18,
        dueInDays: -5,
        lastActivityDaysAgo: 4,
        stage: WorkflowStage.STUDIES_COMMITTEE,
        state: WorkflowState.IN_REVIEW,
        status: CaseStatus.OPEN,
        sourceEntity: 'Egyptian Tax Authority',
        path: [
          { day: 0, action: 'created', by: users.sara },
          { day: 3, action: 'forward', from: WorkflowStage.SECRETARIAT, to: WorkflowStage.STUDIES_COMMITTEE, by: users.nora, instruction: 'Studies should prepare the reply draft.' },
        ],
      },
      {
        ref: 'DEMO-006',
        title: 'Coordination memo from Cairo Governorate',
        description: 'مذكرة تنسيق من محافظة القاهرة بشأن مقار مدينة نصر',
        type: CaseType.INTERNAL,
        direction: CaseDirection.OUTGOING,
        category: cats.general,
        owner: depts.admin,
        createdBy: users.admin,
        createdDaysAgo: 16,
        dueInDays: -4,
        lastActivityDaysAgo: 3,
        stage: WorkflowStage.STUDIES_COMMITTEE,
        state: WorkflowState.IN_REVIEW,
        status: CaseStatus.OPEN,
        path: [
          { day: 0, action: 'created', by: users.admin },
          { day: 2, action: 'forward', from: WorkflowStage.SECRETARIAT, to: WorkflowStage.STUDIES_COMMITTEE, by: users.nora, instruction: 'Route to studies for coordination impact.' },
        ],
      },
      {
        ref: 'DEMO-007',
        title: 'Secondment request to the technical office in the New Administrative Capital',
        description: 'طلب إعارة موظف إلى المكتب الفني بالعاصمة الإدارية الجديدة',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.personnel,
        owner: depts.hr,
        createdBy: users.maha,
        createdDaysAgo: 6,
        dueInDays: 5,
        lastActivityDaysAgo: 1,
        stage: WorkflowStage.TECHNICAL_OFFICE,
        state: WorkflowState.IN_REVIEW,
        status: CaseStatus.OPEN,
        path: [
          { day: 0, action: 'created', by: users.maha },
          { day: 1, action: 'forward', from: WorkflowStage.SECRETARIAT, to: WorkflowStage.STUDIES_COMMITTEE, by: users.nora, instruction: 'Confirm staffing implications.' },
          { day: 3, action: 'forward', from: WorkflowStage.STUDIES_COMMITTEE, to: WorkflowStage.TECHNICAL_OFFICE, by: users.fahad, instruction: 'Technical office to confirm the receiving role.' },
        ],
      },
      {
        ref: 'DEMO-008',
        title: 'Overdue employment contract amendment under the civil service law',
        description: 'تعديل عقد توظيف متأخر عن المدة وفقاً لقانون الخدمة المدنية',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.personnel,
        owner: depts.hr,
        createdBy: users.nasser,
        createdDaysAgo: 22,
        dueInDays: -12,
        lastActivityDaysAgo: 6,
        stage: WorkflowStage.TECHNICAL_OFFICE,
        state: WorkflowState.IN_REVIEW,
        status: CaseStatus.OPEN,
        path: [
          { day: 0, action: 'created', by: users.nasser },
          { day: 2, action: 'forward', from: WorkflowStage.SECRETARIAT, to: WorkflowStage.STUDIES_COMMITTEE, by: users.nora, instruction: 'Needs committee review.' },
          { day: 8, action: 'forward', from: WorkflowStage.STUDIES_COMMITTEE, to: WorkflowStage.TECHNICAL_OFFICE, by: users.fahad, instruction: 'Still awaiting technical confirmation.' },
        ],
      },
      {
        ref: 'DEMO-009',
        title: 'Protocol correspondence from the Ministry of Foreign Affairs',
        description: 'مراسلات بروتوكول واردة من وزارة الخارجية',
        type: CaseType.EXTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.general,
        owner: depts.secretariat,
        createdBy: users.nora,
        createdDaysAgo: 14,
        dueInDays: -6,
        lastActivityDaysAgo: 5,
        stage: WorkflowStage.TECHNICAL_OFFICE,
        state: WorkflowState.IN_REVIEW,
        status: CaseStatus.OPEN,
        sourceEntity: 'Ministry of Foreign Affairs',
        path: [
          { day: 0, action: 'created', by: users.nora },
          { day: 4, action: 'forward', from: WorkflowStage.SECRETARIAT, to: WorkflowStage.STUDIES_COMMITTEE, by: users.nora, instruction: 'Protocol file for studies.' },
          { day: 7, action: 'forward', from: WorkflowStage.STUDIES_COMMITTEE, to: WorkflowStage.TECHNICAL_OFFICE, by: users.fahad, instruction: 'Technical formatting of the reply.' },
        ],
      },
      {
        ref: 'DEMO-010',
        title: 'Award recommendation for the Cairo Metro spare-parts tender',
        description: 'توصية ترسية مناقصة قطع غيار مترو القاهرة جاهزة لقرار الرئيس',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.procurement,
        owner: depts.procurement,
        createdBy: users.layla,
        assignedTo: users.khalid,
        createdDaysAgo: 11,
        dueInDays: 4,
        lastActivityDaysAgo: 1,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.AWAITING_CHAIRMAN,
        status: CaseStatus.OPEN,
        path: this.fullReview(users, 11, users.layla),
      },
      {
        ref: 'DEMO-011',
        title: 'Inactive legal file awaiting Chairman signature on the State Lawsuits brief',
        description: 'ملف قضايا الدولة غير النشط بانتظار توقيع الرئيس',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.legal,
        owner: depts.legal,
        createdBy: users.sara,
        createdDaysAgo: 28,
        dueInDays: -8,
        lastActivityDaysAgo: 18,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.AWAITING_CHAIRMAN,
        status: CaseStatus.OPEN,
        path: this.fullReview(users, 28, users.sara),
      },
      {
        ref: 'DEMO-012',
        title: 'Board briefing pack for the Cairo headquarters meeting this week',
        description: 'حزمة إحاطة مجلس الإدارة لاجتماع مقر القاهرة هذا الأسبوع',
        type: CaseType.INTERNAL,
        direction: CaseDirection.OUTGOING,
        category: cats.general,
        owner: depts.admin,
        createdBy: users.admin,
        createdDaysAgo: 9,
        dueInDays: 1,
        lastActivityDaysAgo: 0,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.AWAITING_CHAIRMAN,
        status: CaseStatus.OPEN,
        path: this.fullReview(users, 9, users.admin),
      },
      {
        ref: 'DEMO-013',
        title: 'Studies paper on New Urban Communities Authority land in 6th of October',
        description: 'ورقة لجنة الدراسات عن أراضي هيئة المجتمعات العمرانية بمدينة 6 أكتوبر',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.general,
        owner: depts.studies,
        createdBy: users.fahad,
        createdDaysAgo: 20,
        dueInDays: -7,
        lastActivityDaysAgo: 2,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.AWAITING_CHAIRMAN,
        status: CaseStatus.OPEN,
        path: this.fullReview(users, 20, users.fahad),
      },
      {
        ref: 'DEMO-014',
        title: 'Returned Giza warehouse procurement file missing annexes',
        description: 'ملف مشتريات مخزن الجيزة مُعاد لنقص المرفقات',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.procurement,
        owner: depts.procurement,
        createdBy: users.omar,
        createdDaysAgo: 10,
        dueInDays: -2,
        lastActivityDaysAgo: 1,
        stage: WorkflowStage.STUDIES_COMMITTEE,
        state: WorkflowState.AWAITING_INFO,
        status: CaseStatus.OPEN,
        returnedToUser: users.omar,
        returnedFrom: WorkflowStage.STUDIES_COMMITTEE,
        path: [
          { day: 0, action: 'created', by: users.omar },
          { day: 2, action: 'forward', from: WorkflowStage.SECRETARIAT, to: WorkflowStage.STUDIES_COMMITTEE, by: users.nora, instruction: 'Send to studies.' },
          { day: 6, action: 'return', from: WorkflowStage.STUDIES_COMMITTEE, by: users.fahad, instruction: 'Please attach the priced bill of quantities and the original bid bond for the Giza warehouse tender.' },
        ],
      },
      {
        ref: 'DEMO-015',
        title: 'Returned legal draft to confirm cited Civil Code articles',
        description: 'مسودة قانونية مُعادة لتأكيد المواد المستشهد بها من القانون المدني',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.legal,
        owner: depts.legal,
        createdBy: users.sara,
        createdDaysAgo: 7,
        dueInDays: 1,
        lastActivityDaysAgo: 0,
        stage: WorkflowStage.SECRETARIAT,
        state: WorkflowState.AWAITING_INFO,
        status: CaseStatus.OPEN,
        returnedToDepartment: depts.legal,
        returnedFrom: WorkflowStage.SECRETARIAT,
        path: [
          { day: 0, action: 'created', by: users.sara },
          { day: 4, action: 'return', from: WorkflowStage.SECRETARIAT, by: users.nora, instruction: 'Return to Legal Affairs to confirm the cited articles of the Egyptian Civil Code.' },
        ],
      },
      {
        ref: 'DEMO-016',
        title: 'Approved upgrade of the Dokki annex, now in execution',
        description: 'اعتماد ترقية ملحق الدقي وهي قيد التنفيذ',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.general,
        owner: depts.admin,
        createdBy: users.admin,
        assignedTo: users.layla,
        createdDaysAgo: 21,
        dueInDays: 9,
        lastActivityDaysAgo: 1,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.IN_EXECUTION,
        status: CaseStatus.OPEN,
        decision: DecisionType.APPROVAL,
        concerned: allDeptIds,
        activities: true,
        signed: true,
        path: [
          ...this.fullReview(users, 21, users.admin),
          { day: 14, action: 'decision', by: users.khalid, decision: DecisionType.APPROVAL, instruction: 'Approved. All concerned departments will execute according to the attached plan.' },
        ],
      },
      {
        ref: 'DEMO-017',
        title: 'Overdue digitization of the Abdeen records archive',
        description: 'تنفيذ متأخر لبرنامج رقمنة أرشيف عابدين',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.general,
        owner: depts.chairman,
        createdBy: users.khalid,
        createdDaysAgo: 40,
        dueInDays: -9,
        lastActivityDaysAgo: 8,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.IN_EXECUTION,
        status: CaseStatus.OPEN,
        decision: DecisionType.APPROVAL,
        concerned: allDeptIds,
        activities: true,
        path: [
          ...this.fullReview(users, 40, users.khalid),
          { day: 18, action: 'decision', by: users.khalid, decision: DecisionType.APPROVAL, instruction: 'Approved for execution. Report weekly until closure.' },
        ],
      },
      {
        ref: 'DEMO-018',
        title: 'Approved payment schedule to Arab Contractors',
        description: 'جدول دفعات المقاولون العرب المعتمد',
        type: CaseType.INTERNAL,
        direction: CaseDirection.OUTGOING,
        category: cats.procurement,
        owner: depts.procurement,
        createdBy: users.layla,
        createdDaysAgo: 16,
        dueInDays: 6,
        lastActivityDaysAgo: 2,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.IN_EXECUTION,
        status: CaseStatus.OPEN,
        decision: DecisionType.APPROVAL,
        concerned: [depts.procurement.id, depts.legal.id, depts.admin.id],
        activities: true,
        path: [
          ...this.fullReview(users, 16, users.layla),
          { day: 10, action: 'decision', by: users.khalid, decision: DecisionType.APPROVAL, instruction: 'Approved. Procurement and Legal will jointly administer payments.' },
        ],
      },
      {
        ref: 'DEMO-019',
        title: 'Detailed report requested on Central Auditing Organization observations',
        description: 'تقرير تفصيلي مطلوب حول ملاحظات الجهاز المركزي للمحاسبات',
        type: CaseType.EXTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.legal,
        owner: depts.legal,
        createdBy: users.sara,
        createdDaysAgo: 13,
        dueInDays: 1,
        lastActivityDaysAgo: 1,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.AWAITING_REPORT,
        status: CaseStatus.OPEN,
        sourceEntity: 'Central Auditing Organization',
        decision: DecisionType.REQUEST_DETAILED_REPORT,
        concerned: allDeptIds,
        activities: true,
        path: [
          ...this.fullReview(users, 13, users.sara),
          { day: 9, action: 'decision', by: users.khalid, decision: DecisionType.REQUEST_DETAILED_REPORT, instruction: 'Prepare a detailed report covering each observation and the proposed remedy.' },
        ],
      },
      {
        ref: 'DEMO-020',
        title: 'Overdue technical report on the 6th of October electricity connection',
        description: 'تقرير فني متأخر عن ربط الكهرباء بمدينة 6 أكتوبر',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.general,
        owner: depts.technical,
        createdBy: users.hind,
        createdDaysAgo: 24,
        dueInDays: -6,
        lastActivityDaysAgo: 5,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.AWAITING_REPORT,
        status: CaseStatus.OPEN,
        decision: DecisionType.REQUEST_DETAILED_REPORT,
        concerned: allDeptIds,
        activities: true,
        path: [
          ...this.fullReview(users, 24, users.hind),
          { day: 12, action: 'decision', by: users.khalid, decision: DecisionType.REQUEST_DETAILED_REPORT, instruction: 'Technical Office will lead the report with input from all departments.' },
        ],
      },
      {
        ref: 'DEMO-021',
        title: 'Archived protocol letter from the Ministry of Foreign Affairs, closed on time',
        description: 'خطاب بروتوكول من وزارة الخارجية أُرشف وأُغلق في مدته',
        type: CaseType.EXTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.general,
        owner: depts.secretariat,
        createdBy: users.nora,
        createdDaysAgo: 25,
        dueInDays: -4,
        lastActivityDaysAgo: 8,
        closedOnTime: true,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.ARCHIVED,
        status: CaseStatus.CLOSED,
        sourceEntity: 'Ministry of Foreign Affairs',
        decision: DecisionType.ARCHIVE,
        concerned: allDeptIds,
        activities: true,
        path: [
          ...this.fullReview(users, 25, users.nora),
          { day: 12, action: 'decision', by: users.khalid, decision: DecisionType.ARCHIVE, instruction: 'Noted and archived. No further operational action is required.' },
        ],
      },
      {
        ref: 'DEMO-022',
        title: 'Archived Administrative Prosecution inquiry that missed its timeline',
        description: 'استفسار النيابة الإدارية أُرشف بعد تجاوز المدة',
        type: CaseType.EXTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.legal,
        owner: depts.legal,
        createdBy: users.sara,
        createdDaysAgo: 35,
        dueInDays: -18,
        lastActivityDaysAgo: 6,
        closedOnTime: false,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.ARCHIVED,
        status: CaseStatus.CLOSED,
        sourceEntity: 'Administrative Prosecution',
        decision: DecisionType.ARCHIVE,
        concerned: allDeptIds,
        path: [
          ...this.fullReview(users, 35, users.sara),
          { day: 26, action: 'decision', by: users.khalid, decision: DecisionType.ARCHIVE, instruction: 'Closed after delay. Record the lessons in the next legal briefing.' },
        ],
      },
      {
        ref: 'DEMO-023',
        title: 'Closed Ministry of Supply award filed on time',
        description: 'ترسية مناقصة وزارة التموين أُغلقت في وقتها',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.procurement,
        owner: depts.procurement,
        createdBy: users.omar,
        createdDaysAgo: 20,
        dueInDays: -3,
        lastActivityDaysAgo: 6,
        closedOnTime: true,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.ARCHIVED,
        status: CaseStatus.CLOSED,
        decision: DecisionType.ARCHIVE,
        concerned: [depts.procurement.id, depts.legal.id],
        path: [
          ...this.fullReview(users, 20, users.omar),
          { day: 11, action: 'decision', by: users.khalid, decision: DecisionType.ARCHIVE, instruction: 'Award recorded and the file is archived.' },
        ],
      },
      {
        ref: 'DEMO-024',
        title: 'Closed legal opinion on Tenders Law 182/2018, delivered late',
        description: 'رأي قانوني في قانون تنظيم التعاقدات 182 لسنة 2018 أُغلق بعد التأخير',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.legal,
        owner: depts.legal,
        createdBy: users.sara,
        createdDaysAgo: 30,
        dueInDays: -14,
        lastActivityDaysAgo: 4,
        closedOnTime: false,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.ARCHIVED,
        status: CaseStatus.CLOSED,
        decision: DecisionType.ARCHIVE,
        concerned: [depts.legal.id, depts.admin.id],
        path: [
          ...this.fullReview(users, 30, users.sara),
          { day: 22, action: 'decision', by: users.khalid, decision: DecisionType.ARCHIVE, instruction: 'Opinion issued late and archived.' },
        ],
      },
      {
        ref: 'DEMO-025',
        title: 'Closed personnel promotion file under Civil Service Law 81/2016',
        description: 'ملف ترقية موظفين وفقاً لقانون الخدمة المدنية أُغلق',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.personnel,
        owner: depts.hr,
        createdBy: users.maha,
        createdDaysAgo: 18,
        dueInDays: -2,
        lastActivityDaysAgo: 5,
        closedOnTime: true,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.ARCHIVED,
        status: CaseStatus.CLOSED,
        decision: DecisionType.ARCHIVE,
        concerned: [depts.hr.id, depts.admin.id],
        path: [
          ...this.fullReview(users, 18, users.maha),
          { day: 10, action: 'decision', by: users.khalid, decision: DecisionType.ARCHIVE, instruction: 'Promotion approved historically and archived.' },
        ],
      },
      {
        ref: 'DEMO-026',
        title: 'Closed circular on attendance at the New Administrative Capital',
        description: 'تعميم الحضور في العاصمة الإدارية الجديدة أُغلق',
        type: CaseType.INTERNAL,
        direction: CaseDirection.OUTGOING,
        category: cats.general,
        owner: depts.admin,
        createdBy: users.admin,
        createdDaysAgo: 15,
        dueInDays: -1,
        lastActivityDaysAgo: 3,
        closedOnTime: true,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.ARCHIVED,
        status: CaseStatus.CLOSED,
        decision: DecisionType.ARCHIVE,
        concerned: [depts.admin.id, depts.secretariat.id],
        path: [
          ...this.fullReview(users, 15, users.admin),
          { day: 9, action: 'decision', by: users.khalid, decision: DecisionType.ARCHIVE, instruction: 'Circular issued and archived.' },
        ],
      },
      {
        ref: 'DEMO-027',
        title: 'Closed studies note on the Nile Corniche project, filed after the due date',
        description: 'ملاحظة الدراسات عن مشروع كورنيش النيل أُغلقت بعد الاستحقاق',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.general,
        owner: depts.studies,
        createdBy: users.fahad,
        createdDaysAgo: 27,
        dueInDays: -10,
        lastActivityDaysAgo: 7,
        closedOnTime: false,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.ARCHIVED,
        status: CaseStatus.CLOSED,
        decision: DecisionType.ARCHIVE,
        concerned: [depts.studies.id, depts.technical.id],
        path: [
          ...this.fullReview(users, 27, users.fahad),
          { day: 18, action: 'decision', by: users.khalid, decision: DecisionType.ARCHIVE, instruction: 'Archived after the timeline was exceeded.' },
        ],
      },
      {
        ref: 'DEMO-028',
        title: 'Closed Chairman correspondence with the Cabinet',
        description: 'مراسلة مكتب الرئيس مع مجلس الوزراء أُغلقت',
        type: CaseType.EXTERNAL,
        direction: CaseDirection.OUTGOING,
        category: cats.general,
        owner: depts.chairman,
        createdBy: users.khalid,
        createdDaysAgo: 19,
        dueInDays: -2,
        lastActivityDaysAgo: 4,
        closedOnTime: true,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.ARCHIVED,
        status: CaseStatus.CLOSED,
        sourceEntity: 'Cabinet of Egypt',
        decision: DecisionType.ARCHIVE,
        concerned: [depts.chairman.id, depts.secretariat.id],
        path: [
          ...this.fullReview(users, 19, users.khalid),
          { day: 12, action: 'decision', by: users.khalid, decision: DecisionType.ARCHIVE, instruction: 'Reply sent and the file is archived.' },
        ],
      },
      {
        ref: 'DEMO-029',
        title: 'Outgoing letter to the Ministry of Finance on the budget chapter',
        description: 'خطاب صادر إلى وزارة المالية بشأن باب الموازنة',
        type: CaseType.EXTERNAL,
        direction: CaseDirection.OUTGOING,
        category: cats.procurement,
        owner: depts.procurement,
        createdBy: users.layla,
        createdDaysAgo: 4,
        dueInDays: 7,
        lastActivityDaysAgo: 0,
        stage: WorkflowStage.SECRETARIAT,
        state: WorkflowState.IN_REVIEW,
        status: CaseStatus.OPEN,
        sourceEntity: 'Ministry of Finance',
        path: [{ day: 0, action: 'created', by: users.layla }],
      },
      {
        ref: 'DEMO-030',
        title: 'Incoming Central Auditing Organization follow-up now in execution',
        description: 'متابعة الجهاز المركزي للمحاسبات واردة قيد التنفيذ',
        type: CaseType.EXTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.legal,
        owner: depts.legal,
        createdBy: users.sara,
        createdDaysAgo: 17,
        dueInDays: -2,
        lastActivityDaysAgo: 1,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.IN_EXECUTION,
        status: CaseStatus.OPEN,
        sourceEntity: 'Central Auditing Organization',
        decision: DecisionType.APPROVAL,
        concerned: [depts.legal.id, depts.hr.id, depts.technical.id, depts.studies.id],
        activities: true,
        path: [
          ...this.fullReview(users, 17, users.sara),
          { day: 11, action: 'decision', by: users.khalid, decision: DecisionType.APPROVAL, instruction: 'Execute the agreed audit follow-up actions.' },
        ],
      },
      {
        ref: 'DEMO-031',
        title: 'Resubmitted Alexandria warehouse file after missing annexes were attached',
        description: 'ملف مخزن الإسكندرية أُعيد تقديمه بعد إرفاق الملاحق الناقصة',
        type: CaseType.INTERNAL,
        direction: CaseDirection.INCOMING,
        category: cats.procurement,
        owner: depts.procurement,
        createdBy: users.omar,
        createdDaysAgo: 8,
        dueInDays: 3,
        lastActivityDaysAgo: 0,
        stage: WorkflowStage.STUDIES_COMMITTEE,
        state: WorkflowState.IN_REVIEW,
        status: CaseStatus.OPEN,
        path: [
          { day: 0, action: 'created', by: users.omar },
          { day: 2, action: 'forward', from: WorkflowStage.SECRETARIAT, to: WorkflowStage.STUDIES_COMMITTEE, by: users.nora, instruction: 'Send to studies for completeness review.' },
          { day: 4, action: 'return', from: WorkflowStage.STUDIES_COMMITTEE, by: users.fahad, instruction: 'Return to originator to attach the missing annexes.' },
          { day: 7, action: 'resubmit', from: WorkflowStage.STUDIES_COMMITTEE, to: WorkflowStage.STUDIES_COMMITTEE, by: users.omar, instruction: 'Annexes attached. Resubmitted to Studies for continued review.' },
        ],
      },
      {
        ref: 'DEMO-032',
        title: 'Closed legal opinion on the public procurement circular, delivered on time',
        description: 'رأي قانوني في منشور التعاقدات العامة أُغلق ضمن المدة المحددة',
        type: CaseType.INTERNAL,
        direction: CaseDirection.OUTGOING,
        category: cats.legal,
        owner: depts.legal,
        createdBy: users.sara,
        createdDaysAgo: 14,
        dueInDays: -1,
        lastActivityDaysAgo: 3,
        closedOnTime: true,
        stage: WorkflowStage.CHAIRMAN,
        state: WorkflowState.ARCHIVED,
        status: CaseStatus.CLOSED,
        decision: DecisionType.ARCHIVE,
        concerned: [depts.legal.id, depts.procurement.id],
        path: [
          ...this.fullReview(users, 14, users.sara),
          { day: 9, action: 'decision', by: users.khalid, decision: DecisionType.ARCHIVE, instruction: 'Opinion issued on time and archived.' },
        ],
      },
    ];

    for (const spec of specs) {
      const result = await this.insertCase(spec);
      created[spec.ref] = result.caseEntity;
      docs[spec.ref] = result.original;
    }

    await this.grants.save(
      this.grants.create({
        caseId: created['DEMO-001'].id,
        userId: users.sara.id,
        accessLevel: 'read',
        grantedById: users.layla.id,
      }),
    );
    await this.grants.save(
      this.grants.create({
        caseId: created['DEMO-004'].id,
        userId: users.omar.id,
        accessLevel: 'read',
        grantedById: users.admin.id,
      }),
    );
    await this.grants.save(
      this.grants.create({
        caseId: created['DEMO-016'].id,
        userId: users.nasser.id,
        accessLevel: 'write',
        grantedById: users.admin.id,
      }),
    );

    await this.relations.save(
      this.relations.create({
        caseId: created['DEMO-001'].id,
        type: 'case',
        relatedCaseId: created['DEMO-016'].id,
        note: 'Execution file that followed the Nasr City stationery procurement',
        createdById: users.layla.id,
      }),
    );
    await this.relations.save(
      this.relations.create({
        caseId: created['DEMO-010'].id,
        type: 'document',
        relatedDocumentId: docs['DEMO-016'].id,
        note: 'Signed Dokki annex execution copy related to this award',
        createdById: users.khalid.id,
      }),
    );

    this.logger.log(`Inserted ${specs.length} demo cases with documents, history, and decisions`);
  }

  private async wipeDemoCases(ids: string[]) {
    if (!ids.length) {
      return;
    }
    await this.relations
      .createQueryBuilder()
      .delete()
      .where('caseId IN (:...ids) OR relatedCaseId IN (:...ids)', { ids })
      .execute();
    await this.grants.delete({ caseId: In(ids) });
    await this.documents.update({ caseId: In(ids) }, { parentDocumentId: null });
    const documents = await this.documents.find({ where: { caseId: In(ids) } });
    const documentIds = documents.map((item) => item.id);
    if (documentIds.length) {
      await this.downloads.delete({ documentId: In(documentIds) });
    }
    await this.documents.delete({ caseId: In(ids) });
    await this.activities.delete({ caseId: In(ids) });
    await this.concerned.delete({ caseId: In(ids) });
    await this.decisions.delete({ caseId: In(ids) });
    await this.movements.delete({ caseId: In(ids) });
    await this.cases.delete(ids);
  }

  private fullReview(
    users: Awaited<ReturnType<DemoDatasetSeeder['byEmail']>>,
    createdDaysAgo: number,
    creator: User,
  ): PathStep[] {
    const span = Math.max(8, createdDaysAgo - 4);
    return [
      { day: 0, action: 'created', by: creator },
      {
        day: Math.max(1, Math.floor(span * 0.2)),
        action: 'forward',
        from: WorkflowStage.SECRETARIAT,
        to: WorkflowStage.STUDIES_COMMITTEE,
        by: users.nora,
        instruction: 'Secretariat completed intake. Forwarding to Studies.',
      },
      {
        day: Math.max(2, Math.floor(span * 0.45)),
        action: 'forward',
        from: WorkflowStage.STUDIES_COMMITTEE,
        to: WorkflowStage.TECHNICAL_OFFICE,
        by: users.fahad,
        instruction: 'Studies completed. Technical office to verify.',
      },
      {
        day: Math.max(3, Math.floor(span * 0.7)),
        action: 'forward',
        from: WorkflowStage.TECHNICAL_OFFICE,
        to: WorkflowStage.CHAIRMAN,
        by: users.hind,
        instruction: 'Technical review complete. Submitted for Chairman decision.',
      },
    ];
  }

  private async insertCase(spec: DemoSpec) {
    const createdAt = at(-spec.createdDaysAgo, 9);
    let dueDate = at(spec.dueInDays, 17);
    let lastActivityAt = at(-spec.lastActivityDaysAgo, 15);

    if (spec.closedOnTime === true) {
      dueDate = at(-spec.lastActivityDaysAgo + 2, 17);
      lastActivityAt = at(-spec.lastActivityDaysAgo, 15);
    }
    if (spec.closedOnTime === false) {
      dueDate = at(-spec.lastActivityDaysAgo - 8, 17);
      lastActivityAt = at(-spec.lastActivityDaysAgo, 15);
    }

    const saved = await this.cases.save(
      this.cases.create({
        referenceNumber: spec.ref,
        title: spec.title,
        description: spec.description,
        type: spec.type,
        direction: spec.direction,
        categoryId: spec.category.id,
        categoryNameEn: spec.category.nameEn,
        categoryNameAr: spec.category.nameAr,
        targetTimelineDays: spec.category.targetTimelineDays,
        retentionPeriodYears: spec.category.retentionPeriodYears,
        dueDate,
        retentionUntil: addYears(createdAt, spec.category.retentionPeriodYears),
        status: spec.status,
        currentStage: spec.stage,
        workflowState: spec.state,
        sourceDepartmentId: spec.type === CaseType.INTERNAL ? spec.owner.id : null,
        sourceEntity: spec.sourceEntity ?? null,
        createdById: spec.createdBy.id,
        organizationId: spec.owner.organizationId,
        ownerDepartmentId: spec.owner.id,
        assignedToId: spec.assignedTo?.id ?? null,
        returnedToUserId: spec.returnedToUser?.id ?? null,
        returnedToDepartmentId: spec.returnedToDepartment?.id ?? null,
        returnedFromStage: spec.returnedFrom ?? null,
        lastActivityAt,
      }),
    );
    await this.cases.update(saved.id, { createdAt, lastActivityAt, dueDate, updatedAt: lastActivityAt });

    let lastMovement: CaseMovement | null = null;
    let decision: CaseDecision | null = null;
    for (const step of spec.path) {
      const atDate = at(-spec.createdDaysAgo + step.day, 11);
      const movement = await this.movements.save(
        this.movements.create({
          caseId: saved.id,
          action:
            step.action === 'created'
              ? WorkflowActionType.CREATED
              : step.action === 'forward'
                ? WorkflowActionType.FORWARD
                : step.action === 'return'
                  ? WorkflowActionType.RETURN
                  : step.action === 'decision'
                    ? WorkflowActionType.DECISION
                    : WorkflowActionType.RESUBMIT,
          fromStage: step.action === 'created' ? null : step.from ?? spec.stage,
          toStage:
            step.action === 'created'
              ? WorkflowStage.SECRETARIAT
              : step.action === 'forward' || step.action === 'resubmit'
                ? step.to ?? spec.stage
                : spec.stage,
          instruction: step.instruction ?? null,
          performedById: step.by.id,
          returnTarget: step.action === 'return' ? (spec.returnedToUser ? ReturnTarget.ORIGINATOR : ReturnTarget.DEPARTMENT) : null,
          decisionType: step.decision ?? null,
        }),
      );
      await this.movements.update(movement.id, { createdAt: atDate });
      lastMovement = movement;
      if (step.action === 'decision' && step.decision) {
        decision = await this.decisions.save(
          this.decisions.create({
            caseId: saved.id,
            type: step.decision,
            instruction: step.instruction || 'Chairman decision recorded.',
            performedById: step.by.id,
          }),
        );
        await this.decisions.update(decision.id, { createdAt: atDate });
      }
    }

    for (const departmentId of spec.concerned ?? []) {
      await this.concerned.save(
        this.concerned.create({
          caseId: saved.id,
          departmentId,
          assignedById: spec.createdBy.id,
        }),
      );
    }

    const original = await this.storeDocument({
      caseId: saved.id,
      fileName: `${spec.ref}.pdf`,
      mimeType: 'application/pdf',
      bytes: await this.pdfBytes(spec.ref, spec.title),
      uploadedById: spec.createdBy.id,
      isOriginal: true,
    });
    await this.storeDocument({
      caseId: saved.id,
      fileName: `${spec.ref}-notes.txt`,
      mimeType: 'text/plain',
      bytes: Buffer.from(`${spec.title}\n${spec.description}\n`, 'utf8'),
      uploadedById: spec.createdBy.id,
      isOriginal: true,
    });
    if (lastMovement && spec.path.length > 1) {
      await this.storeDocument({
        caseId: saved.id,
        fileName: `${spec.ref}-routing.pdf`,
        mimeType: 'application/pdf',
        bytes: await this.pdfBytes(`${spec.ref} routing`, 'Routing note'),
        uploadedById: lastMovement.performedById,
        isOriginal: false,
        movementId: lastMovement.id,
      });
    }
    if (decision) {
      await this.storeDocument({
        caseId: saved.id,
        fileName: `${spec.ref}-decision.pdf`,
        mimeType: 'application/pdf',
        bytes: await this.pdfBytes(`${spec.ref} decision`, spec.path[spec.path.length - 1]?.instruction || 'Decision'),
        uploadedById: decision.performedById,
        isOriginal: false,
        decisionId: decision.id,
      });
    }

    if (spec.activities && spec.concerned?.length) {
      let offset = 1;
      for (const departmentId of spec.concerned) {
        const author = spec.createdBy;
        const activity = await this.activities.save(
          this.activities.create({
            caseId: saved.id,
            comment: `تحديث من الإدارة المعنية بشأن ${spec.ref}. العمل جارٍ من مقر القاهرة ويُوثَّق أولاً بأول.`,
            authorId: author.id,
            departmentId,
          }),
        );
        const activityAt = at(-Math.max(0, spec.lastActivityDaysAgo - offset), 16);
        await this.activities.update(activity.id, { createdAt: activityAt });
        await this.storeDocument({
          caseId: saved.id,
          fileName: `${spec.ref}-update-${offset}.txt`,
          mimeType: 'text/plain',
          bytes: Buffer.from(`Execution update ${offset} for ${spec.ref}`, 'utf8'),
          uploadedById: author.id,
          isOriginal: false,
          activityId: activity.id,
        });
        offset += 1;
      }
    }

    if (spec.signed) {
      await this.storeDocument({
        caseId: saved.id,
        fileName: `${spec.ref} (signed).pdf`,
        mimeType: 'application/pdf',
        bytes: await this.pdfBytes(`${spec.ref} signed`, 'Signed copy'),
        uploadedById: spec.createdBy.id,
        isOriginal: false,
        parentDocumentId: original.id,
        signedById: spec.assignedTo?.id ?? spec.createdBy.id,
        signedAt: lastActivityAt,
      });
    }

    await this.recordDownload(original, spec.createdBy, saved.id, 'preview');
    await this.recordDownload(original, spec.createdBy, saved.id, 'download');

    await this.audits.save(
      this.audits.create({
        action: 'case.create',
        entityType: 'case',
        entityId: saved.id,
        userId: spec.createdBy.id,
        metadata: JSON.stringify({ referenceNumber: spec.ref, demo: true }),
      }),
    );

    return { caseEntity: saved, original };
  }

  private async storeDocument(input: {
    caseId: string;
    fileName: string;
    mimeType: string;
    bytes: Buffer;
    uploadedById: string;
    isOriginal: boolean;
    movementId?: string;
    decisionId?: string;
    activityId?: string;
    parentDocumentId?: string;
    signedById?: string;
    signedAt?: Date;
  }) {
    const caseDir = join(process.cwd(), 'uploads', input.caseId);
    mkdirSync(caseDir, { recursive: true });
    const storageKey = `${input.caseId}/${randomUUID()}`;
    writeFileSync(join(process.cwd(), 'uploads', storageKey), input.bytes);
    return this.documents.save(
      this.documents.create({
        caseId: input.caseId,
        originalFileName: input.fileName,
        storageKey,
        mimeType: input.mimeType,
        extractedText: extractDocumentText(
          input.bytes,
          input.mimeType,
          input.fileName,
        ),
        sizeBytes: input.bytes.length,
        version: input.parentDocumentId ? 2 : 1,
        isOriginal: input.isOriginal,
        movementId: input.movementId ?? null,
        decisionId: input.decisionId ?? null,
        activityId: input.activityId ?? null,
        parentDocumentId: input.parentDocumentId ?? null,
        signedById: input.signedById ?? null,
        signedAt: input.signedAt ?? null,
        uploadedById: input.uploadedById,
      }),
    );
  }

  private async recordDownload(
    document: Document,
    user: User,
    caseId: string,
    purpose: 'preview' | 'download',
  ) {
    const id = randomUUID();
    await this.downloads.save(
      this.downloads.create({
        id,
        traceCode: makeTraceCode(id),
        documentId: document.id,
        userId: user.id,
        caseId,
        purpose,
        watermarked: document.mimeType === 'application/pdf',
      }),
    );
  }

  private async pdfBytes(title: string, body: string) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([420, 560]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText(title.slice(0, 70), { x: 36, y: 500, size: 13, font });
    page.drawText(body.slice(0, 90), { x: 36, y: 470, size: 10, font });
    return Buffer.from(await pdf.save());
  }

  private async byEmail() {
    const list = await this.users.find();
    const map = Object.fromEntries(list.map((user) => [user.email, user]));
    const need = [
      'admin@sijil.local',
      'layla@sijil.local',
      'omar@sijil.local',
      'sara@sijil.local',
      'nora@sijil.local',
      'fahad@sijil.local',
      'hind@sijil.local',
      'khalid@sijil.local',
      'maha@sijil.local',
      'nasser@sijil.local',
    ];
    for (const email of need) {
      if (!map[email]) {
        throw new Error(`Demo user missing: ${email}`);
      }
    }
    return {
      admin: map['admin@sijil.local'],
      layla: map['layla@sijil.local'],
      omar: map['omar@sijil.local'],
      sara: map['sara@sijil.local'],
      nora: map['nora@sijil.local'],
      fahad: map['fahad@sijil.local'],
      hind: map['hind@sijil.local'],
      khalid: map['khalid@sijil.local'],
      maha: map['maha@sijil.local'],
      nasser: map['nasser@sijil.local'],
    };
  }

  private async byDepartment(organizationId: string) {
    const list = await this.departments.find({ where: { organizationId } });
    const map = Object.fromEntries(list.map((department) => [department.nameEn, department]));
    return {
      admin: map['General Administration'],
      procurement: map['Procurement'],
      legal: map['Legal Affairs'],
      hr: map['Human Resources'],
      secretariat: map['Secretariat'],
      studies: map['Studies Committee'],
      technical: map['Technical Office'],
      chairman: map['Office of the Chairman'],
    };
  }

  private async byCategory(organizationId: string) {
    const list = await this.categories.find({ where: { organizationId } });
    const map = Object.fromEntries(list.map((category) => [category.nameEn, category]));
    return {
      procurement: map['Procurement'],
      legal: map['Legal Opinion'],
      general: map['General Correspondence'],
      personnel: map['Personnel'],
    };
  }
}

type PathStep = {
  day: number;
  action: 'created' | 'forward' | 'return' | 'resubmit' | 'decision';
  by: User;
  from?: WorkflowStage;
  to?: WorkflowStage;
  instruction?: string;
  decision?: DecisionType;
};

type DemoSpec = {
  ref: string;
  title: string;
  description: string;
  type: CaseType;
  direction: CaseDirection;
  category: CaseCategory;
  owner: Department;
  createdBy: User;
  assignedTo?: User;
  createdDaysAgo: number;
  dueInDays: number;
  lastActivityDaysAgo: number;
  stage: WorkflowStage;
  state: WorkflowState;
  status: CaseStatus;
  sourceEntity?: string;
  returnedToUser?: User;
  returnedToDepartment?: Department;
  returnedFrom?: WorkflowStage;
  path: PathStep[];
  decision?: DecisionType;
  concerned?: string[];
  activities?: boolean;
  signed?: boolean;
  closedOnTime?: boolean;
};
