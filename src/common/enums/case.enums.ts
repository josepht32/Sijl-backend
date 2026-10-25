export enum CaseType {
  INTERNAL = 'internal',
  EXTERNAL = 'external',
}

export enum CaseDirection {
  INCOMING = 'incoming',
  OUTGOING = 'outgoing',
}

export enum CaseStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

export enum TimelineStatus {
  ON_TRACK = 'on_track',
  DUE_SOON = 'due_soon',
  OVERDUE = 'overdue',
}

export enum CaseAccessScope {
  MINE = 'mine',
  DEPARTMENT = 'department',
  ASSIGNED = 'assigned',
  GRANTED = 'granted',
  ALL = 'all',
}
