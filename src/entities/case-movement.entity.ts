import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  ReturnTarget,
  WorkflowActionType,
  WorkflowStage,
} from '../common/enums/workflow.enums';
import { Case } from './case.entity';
import { User } from './user.entity';
import { Department } from './department.entity';
import { Document } from './document.entity';

@Entity('case_movements')
export class CaseMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => Case, { onDelete: 'CASCADE' })
  case: Case;

  @Column()
  caseId: string;

  @Column({ type: 'varchar' })
  action: WorkflowActionType;

  @Column({ type: 'varchar', nullable: true })
  fromStage: WorkflowStage | null;

  @Column({ type: 'varchar', nullable: true })
  toStage: WorkflowStage | null;

  @Column({ type: 'text', nullable: true })
  instruction: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  performedBy: User;

  @Column()
  performedById: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  toUser: User | null;

  @Column({ type: 'varchar', nullable: true })
  toUserId: string | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  toDepartment: Department | null;

  @Column({ type: 'varchar', nullable: true })
  toDepartmentId: string | null;

  @Column({ type: 'varchar', nullable: true })
  returnTarget: ReturnTarget | null;

  @Column({ type: 'varchar', nullable: true })
  decisionType: string | null;

  @OneToMany(() => Document, (document) => document.movement)
  documents: Document[];

  @CreateDateColumn()
  createdAt: Date;
}
