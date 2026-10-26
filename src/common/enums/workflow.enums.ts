export enum WorkflowStage {
  SECRETARIAT = 'secretariat',
  STUDIES_COMMITTEE = 'studies_committee',
  TECHNICAL_OFFICE = 'technical_office',
  CHAIRMAN = 'chairman',
}

export enum WorkflowState {
  IN_REVIEW = 'in_review',
  AWAITING_INFO = 'awaiting_info',
  AWAITING_CHAIRMAN = 'awaiting_chairman',
  AWAITING_REPORT = 'awaiting_report',
  IN_EXECUTION = 'in_execution',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

export enum WorkflowActionType {
  CREATED = 'created',
  FORWARD = 'forward',
  RETURN = 'return',
  RESUBMIT = 'resubmit',
  DECISION = 'decision',
  COMPLETE = 'complete',
}

export enum ReturnTarget {
  ORIGINATOR = 'originator',
  DEPARTMENT = 'department',
  PREVIOUS_STAGE = 'previous_stage',
}

export type AvailableWorkflowAction = 'forward' | 'return' | 'resubmit';
