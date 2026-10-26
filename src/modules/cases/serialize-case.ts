import { Case } from '../../entities/case.entity';
import { Document } from '../../entities/document.entity';
import { previewAsPdf } from '../../common/utils/document-preview';

export function serializeDocument(
  document: Document,
  extras?: { signedVersion?: Document | null },
) {
  const source = document.activityId
    ? 'execution'
    : document.decisionId
      ? 'decision'
      : document.movementId
        ? 'movement'
        : document.parentDocumentId
          ? 'signed'
          : 'original';
  const signedVersion = extras?.signedVersion;
  return {
    id: document.id,
    caseId: document.caseId,
    originalFileName: document.originalFileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    version: document.version,
    isOriginal: document.isOriginal,
    movementId: document.movementId,
    decisionId: document.decisionId,
    activityId: document.activityId,
    parentDocumentId: document.parentDocumentId,
    signedById: document.signedById,
    signedBy: document.signedBy
      ? {
          id: document.signedBy.id,
          nameEn: document.signedBy.nameEn,
          nameAr: document.signedBy.nameAr,
        }
      : null,
    signedAt: document.signedAt,
    signedStatus: document.parentDocumentId
      ? 'signed_copy'
      : signedVersion
        ? 'signed'
        : 'unsigned',
    signedVersionId: signedVersion?.id ?? null,
    signedVersionName: signedVersion?.originalFileName ?? null,
    watermarkSupported: previewAsPdf(document.mimeType, document.originalFileName),
    source,
    uploadedById: document.uploadedById,
    uploadedBy: document.uploadedBy
      ? {
          id: document.uploadedBy.id,
          nameEn: document.uploadedBy.nameEn,
          nameAr: document.uploadedBy.nameAr,
        }
      : null,
    uploadedAt: document.uploadedAt,
  };
}

export function serializeDocuments(documents: Document[]) {
  const latestSigned = new Map<string, Document>();
  for (const document of documents) {
    if (!document.parentDocumentId) {
      continue;
    }
    const current = latestSigned.get(document.parentDocumentId);
    if (!current || document.uploadedAt > current.uploadedAt) {
      latestSigned.set(document.parentDocumentId, document);
    }
  }
  return documents.map((document) =>
    serializeDocument(document, {
      signedVersion: latestSigned.get(document.id) ?? null,
    }),
  );
}

function miniDepartment(department?: { id: string; nameEn: string; nameAr: string } | null) {
  if (!department) {
    return null;
  }
  return {
    id: department.id,
    nameEn: department.nameEn,
    nameAr: department.nameAr,
  };
}

function miniUser(user?: { id: string; nameEn: string; nameAr: string; email?: string } | null) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    nameEn: user.nameEn,
    nameAr: user.nameAr,
    email: user.email,
  };
}

export function serializeCase(caseEntity: Case, includeDocuments = false) {
  return {
    id: caseEntity.id,
    referenceNumber: caseEntity.referenceNumber,
    title: caseEntity.title,
    description: caseEntity.description,
    type: caseEntity.type,
    direction: caseEntity.direction,
    status: caseEntity.status,
    categoryId: caseEntity.categoryId,
    categoryNameEn: caseEntity.categoryNameEn,
    categoryNameAr: caseEntity.categoryNameAr,
    targetTimelineDays: caseEntity.targetTimelineDays,
    retentionPeriodYears: caseEntity.retentionPeriodYears,
    dueDate: caseEntity.dueDate,
    retentionUntil: caseEntity.retentionUntil,
    timelineStatus: caseEntity.timelineStatus,
    sourceDepartmentId: caseEntity.sourceDepartmentId,
    sourceDepartment: miniDepartment(caseEntity.sourceDepartment),
    sourceEntity: caseEntity.sourceEntity,
    createdById: caseEntity.createdById,
    createdBy: miniUser(caseEntity.createdBy),
    ownerDepartmentId: caseEntity.ownerDepartmentId,
    ownerDepartment: miniDepartment(caseEntity.ownerDepartment),
    assignedToId: caseEntity.assignedToId,
    assignedTo: miniUser(caseEntity.assignedTo),
    currentStage: caseEntity.currentStage,
    workflowState: caseEntity.workflowState,
    returnedFromStage: caseEntity.returnedFromStage,
    returnedToUserId: caseEntity.returnedToUserId,
    returnedToUser: miniUser(caseEntity.returnedToUser),
    returnedToDepartmentId: caseEntity.returnedToDepartmentId,
    returnedToDepartment: miniDepartment(caseEntity.returnedToDepartment),
    createdAt: caseEntity.createdAt,
    lastActivityAt: caseEntity.lastActivityAt,
    updatedAt: caseEntity.updatedAt,
    documentCount: caseEntity.documents?.length,
    documents: includeDocuments
      ? serializeDocuments(caseEntity.documents || [])
      : undefined,
    availableActions: caseEntity.availableActions,
    availableDecisionTypes: caseEntity.availableDecisionTypes ?? [],
    canManageDepartments: Boolean(caseEntity.canManageDepartments),
    canAddActivity: Boolean(caseEntity.canAddActivity),
    canComplete: Boolean(caseEntity.canComplete),
    canManageAccess: Boolean(caseEntity.canManageAccess),
    canSignDocuments: Boolean(caseEntity.canSignDocuments),
    nextStage: caseEntity.nextStage,
    previousStage: caseEntity.previousStage,
  };
}
