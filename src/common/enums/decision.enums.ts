import { CaseStatus } from './case.enums';
import { WorkflowState } from './workflow.enums';

export enum DecisionType {
  APPROVAL = 'approval',
  ARCHIVE = 'archive',
  REQUEST_DETAILED_REPORT = 'request_detailed_report',
}

export interface DecisionDefinition {
  resultingState: WorkflowState;
  resultingStatus: CaseStatus;
  requiresDepartments: boolean;
}

export const DECISION_DEFINITIONS: Record<DecisionType, DecisionDefinition> = {
  [DecisionType.APPROVAL]: {
    resultingState: WorkflowState.IN_EXECUTION,
    resultingStatus: CaseStatus.OPEN,
    requiresDepartments: true,
  },
  [DecisionType.ARCHIVE]: {
    resultingState: WorkflowState.ARCHIVED,
    resultingStatus: CaseStatus.CLOSED,
    requiresDepartments: false,
  },
  [DecisionType.REQUEST_DETAILED_REPORT]: {
    resultingState: WorkflowState.AWAITING_REPORT,
    resultingStatus: CaseStatus.OPEN,
    requiresDepartments: true,
  },
};

export const DECISION_TYPES = Object.values(DecisionType);
