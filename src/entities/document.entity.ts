import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Case } from './case.entity';
import { User } from './user.entity';
import { CaseMovement } from './case-movement.entity';
import { CaseDecision } from './case-decision.entity';
import { ExecutionActivity } from './execution-activity.entity';

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Case, (caseEntity) => caseEntity.documents, {
    onDelete: 'CASCADE',
  })
  case: Case;

  @Column()
  caseId: string;

  @Column()
  originalFileName: string;

  @Column()
  storageKey: string;

  @Column()
  mimeType: string;

  @Column({ type: 'text', nullable: true })
  extractedText: string | null;

  @Column({ type: 'int' })
  sizeBytes: number;

  @Column({ default: 1 })
  version: number;

  @Column({ default: true })
  isOriginal: boolean;

  @ManyToOne(() => CaseMovement, (movement) => movement.documents, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  movement: CaseMovement | null;

  @Column({ type: 'varchar', nullable: true })
  movementId: string | null;

  @ManyToOne(() => CaseDecision, (decision) => decision.documents, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  decision: CaseDecision | null;

  @Column({ type: 'varchar', nullable: true })
  decisionId: string | null;

  @ManyToOne(() => ExecutionActivity, (activity) => activity.documents, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  activity: ExecutionActivity | null;

  @Column({ type: 'varchar', nullable: true })
  activityId: string | null;

  @ManyToOne(() => Document, { nullable: true, onDelete: 'SET NULL' })
  parentDocument: Document | null;

  @Column({ type: 'varchar', nullable: true })
  parentDocumentId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  signedBy: User | null;

  @Column({ type: 'varchar', nullable: true })
  signedById: string | null;

  @Column({ type: 'datetime', nullable: true })
  signedAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  uploadedBy: User;

  @Column()
  uploadedById: string;

  @CreateDateColumn()
  uploadedAt: Date;
}
