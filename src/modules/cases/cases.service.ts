import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { Case } from '../../entities/case.entity';
import { CaseGrant } from '../../entities/case-grant.entity';
import { CaseConcernedDepartment } from '../../entities/case-concerned-department.entity';
import { CaseMovement } from '../../entities/case-movement.entity';
import { ReferenceSequence } from '../../entities/reference-sequence.entity';
import { User } from '../../entities/user.entity';
import { CreateCaseDto, QueryCasesDto } from './dto/case.dto';
import { CategoriesService } from '../categories/categories.service';
import { DepartmentsService } from '../departments/departments.service';
import { AuditService } from '../audit/audit.service';
import { addDays, addYears } from '../../common/utils/timeline';
import {
  CaseAccessScope,
  CaseStatus,
  TimelineStatus,
} from '../../common/enums/case.enums';
import {
  Permission,
  grantedPermissions,
  hasPermission,
} from '../../common/enums/permission.enum';
import { serializeCase } from './serialize-case';
import {
  WorkflowActionType,
  WorkflowStage,
  WorkflowState,
} from '../../common/enums/workflow.enums';
import {
  getAvailableActions,
  nextStage,
  previousStage,
} from '../../common/utils/workflow';
import {
  availableDecisionTypes,
  canAddExecutionActivity,
  canCompleteCase,
  canManageConcernedDepartments,
} from '../../common/utils/lifecycle';
import {
  canManageCaseAccess,
  canSignCaseDocuments,
} from '../../common/utils/case-access';

@Injectable()
export class CasesService {
  constructor(
    @InjectRepository(Case)
    private readonly casesRepo: Repository<Case>,
    @InjectRepository(CaseGrant)
    private readonly grantsRepo: Repository<CaseGrant>,
    @InjectRepository(CaseConcernedDepartment)
    private readonly concernedRepo: Repository<CaseConcernedDepartment>,
    @InjectRepository(CaseMovement)
    private readonly movementsRepo: Repository<CaseMovement>,
    private readonly dataSource: DataSource,
    private readonly categoriesService: CategoriesService,
    private readonly departmentsService: DepartmentsService,
    private readonly auditService: AuditService,
  ) {}

  async create(user: User, dto: CreateCaseDto) {
    const category = await this.categoriesService.assertInOrganization(
      dto.categoryId,
      user.organizationId,
      true,
    );

    if (dto.sourceDepartmentId) {
      await this.departmentsService.assertInOrganization(
        dto.sourceDepartmentId,
        user.organizationId,
      );
    }

    const now = new Date();
    const referenceNumber = await this.nextReferenceNumber();

    const created = await this.casesRepo.save(
      this.casesRepo.create({
        referenceNumber,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        type: dto.type,
        direction: dto.direction,
        categoryId: category.id,
        categoryNameEn: category.nameEn,
        categoryNameAr: category.nameAr,
        targetTimelineDays: category.targetTimelineDays,
        retentionPeriodYears: category.retentionPeriodYears,
        dueDate: addDays(now, category.targetTimelineDays),
        retentionUntil: addYears(now, category.retentionPeriodYears),
        status: CaseStatus.OPEN,
        sourceDepartmentId: dto.sourceDepartmentId ?? null,
        sourceEntity: dto.sourceEntity?.trim() || null,
        createdById: user.id,
        organizationId: user.organizationId,
        ownerDepartmentId: user.departmentId,
        currentStage: WorkflowStage.SECRETARIAT,
        workflowState: WorkflowState.IN_REVIEW,
        lastActivityAt: now,
      }),
    );

    await this.movementsRepo.save(
      this.movementsRepo.create({
        caseId: created.id,
        action: WorkflowActionType.CREATED,
        fromStage: null,
        toStage: WorkflowStage.SECRETARIAT,
        instruction: null,
        performedById: user.id,
      }),
    );

    await this.auditService.log('case.create', 'case', created.id, user.id, {
      referenceNumber,
    });

    return this.getAccessible(user, created.id);
  }

  async list(user: User, query: QueryCasesDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 50);

    const qb = this.casesRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.sourceDepartment', 'sourceDepartment')
      .leftJoinAndSelect('c.ownerDepartment', 'ownerDepartment')
      .leftJoinAndSelect('c.createdBy', 'createdBy')
      .leftJoinAndSelect('c.assignedTo', 'assignedTo')
      .leftJoinAndSelect('c.documents', 'documents');

    this.applyAccess(qb, user);
    this.applyScope(qb, user, query.scope);
    this.applyFilters(qb, query);

    const total = await qb.clone().getCount();
    const items = await qb
      .orderBy('c.lastActivityAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    return {
      items: items.map((item) => {
        this.decorateWorkflow(item, user);
        return serializeCase(item);
      }),
      total,
      page,
      pageSize,
    };
  }

  async stats(user: User) {
    const base = () => {
      const qb = this.casesRepo.createQueryBuilder('c');
      this.applyAccess(qb, user);
      return qb;
    };

    const now = new Date().toISOString();
    const [total, active, overdue, recent] = await Promise.all([
      base().getCount(),
      base().andWhere('c.status = :open', { open: CaseStatus.OPEN }).getCount(),
      base()
        .andWhere('c.status = :open', { open: CaseStatus.OPEN })
        .andWhere('c.dueDate < :now', { now })
        .getCount(),
      base()
        .leftJoinAndSelect('c.createdBy', 'createdBy')
        .leftJoinAndSelect('c.ownerDepartment', 'ownerDepartment')
        .orderBy('c.lastActivityAt', 'DESC')
        .take(6)
        .getMany(),
    ]);

    return {
      total,
      active,
      overdue,
      recent: recent.map((item) => serializeCase(item)),
    };
  }

  accessibleQuery(user: User): SelectQueryBuilder<Case> {
    const qb = this.casesRepo.createQueryBuilder('c');
    this.applyAccess(qb, user);
    return qb;
  }

  organizationQuery(user: User): SelectQueryBuilder<Case> {
    return this.casesRepo
      .createQueryBuilder('c')
      .andWhere('c.organizationId = :orgId', { orgId: user.organizationId });
  }

  async getAccessible(user: User, id: string) {
    const found = await this.loadWithRelations(id, user.organizationId);
    if (!found || !(await this.userCanAccess(user, found))) {
      throw new NotFoundException('Case not found');
    }
    this.decorateWorkflow(found, user);
    await this.enrichActivityFlag(found, user);
    return serializeCase(found, true);
  }

  async getInOrganization(user: User, id: string) {
    const found = await this.loadWithRelations(id, user.organizationId);
    if (!found) {
      throw new NotFoundException('Case not found');
    }
    this.decorateWorkflow(found, user);
    await this.enrichActivityFlag(found, user);
    return serializeCase(found, true);
  }

  async assertAccessibleEntity(user: User, id: string): Promise<Case> {
    const found = await this.casesRepo.findOne({ where: { id } });
    if (!found || !(await this.userCanAccess(user, found))) {
      throw new NotFoundException('Case not found');
    }
    return found;
  }

  async touchActivity(caseId: string): Promise<void> {
    await this.casesRepo.update(caseId, { lastActivityAt: new Date() });
  }

  async updateWorkflow(
    caseId: string,
    data: Partial<
      Pick<
        Case,
        | 'currentStage'
        | 'workflowState'
        | 'returnedFromStage'
        | 'returnedToUserId'
        | 'returnedToDepartmentId'
        | 'status'
      >
    >,
  ): Promise<void> {
    await this.casesRepo.update(caseId, {
      ...data,
      lastActivityAt: new Date(),
    });
  }

  async listGrants(user: User, caseId: string) {
    const caseEntity = await this.assertAccessibleEntity(user, caseId);
    this.assertCanManageAccess(user, caseEntity);
    const grants = await this.grantsRepo.find({
      where: { caseId },
      relations: ['user', 'grantedBy'],
      order: { createdAt: 'DESC' },
    });
    return grants.map((grant) => this.serializeGrant(grant));
  }

  async grantAccess(user: User, caseId: string, targetUserId: string) {
    const caseEntity = await this.assertAccessibleEntity(user, caseId);
    this.assertCanManageAccess(user, caseEntity);
    const target = await this.dataSource.getRepository(User).findOne({
      where: { id: targetUserId },
    });
    if (!target || target.organizationId !== user.organizationId || !target.isActive) {
      throw new NotFoundException('User not found');
    }
    if (targetUserId === user.id) {
      throw new ForbiddenException('You already have access to this case');
    }
    const existing = await this.grantsRepo.findOne({
      where: { caseId, userId: targetUserId },
    });
    if (existing) {
      throw new BadRequestException('This user already has explicit access');
    }
    const saved = await this.grantsRepo.save(
      this.grantsRepo.create({
        caseId,
        userId: targetUserId,
        accessLevel: 'read',
        grantedById: user.id,
      }),
    );
    await this.auditService.log('case.grant', 'case', caseId, user.id, {
      targetUserId,
    });
    const loaded = await this.grantsRepo.findOne({
      where: { id: saved.id },
      relations: ['user', 'grantedBy'],
    });
    return this.serializeGrant(loaded);
  }

  async revokeAccess(user: User, caseId: string, grantId: string) {
    const caseEntity = await this.assertAccessibleEntity(user, caseId);
    this.assertCanManageAccess(user, caseEntity);
    const grant = await this.grantsRepo.findOne({ where: { id: grantId, caseId } });
    if (!grant) {
      throw new NotFoundException('Access grant not found');
    }
    await this.grantsRepo.remove(grant);
    await this.auditService.log('case.grant.revoke', 'case', caseId, user.id, {
      targetUserId: grant.userId,
    });
    return { removed: true };
  }

  private assertCanManageAccess(user: User, _caseEntity: Case) {
    if (!canManageCaseAccess(user.role, user.permissions)) {
      throw new ForbiddenException('You are not allowed to manage case access');
    }
  }

  private serializeGrant(grant: CaseGrant | null) {
    if (!grant) {
      return null;
    }
    return {
      id: grant.id,
      caseId: grant.caseId,
      accessLevel: grant.accessLevel,
      createdAt: grant.createdAt,
      user: grant.user
        ? {
            id: grant.user.id,
            nameEn: grant.user.nameEn,
            nameAr: grant.user.nameAr,
            email: grant.user.email,
          }
        : null,
      grantedBy: grant.grantedBy
        ? {
            id: grant.grantedBy.id,
            nameEn: grant.grantedBy.nameEn,
            nameAr: grant.grantedBy.nameAr,
          }
        : null,
    };
  }

  private async nextReferenceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    return this.dataSource.transaction(async (manager) => {
      let sequence = await manager.findOne(ReferenceSequence, {
        where: { year },
      });
      if (!sequence) {
        sequence = manager.create(ReferenceSequence, { year, lastValue: 0 });
      }
      sequence.lastValue += 1;
      await manager.save(sequence);
      return `CASE-${year}-${String(sequence.lastValue).padStart(5, '0')}`;
    });
  }

  private applyAccess(qb: SelectQueryBuilder<Case>, user: User) {
    qb.andWhere('c.organizationId = :orgId', { orgId: user.organizationId });

    if (hasPermission(grantedPermissions(user), Permission.CASES_READ_ALL)) {
      return;
    }

    const clauses = ['c.createdById = :accessUserId', 'c.assignedToId = :accessUserId'];
    const params: Record<string, string> = { accessUserId: user.id };

    if (
      hasPermission(grantedPermissions(user), Permission.CASES_READ_DEPARTMENT) &&
      user.departmentId
    ) {
      clauses.push('c.ownerDepartmentId = :accessDeptId');
      params.accessDeptId = user.departmentId;
    }

    if (user.workflowStages?.length) {
      const placeholders = user.workflowStages.map(
        (_, index) => `:accessStage${index}`,
      );
      clauses.push(`c.currentStage IN (${placeholders.join(', ')})`);
      user.workflowStages.forEach((stage, index) => {
        params[`accessStage${index}`] = stage;
      });
    }

    clauses.push('c.returnedToUserId = :accessUserId');
    if (user.departmentId) {
      clauses.push('c.returnedToDepartmentId = :accessReturnDeptId');
      params.accessReturnDeptId = user.departmentId;
      clauses.push(
        `EXISTS (SELECT 1 FROM case_concerned_departments cd WHERE cd.caseId = c.id AND cd.departmentId = :accessReturnDeptId)`,
      );
    }

    clauses.push(
      `EXISTS (SELECT 1 FROM case_grants g WHERE g.caseId = c.id AND g.userId = :accessUserId)`,
    );

    qb.andWhere(`(${clauses.join(' OR ')})`, params);
  }

  private applyScope(
    qb: SelectQueryBuilder<Case>,
    user: User,
    scope?: CaseAccessScope,
  ) {
    if (!scope) {
      return;
    }

    if (scope === CaseAccessScope.MINE) {
      qb.andWhere(
        '(c.createdById = :scopeUserId OR c.assignedToId = :scopeUserId OR c.returnedToUserId = :scopeUserId)',
        { scopeUserId: user.id },
      );
      return;
    }

    if (scope === CaseAccessScope.ASSIGNED) {
      if (user.departmentId) {
        qb.andWhere(
          `(c.assignedToId = :scopeUserId OR EXISTS (SELECT 1 FROM case_concerned_departments cd WHERE cd.caseId = c.id AND cd.departmentId = :scopeAssignedDeptId))`,
          { scopeUserId: user.id, scopeAssignedDeptId: user.departmentId },
        );
      } else {
        qb.andWhere('c.assignedToId = :scopeUserId', { scopeUserId: user.id });
      }
      return;
    }

    if (scope === CaseAccessScope.DEPARTMENT) {
      if (!user.departmentId) {
        throw new ForbiddenException('Not allowed to view department cases');
      }
      qb.andWhere(
        `(c.ownerDepartmentId = :scopeDeptId OR EXISTS (SELECT 1 FROM case_concerned_departments cd WHERE cd.caseId = c.id AND cd.departmentId = :scopeDeptId))`,
        { scopeDeptId: user.departmentId },
      );
      return;
    }

    if (scope === CaseAccessScope.GRANTED) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM case_grants g WHERE g.caseId = c.id AND g.userId = :scopeGrantUserId)`,
        { scopeGrantUserId: user.id },
      );
      return;
    }

    if (scope === CaseAccessScope.ALL) {
      if (!hasPermission(grantedPermissions(user), Permission.CASES_READ_ALL)) {
        throw new ForbiddenException('Not allowed to view all cases');
      }
    }
  }

  private applyFilters(qb: SelectQueryBuilder<Case>, query: QueryCasesDto) {
    if (query.search?.trim()) {
      const tokens = query.search
        .trim()
        .toLowerCase()
        .split(/[\s,;|/]+/)
        .map((token) => token.replace(/[%_]/g, ''))
        .filter((token) => token.length > 0)
        .slice(0, 8);
      tokens.forEach((token, index) => {
        const key = `searchTerm${index}`;
        qb.andWhere(
          `(LOWER(c.referenceNumber) LIKE :${key} OR LOWER(c.title) LIKE :${key} OR LOWER(COALESCE(c.description, '')) LIKE :${key})`,
          { [key]: `%${token}%` },
        );
      });
    }

    if (query.categoryId) {
      qb.andWhere('c.categoryId = :categoryId', { categoryId: query.categoryId });
    }
    if (query.type) {
      qb.andWhere('c.type = :type', { type: query.type });
    }
    if (query.direction) {
      qb.andWhere('c.direction = :direction', { direction: query.direction });
    }
    if (query.status) {
      qb.andWhere('c.status = :status', { status: query.status });
    }
    if (query.currentStage) {
      qb.andWhere('c.currentStage = :currentStage', {
        currentStage: query.currentStage,
      });
    }
    if (query.workflowState) {
      qb.andWhere('c.workflowState = :workflowState', {
        workflowState: query.workflowState,
      });
    }
    if (query.dateFrom) {
      qb.andWhere('c.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere('c.createdAt <= :dateTo', { dateTo: `${query.dateTo}T23:59:59` });
    }

    if (query.timelineStatus === TimelineStatus.OVERDUE) {
      qb.andWhere(`julianday(c.dueDate) < julianday('now')`);
    } else if (query.timelineStatus === TimelineStatus.DUE_SOON) {
      qb.andWhere(`julianday(c.dueDate) >= julianday('now')`);
      qb.andWhere(
        `(julianday(c.dueDate) - julianday('now')) <= CASE WHEN c.targetTimelineDays * 0.25 > 1 THEN c.targetTimelineDays * 0.25 ELSE 1 END`,
      );
    } else if (query.timelineStatus === TimelineStatus.ON_TRACK) {
      qb.andWhere(
        `(julianday(c.dueDate) - julianday('now')) > CASE WHEN c.targetTimelineDays * 0.25 > 1 THEN c.targetTimelineDays * 0.25 ELSE 1 END`,
      );
    }

    if (query.involvedDepartmentId) {
      qb.andWhere(
        `(c.ownerDepartmentId = :involvedDepartmentId OR EXISTS (
          SELECT 1 FROM case_concerned_departments cd
          WHERE cd.caseId = c.id AND cd.departmentId = :involvedDepartmentId
        ))`,
        { involvedDepartmentId: query.involvedDepartmentId },
      );
    }

    if (query.inactiveDays) {
      qb.andWhere('c.status = :inactiveOpen', { inactiveOpen: CaseStatus.OPEN });
      qb.andWhere(
        `julianday('now') - julianday(c.lastActivityAt) >= :inactiveDays`,
        { inactiveDays: query.inactiveDays },
      );
    }
  }

  private async loadWithRelations(id: string, organizationId: string) {
    const rows = await this.casesRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.sourceDepartment', 'sourceDepartment')
      .leftJoinAndSelect('c.ownerDepartment', 'ownerDepartment')
      .leftJoinAndSelect('c.createdBy', 'createdBy')
      .leftJoinAndSelect('c.assignedTo', 'assignedTo')
      .leftJoinAndSelect('c.returnedToUser', 'returnedToUser')
      .leftJoinAndSelect('c.returnedToDepartment', 'returnedToDepartment')
      .leftJoinAndSelect('c.documents', 'documents')
      .leftJoinAndSelect('documents.uploadedBy', 'uploadedBy')
      .leftJoinAndSelect('documents.signedBy', 'signedBy')
      .where('c.id = :id', { id })
      .andWhere('c.organizationId = :orgId', { orgId: organizationId })
      .getMany();
    return rows[0] ?? null;
  }

  private async userCanAccess(user: User, caseEntity: Case): Promise<boolean> {
    if (caseEntity.organizationId !== user.organizationId) {
      return false;
    }
    if (hasPermission(grantedPermissions(user), Permission.CASES_READ_ALL)) {
      return true;
    }
    if (caseEntity.createdById === user.id || caseEntity.assignedToId === user.id) {
      return true;
    }
    if (
      hasPermission(grantedPermissions(user), Permission.CASES_READ_DEPARTMENT) &&
      user.departmentId &&
      caseEntity.ownerDepartmentId === user.departmentId
    ) {
      return true;
    }
    if (user.workflowStages?.includes(caseEntity.currentStage)) {
      return true;
    }
    if (caseEntity.returnedToUserId === user.id) {
      return true;
    }
    if (
      user.departmentId &&
      caseEntity.returnedToDepartmentId === user.departmentId
    ) {
      return true;
    }
    if (user.departmentId) {
      const concerned = await this.concernedRepo.count({
        where: { caseId: caseEntity.id, departmentId: user.departmentId },
      });
      if (concerned > 0) {
        return true;
      }
    }
    const grants = await this.grantsRepo.count({
      where: { caseId: caseEntity.id, userId: user.id },
    });
    return grants > 0;
  }

  private decorateWorkflow(caseEntity: Case, user: User) {
    const access = {
      role: user.role,
      assignedStages: user.workflowStages,
      permissions: grantedPermissions(user),
      status: caseEntity.status,
      currentStage: caseEntity.currentStage,
      workflowState: caseEntity.workflowState,
    };
    caseEntity.availableActions = getAvailableActions({
      ...access,
      userId: user.id,
      departmentId: user.departmentId,
      createdById: caseEntity.createdById,
      returnedToUserId: caseEntity.returnedToUserId,
      returnedToDepartmentId: caseEntity.returnedToDepartmentId,
    });
    caseEntity.availableDecisionTypes = availableDecisionTypes(access);
    caseEntity.canManageDepartments = canManageConcernedDepartments(access);
    caseEntity.canManageAccess = canManageCaseAccess(user.role, user.permissions);
    caseEntity.canSignDocuments = canSignCaseDocuments({
      role: user.role,
      assignedStages: user.workflowStages,
      permissions: grantedPermissions(user),
    });
    caseEntity.nextStage = nextStage(caseEntity.currentStage);
    caseEntity.previousStage = previousStage(caseEntity.currentStage);
  }

  private async enrichActivityFlag(caseEntity: Case, user: User) {
    const assignments = await this.concernedRepo.find({
      where: { caseId: caseEntity.id },
    });
    const concernedDepartmentIds = assignments.map((item) => item.departmentId);
    caseEntity.canAddActivity = canAddExecutionActivity({
      role: user.role,
      departmentId: user.departmentId,
      status: caseEntity.status,
      workflowState: caseEntity.workflowState,
      concernedDepartmentIds,
    });
    caseEntity.canComplete = canCompleteCase({
      role: user.role,
      departmentId: user.departmentId,
      permissions: grantedPermissions(user),
      status: caseEntity.status,
      workflowState: caseEntity.workflowState,
      concernedDepartmentIds,
    });
  }
}
