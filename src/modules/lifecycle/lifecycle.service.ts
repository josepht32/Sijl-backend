import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Case } from '../../entities/case.entity';
import { CaseDecision } from '../../entities/case-decision.entity';
import { CaseConcernedDepartment } from '../../entities/case-concerned-department.entity';
import { CaseMovement } from '../../entities/case-movement.entity';
import { ExecutionActivity } from '../../entities/execution-activity.entity';
import { User } from '../../entities/user.entity';
import { CasesService } from '../cases/cases.service';
import { DocumentsService } from '../documents/documents.service';
import { DepartmentsService } from '../departments/departments.service';
import { AuditService } from '../audit/audit.service';
import { serializeDocument } from '../cases/serialize-case';
import {
  AssignDepartmentDto,
  CreateActivityDto,
  CreateDecisionDto,
} from './dto/lifecycle.dto';
import {
  DECISION_DEFINITIONS,
  DecisionType,
} from '../../common/enums/decision.enums';
import {
  WorkflowActionType,
  WorkflowStage,
} from '../../common/enums/workflow.enums';
import {
  canAddExecutionActivity,
  canDecide,
  canManageConcernedDepartments,
} from '../../common/utils/lifecycle';

@Injectable()
export class LifecycleService {
  constructor(
    @InjectRepository(CaseDecision)
    private readonly decisionsRepo: Repository<CaseDecision>,
    @InjectRepository(CaseConcernedDepartment)
    private readonly concernedRepo: Repository<CaseConcernedDepartment>,
    @InjectRepository(ExecutionActivity)
    private readonly activitiesRepo: Repository<ExecutionActivity>,
    @InjectRepository(CaseMovement)
    private readonly movementsRepo: Repository<CaseMovement>,
    private readonly casesService: CasesService,
    private readonly documentsService: DocumentsService,
    private readonly departmentsService: DepartmentsService,
    private readonly auditService: AuditService,
  ) {}

  async listDecisions(user: User, caseId: string) {
    await this.casesService.assertAccessibleEntity(user, caseId);
    const decisions = await this.decisionsRepo.find({
      where: { caseId },
      relations: ['performedBy', 'documents', 'documents.uploadedBy'],
      order: { createdAt: 'DESC' },
    });
    return decisions.map((decision) => this.serializeDecision(decision));
  }

  async decide(
    user: User,
    caseId: string,
    dto: CreateDecisionDto,
    files?: Express.Multer.File[],
  ) {
    const caseEntity = await this.casesService.assertAccessibleEntity(user, caseId);
    if (
      !canDecide({
        role: user.role,
        assignedStages: user.workflowStages,
        permissions: user.permissions,
        status: caseEntity.status,
        currentStage: caseEntity.currentStage,
        workflowState: caseEntity.workflowState,
      })
    ) {
      throw new ForbiddenException('You are not allowed to record a Chairman decision');
    }

    const definition = DECISION_DEFINITIONS[dto.type];
    if (!definition) {
      throw new BadRequestException('Unsupported decision type');
    }

    const departmentIds = [...new Set(dto.departmentIds ?? [])];
    if (definition.requiresDepartments && departmentIds.length === 0) {
      throw new BadRequestException(
        'Select at least one concerned department for this decision',
      );
    }

    for (const departmentId of departmentIds) {
      await this.departmentsService.assertInOrganization(
        departmentId,
        user.organizationId,
      );
    }

    const decision = await this.decisionsRepo.save(
      this.decisionsRepo.create({
        caseId,
        type: dto.type,
        instruction: dto.instruction.trim(),
        performedById: user.id,
      }),
    );

    await this.movementsRepo.save(
      this.movementsRepo.create({
        caseId,
        action: WorkflowActionType.DECISION,
        fromStage: WorkflowStage.CHAIRMAN,
        toStage: WorkflowStage.CHAIRMAN,
        instruction: dto.instruction.trim(),
        performedById: user.id,
        decisionType: dto.type,
      }),
    );

    if (files?.length) {
      await this.documentsService.attachFiles(user, caseId, files, {
        decisionId: decision.id,
        isOriginal: false,
      });
    }

    await this.addDepartments(caseId, departmentIds, user.id);

    await this.casesService.updateWorkflow(caseId, {
      workflowState: definition.resultingState,
      status: definition.resultingStatus,
    });

    await this.auditService.log('decision.record', 'case', caseId, user.id, {
      type: dto.type,
    });

    return this.casesService.getInOrganization(user, caseId);
  }

  async listDepartments(user: User, caseId: string) {
    await this.casesService.assertAccessibleEntity(user, caseId);
    return this.serializeAssignments(caseId);
  }

  async assignDepartment(user: User, caseId: string, dto: AssignDepartmentDto) {
    const caseEntity = await this.casesService.assertAccessibleEntity(user, caseId);
    this.assertCanManageDepartments(user, caseEntity);
    await this.departmentsService.assertInOrganization(
      dto.departmentId,
      user.organizationId,
    );

    const existing = await this.concernedRepo.findOne({
      where: { caseId, departmentId: dto.departmentId },
    });
    if (existing) {
      throw new BadRequestException('This department is already associated');
    }

    await this.concernedRepo.save(
      this.concernedRepo.create({
        caseId,
        departmentId: dto.departmentId,
        assignedById: user.id,
      }),
    );
    await this.casesService.touchActivity(caseId);
    await this.auditService.log('case.department.assign', 'case', caseId, user.id, {
      departmentId: dto.departmentId,
    });
    return this.serializeAssignments(caseId);
  }

  async removeDepartment(user: User, caseId: string, departmentId: string) {
    const caseEntity = await this.casesService.assertAccessibleEntity(user, caseId);
    this.assertCanManageDepartments(user, caseEntity);
    const assignment = await this.concernedRepo.findOne({
      where: { caseId, departmentId },
    });
    if (!assignment) {
      throw new NotFoundException('Department assignment not found');
    }
    await this.concernedRepo.remove(assignment);
    await this.casesService.touchActivity(caseId);
    await this.auditService.log('case.department.remove', 'case', caseId, user.id, {
      departmentId,
    });
    return this.serializeAssignments(caseId);
  }

  async listActivities(user: User, caseId: string) {
    await this.casesService.assertAccessibleEntity(user, caseId);
    const activities = await this.activitiesRepo.find({
      where: { caseId },
      relations: ['author', 'department', 'documents', 'documents.uploadedBy'],
      order: { createdAt: 'DESC' },
    });
    return activities.map((activity) => this.serializeActivity(activity));
  }

  async addActivity(
    user: User,
    caseId: string,
    dto: CreateActivityDto,
    files?: Express.Multer.File[],
  ) {
    const caseEntity = await this.casesService.assertAccessibleEntity(user, caseId);
    const assignments = await this.concernedRepo.find({ where: { caseId } });
    if (
      !canAddExecutionActivity({
        role: user.role,
        departmentId: user.departmentId,
        status: caseEntity.status,
        workflowState: caseEntity.workflowState,
        concernedDepartmentIds: assignments.map((item) => item.departmentId),
      })
    ) {
      throw new ForbiddenException('You are not allowed to add an execution update');
    }

    const activity = await this.activitiesRepo.save(
      this.activitiesRepo.create({
        caseId,
        comment: dto.comment.trim(),
        authorId: user.id,
        departmentId: user.departmentId,
      }),
    );

    if (files?.length) {
      await this.documentsService.attachFiles(user, caseId, files, {
        activityId: activity.id,
        isOriginal: false,
      });
    }

    await this.casesService.touchActivity(caseId);
    await this.auditService.log('execution.activity', 'case', caseId, user.id, {
      activityId: activity.id,
    });

    const loaded = await this.activitiesRepo.findOne({
      where: { id: activity.id },
      relations: ['author', 'department', 'documents', 'documents.uploadedBy'],
    });
    return this.serializeActivity(loaded);
  }

  private assertCanManageDepartments(user: User, caseEntity: Case) {
    if (
      !canManageConcernedDepartments({
        role: user.role,
        assignedStages: user.workflowStages,
        permissions: user.permissions,
        status: caseEntity.status,
        workflowState: caseEntity.workflowState,
      })
    ) {
      throw new ForbiddenException(
        'You are not allowed to manage concerned departments',
      );
    }
  }

  private async addDepartments(
    caseId: string,
    departmentIds: string[],
    assignedById: string,
  ) {
    for (const departmentId of departmentIds) {
      const existing = await this.concernedRepo.findOne({
        where: { caseId, departmentId },
      });
      if (!existing) {
        await this.concernedRepo.save(
          this.concernedRepo.create({
            caseId,
            departmentId,
            assignedById,
          }),
        );
      }
    }
  }

  private async serializeAssignments(caseId: string) {
    const items = await this.concernedRepo.find({
      where: { caseId },
      relations: ['department', 'assignedBy'],
      order: { createdAt: 'ASC' },
    });
    return items.map((item) => ({
      id: item.id,
      departmentId: item.departmentId,
      department: item.department
        ? {
            id: item.department.id,
            nameEn: item.department.nameEn,
            nameAr: item.department.nameAr,
          }
        : null,
      assignedBy: item.assignedBy
        ? {
            id: item.assignedBy.id,
            nameEn: item.assignedBy.nameEn,
            nameAr: item.assignedBy.nameAr,
          }
        : null,
      createdAt: item.createdAt,
    }));
  }

  private serializeDecision(decision: CaseDecision) {
    return {
      id: decision.id,
      caseId: decision.caseId,
      type: decision.type,
      instruction: decision.instruction,
      performedBy: decision.performedBy
        ? {
            id: decision.performedBy.id,
            nameEn: decision.performedBy.nameEn,
            nameAr: decision.performedBy.nameAr,
          }
        : null,
      documents: (decision.documents || []).map((document) => serializeDocument(document)),
      createdAt: decision.createdAt,
    };
  }

  private serializeActivity(activity: ExecutionActivity | null) {
    if (!activity) {
      return null;
    }
    return {
      id: activity.id,
      caseId: activity.caseId,
      comment: activity.comment,
      author: activity.author
        ? {
            id: activity.author.id,
            nameEn: activity.author.nameEn,
            nameAr: activity.author.nameAr,
          }
        : null,
      department: activity.department
        ? {
            id: activity.department.id,
            nameEn: activity.department.nameEn,
            nameAr: activity.department.nameAr,
          }
        : null,
      documents: (activity.documents || []).map((document) => serializeDocument(document)),
      createdAt: activity.createdAt,
    };
  }
}
