import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Case } from '../../entities/case.entity';
import { CaseMovement } from '../../entities/case-movement.entity';
import { CaseRelation } from '../../entities/case-relation.entity';
import { Document } from '../../entities/document.entity';
import { User } from '../../entities/user.entity';
import { CasesService } from '../cases/cases.service';
import { DocumentsService } from '../documents/documents.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateRelationDto,
  ForwardCaseDto,
  ResubmitCaseDto,
  ReturnCaseDto,
} from './dto/workflow.dto';
import {
  ReturnTarget,
  WorkflowActionType,
  WorkflowStage,
  WorkflowState,
} from '../../common/enums/workflow.enums';
import {
  getAvailableActions,
  nextStage,
  previousStage,
} from '../../common/utils/workflow';
import { serializeDocument } from '../cases/serialize-case';
import { isAdminRole } from '../../common/enums/role.enum';
import { scoreRelatedCases } from '../../common/utils/case-similarity';

@Injectable()
export class WorkflowService {
  constructor(
    @InjectRepository(CaseMovement)
    private readonly movementsRepo: Repository<CaseMovement>,
    @InjectRepository(CaseRelation)
    private readonly relationsRepo: Repository<CaseRelation>,
    @InjectRepository(Document)
    private readonly documentsRepo: Repository<Document>,
    private readonly casesService: CasesService,
    private readonly documentsService: DocumentsService,
    private readonly auditService: AuditService,
  ) {}

  async recordCreated(caseEntity: Case, user: User): Promise<void> {
    await this.movementsRepo.save(
      this.movementsRepo.create({
        caseId: caseEntity.id,
        action: WorkflowActionType.CREATED,
        fromStage: null,
        toStage: WorkflowStage.SECRETARIAT,
        instruction: null,
        performedById: user.id,
      }),
    );
  }

  async history(user: User, caseId: string) {
    await this.casesService.assertAccessibleEntity(user, caseId);
    const movements = await this.movementsRepo.find({
      where: { caseId },
      relations: ['performedBy', 'toUser', 'toDepartment', 'documents', 'documents.uploadedBy'],
      order: { createdAt: 'ASC' },
    });
    return movements.map((movement) => this.serializeMovement(movement));
  }

  async forward(
    user: User,
    caseId: string,
    dto: ForwardCaseDto,
    files?: Express.Multer.File[],
  ) {
    const caseEntity = await this.casesService.assertAccessibleEntity(user, caseId);
    this.assertAction(user, caseEntity, 'forward');

    const destination = nextStage(caseEntity.currentStage);
    if (!destination) {
      throw new BadRequestException('This case cannot be forwarded further');
    }

    const fromStage = caseEntity.currentStage;
    const workflowState =
      destination === WorkflowStage.CHAIRMAN
        ? WorkflowState.AWAITING_CHAIRMAN
        : WorkflowState.IN_REVIEW;

    const movement = await this.saveMovement({
      caseId,
      action: WorkflowActionType.FORWARD,
      fromStage,
      toStage: destination,
      instruction: dto.instruction?.trim() || null,
      performedById: user.id,
    });

    await this.attachMovementFiles(user, caseId, movement.id, files);

    await this.casesService.updateWorkflow(caseId, {
      currentStage: destination,
      workflowState,
      returnedFromStage: null,
      returnedToUserId: null,
      returnedToDepartmentId: null,
    });

    await this.auditService.log('workflow.forward', 'case', caseId, user.id, {
      fromStage,
      toStage: destination,
    });

    return this.casesService.getInOrganization(user, caseId);
  }

  async returnForCompletion(
    user: User,
    caseId: string,
    dto: ReturnCaseDto,
    files?: Express.Multer.File[],
  ) {
    const caseEntity = await this.casesService.assertAccessibleEntity(user, caseId);
    this.assertAction(user, caseEntity, 'return');

    let returnedToUserId: string | null = null;
    let returnedToDepartmentId: string | null = null;
    const fromStage = caseEntity.currentStage;
    let toStage = fromStage;
    let workflowState = WorkflowState.AWAITING_INFO;

    if (dto.returnTo === ReturnTarget.ORIGINATOR) {
      returnedToUserId = caseEntity.createdById;
    } else if (dto.returnTo === ReturnTarget.DEPARTMENT) {
      if (!caseEntity.ownerDepartmentId) {
        throw new BadRequestException(
          'This case has no originating department to return to',
        );
      }
      returnedToDepartmentId = caseEntity.ownerDepartmentId;
    } else if (dto.returnTo === ReturnTarget.PREVIOUS_STAGE) {
      const destination = previousStage(fromStage);
      if (!destination) {
        throw new BadRequestException('This case has no previous office to return to');
      }
      toStage = destination;
      workflowState = WorkflowState.IN_REVIEW;
    } else {
      throw new BadRequestException('Unsupported return destination');
    }

    const movement = await this.saveMovement({
      caseId,
      action: WorkflowActionType.RETURN,
      fromStage,
      toStage,
      instruction: dto.instruction.trim(),
      performedById: user.id,
      toUserId: returnedToUserId,
      toDepartmentId: returnedToDepartmentId,
      returnTarget: dto.returnTo,
    });

    await this.attachMovementFiles(user, caseId, movement.id, files);

    await this.casesService.updateWorkflow(caseId, {
      currentStage: toStage,
      workflowState,
      returnedFromStage: dto.returnTo === ReturnTarget.PREVIOUS_STAGE ? null : fromStage,
      returnedToUserId,
      returnedToDepartmentId,
    });

    await this.auditService.log('workflow.return', 'case', caseId, user.id, {
      returnTo: dto.returnTo,
    });

    return this.casesService.getInOrganization(user, caseId);
  }

  async resubmit(
    user: User,
    caseId: string,
    dto: ResubmitCaseDto,
    files?: Express.Multer.File[],
  ) {
    const caseEntity = await this.casesService.assertAccessibleEntity(user, caseId);
    this.assertAction(user, caseEntity, 'resubmit');

    const resumeStage = caseEntity.returnedFromStage || caseEntity.currentStage;

    const movement = await this.saveMovement({
      caseId,
      action: WorkflowActionType.RESUBMIT,
      fromStage: resumeStage,
      toStage: resumeStage,
      instruction: dto.instruction.trim(),
      performedById: user.id,
    });

    await this.attachMovementFiles(user, caseId, movement.id, files);

    await this.casesService.updateWorkflow(caseId, {
      currentStage: resumeStage,
      workflowState: WorkflowState.IN_REVIEW,
      returnedFromStage: null,
      returnedToUserId: null,
      returnedToDepartmentId: null,
    });

    await this.auditService.log('workflow.resubmit', 'case', caseId, user.id, {
      resumeStage,
    });

    return this.casesService.getInOrganization(user, caseId);
  }

  async listRelations(user: User, caseId: string) {
    await this.casesService.assertAccessibleEntity(user, caseId);
    const relations = await this.relationsRepo.find({
      where: { caseId },
      relations: [
        'relatedCase',
        'relatedDocument',
        'relatedDocument.uploadedBy',
        'createdBy',
      ],
      order: { createdAt: 'DESC' },
    });
    return relations.map((relation) => this.serializeRelation(relation));
  }

  async addRelation(user: User, caseId: string, dto: CreateRelationDto) {
    await this.casesService.assertAccessibleEntity(user, caseId);

    if (dto.type === 'case') {
      if (!dto.relatedCaseId) {
        throw new BadRequestException('relatedCaseId is required');
      }
      if (dto.relatedCaseId === caseId) {
        throw new BadRequestException('A case cannot be related to itself');
      }
      await this.casesService.assertAccessibleEntity(user, dto.relatedCaseId);
      const existing = await this.relationsRepo.findOne({
        where: { caseId, relatedCaseId: dto.relatedCaseId },
      });
      if (existing) {
        throw new BadRequestException('This case is already linked');
      }
    } else {
      if (!dto.relatedDocumentId) {
        throw new BadRequestException('relatedDocumentId is required');
      }
      const document = await this.documentsRepo.findOne({
        where: { id: dto.relatedDocumentId },
      });
      if (!document) {
        throw new NotFoundException('Document not found');
      }
      await this.casesService.assertAccessibleEntity(user, document.caseId);
      const existing = await this.relationsRepo.findOne({
        where: { caseId, relatedDocumentId: dto.relatedDocumentId },
      });
      if (existing) {
        throw new BadRequestException('This document is already linked');
      }
    }

    const saved = await this.relationsRepo.save(
      this.relationsRepo.create({
        caseId,
        type: dto.type,
        relatedCaseId: dto.type === 'case' ? dto.relatedCaseId : null,
        relatedDocumentId: dto.type === 'document' ? dto.relatedDocumentId : null,
        note: dto.note?.trim() || null,
        createdById: user.id,
      }),
    );

    await this.auditService.log('case.relation.add', 'case', caseId, user.id, {
      type: dto.type,
    });

    const loaded = await this.relationsRepo.findOne({
      where: { id: saved.id },
      relations: [
        'relatedCase',
        'relatedDocument',
        'relatedDocument.uploadedBy',
        'createdBy',
      ],
    });
    return this.serializeRelation(loaded);
  }

  async suggestRelated(user: User, caseId: string) {
    const source = await this.casesService.assertAccessibleEntity(user, caseId);
    const sourceDocs = await this.documentsRepo.find({ where: { caseId } });
    const linked = await this.relationsRepo.find({
      where: { caseId, type: 'case' },
    });
    const linkedIds = new Set(
      linked
        .map((relation) => relation.relatedCaseId)
        .filter((id): id is string => Boolean(id)),
    );

    const candidates = await this.casesService
      .accessibleQuery(user)
      .andWhere('c.id != :caseId', { caseId })
      .orderBy('c.lastActivityAt', 'DESC')
      .take(300)
      .getMany();

    const candidateDocs = candidates.length
      ? await this.documentsRepo.find({
          where: { caseId: In(candidates.map((item) => item.id)) },
        })
      : [];
    const docsByCase = new Map<string, string>();
    for (const document of candidateDocs) {
      const current = docsByCase.get(document.caseId) ?? '';
      docsByCase.set(
        document.caseId,
        [current, document.extractedText, document.originalFileName]
          .filter(Boolean)
          .join('\n'),
      );
    }

    const ranked = scoreRelatedCases(
      {
        id: source.id,
        title: source.title,
        description: source.description,
        documentText: sourceDocs
          .map((document) => document.extractedText || document.originalFileName)
          .join('\n'),
        referenceNumber: source.referenceNumber,
      },
      candidates
        .filter((item) => !linkedIds.has(item.id))
        .map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          documentText: docsByCase.get(item.id) ?? '',
          referenceNumber: item.referenceNumber,
        })),
    );

    return ranked.map((item) => ({
      id: item.case.id,
      referenceNumber: item.case.referenceNumber,
      title: item.case.title,
      description: item.case.description,
      score: Math.round(item.score * 100),
      matchedOn: item.matchedOn,
    }));
  }

  async removeRelation(user: User, caseId: string, relationId: string) {
    await this.casesService.assertAccessibleEntity(user, caseId);
    const relation = await this.relationsRepo.findOne({
      where: { id: relationId, caseId },
    });
    if (!relation) {
      throw new NotFoundException('Related item not found');
    }
    if (relation.createdById !== user.id && !isAdminRole(user.role)) {
      throw new ForbiddenException('You can only remove relations you created');
    }
    await this.relationsRepo.remove(relation);
    await this.auditService.log('case.relation.remove', 'case', caseId, user.id, {
      relationId,
    });
    return { removed: true };
  }

  private assertAction(
    user: User,
    caseEntity: Case,
    action: 'forward' | 'return' | 'resubmit',
  ) {
    const allowed = getAvailableActions({
      role: user.role,
      assignedStages: user.workflowStages,
      userId: user.id,
      departmentId: user.departmentId,
      createdById: caseEntity.createdById,
      currentStage: caseEntity.currentStage,
      workflowState: caseEntity.workflowState,
      status: caseEntity.status,
      returnedToUserId: caseEntity.returnedToUserId,
      returnedToDepartmentId: caseEntity.returnedToDepartmentId,
    });
    if (!allowed.includes(action)) {
      throw new ForbiddenException('You are not allowed to perform this action');
    }
  }

  private saveMovement(data: Partial<CaseMovement>) {
    return this.movementsRepo.save(this.movementsRepo.create(data));
  }

  private async attachMovementFiles(
    user: User,
    caseId: string,
    movementId: string,
    files?: Express.Multer.File[],
  ) {
    if (!files?.length) {
      return;
    }
    await this.documentsService.attachFiles(user, caseId, files, {
      movementId,
      isOriginal: false,
    });
  }

  private serializeMovement(movement: CaseMovement) {
    return {
      id: movement.id,
      caseId: movement.caseId,
      action: movement.action,
      fromStage: movement.fromStage,
      toStage: movement.toStage,
      instruction: movement.instruction,
      performedById: movement.performedById,
      performedBy: movement.performedBy
        ? {
            id: movement.performedBy.id,
            nameEn: movement.performedBy.nameEn,
            nameAr: movement.performedBy.nameAr,
          }
        : null,
      toUser: movement.toUser
        ? {
            id: movement.toUser.id,
            nameEn: movement.toUser.nameEn,
            nameAr: movement.toUser.nameAr,
          }
        : null,
      toDepartment: movement.toDepartment
        ? {
            id: movement.toDepartment.id,
            nameEn: movement.toDepartment.nameEn,
            nameAr: movement.toDepartment.nameAr,
          }
        : null,
      returnTarget: movement.returnTarget,
      decisionType: movement.decisionType,
      documents: (movement.documents || []).map((document) => serializeDocument(document)),
      createdAt: movement.createdAt,
    };
  }

  private serializeRelation(relation: CaseRelation) {
    return {
      id: relation.id,
      type: relation.type,
      note: relation.note,
      createdAt: relation.createdAt,
      createdBy: relation.createdBy
        ? {
            id: relation.createdBy.id,
            nameEn: relation.createdBy.nameEn,
            nameAr: relation.createdBy.nameAr,
          }
        : null,
      relatedCase: relation.relatedCase
        ? {
            id: relation.relatedCase.id,
            referenceNumber: relation.relatedCase.referenceNumber,
            title: relation.relatedCase.title,
            description: relation.relatedCase.description,
          }
        : null,
      relatedDocument: relation.relatedDocument
        ? serializeDocument(relation.relatedDocument)
        : null,
    };
  }
}
