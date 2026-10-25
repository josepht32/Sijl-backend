import {
  AfterLoad,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  CaseDirection,
  CaseStatus,
  CaseType,
  TimelineStatus,
} from '../common/enums/case.enums';
import { computeTimelineStatus } from '../common/utils/timeline';
import { Organization } from './organization.entity';
import { CaseCategory } from './case-category.entity';
import { Department } from './department.entity';
import { User } from './user.entity';
import { Document } from './document.entity';
import { CaseGrant } from './case-grant.entity';
import { CaseConcernedDepartment } from './case-concerned-department.entity';
import { CaseDecision } from './case-decision.entity';
import { ExecutionActivity } from './execution-activity.entity';
import {
  WorkflowStage,
  WorkflowState,
  AvailableWorkflowAction,
} from '../common/enums/workflow.enums';
import { DecisionType } from '../common/enums/decision.enums';

@Entity('cases')
export class Case {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  referenceNumber: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar' })
  type: CaseType;

  @Column({ type: 'varchar' })
  direction: CaseDirection;

  @ManyToOne(() => CaseCategory, { onDelete: 'RESTRICT' })
  category: CaseCategory;

  @Column()
  categoryId: string;

  @Column()
  categoryNameEn: string;

  @Column()
  categoryNameAr: string;

  @Column({ type: 'int' })
  targetTimelineDays: number;

  @Column({ type: 'int' })
  retentionPeriodYears: number;

  @Index()
  @Column({ type: 'datetime' })
  dueDate: Date;

  @Column({ type: 'datetime', nullable: true })
  retentionUntil: Date | null;

  @Column({ type: 'varchar', default: CaseStatus.OPEN })
  status: CaseStatus;

  @Index()
  @Column({ type: 'varchar', default: WorkflowStage.SECRETARIAT })
  currentStage: WorkflowStage;

  @Column({ type: 'varchar', default: WorkflowState.IN_REVIEW })
  workflowState: WorkflowState;

  @Column({ type: 'varchar', nullable: true })
  returnedFromStage: WorkflowStage | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  returnedToUser: User | null;

  @Column({ type: 'varchar', nullable: true })
  returnedToUserId: string | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  returnedToDepartment: Department | null;

  @Column({ type: 'varchar', nullable: true })
  returnedToDepartmentId: string | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  sourceDepartment: Department | null;

  @Column({ type: 'varchar', nullable: true })
  sourceDepartmentId: string | null;

  @Column({ type: 'varchar', nullable: true })
  sourceEntity: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  createdBy: User;

  @Column()
  createdById: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  organization: Organization;

  @Column()
  organizationId: string;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  ownerDepartment: Department | null;

  @Column({ type: 'varchar', nullable: true })
  ownerDepartmentId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  assignedTo: User | null;

  @Column({ type: 'varchar', nullable: true })
  assignedToId: string | null;

  @OneToMany(() => Document, (document) => document.case)
  documents: Document[];

  @OneToMany(() => CaseGrant, (grant) => grant.case)
  grants: CaseGrant[];

  @OneToMany(() => CaseConcernedDepartment, (item) => item.case)
  concernedDepartments: CaseConcernedDepartment[];

  @OneToMany(() => CaseDecision, (decision) => decision.case)
  decisions: CaseDecision[];

  @OneToMany(() => ExecutionActivity, (activity) => activity.case)
  activities: ExecutionActivity[];

  @CreateDateColumn()
  createdAt: Date;

  @Index()
  @Column({ type: 'datetime' })
  lastActivityAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  timelineStatus: TimelineStatus;
  availableActions?: AvailableWorkflowAction[];
  availableDecisionTypes?: DecisionType[];
  canManageDepartments?: boolean;
  canAddActivity?: boolean;
  canManageAccess?: boolean;
  canSignDocuments?: boolean;
  nextStage?: WorkflowStage | null;
  previousStage?: WorkflowStage | null;

  @AfterLoad()
  populateTimelineStatus() {
    this.timelineStatus = computeTimelineStatus(
      this.dueDate,
      this.targetTimelineDays,
    );
  }
}
