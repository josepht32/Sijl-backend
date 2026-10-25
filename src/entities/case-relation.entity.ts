import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Case } from './case.entity';
import { Document } from './document.entity';
import { User } from './user.entity';

export type CaseRelationType = 'case' | 'document';

@Entity('case_relations')
export class CaseRelation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => Case, { onDelete: 'CASCADE' })
  case: Case;

  @Column()
  caseId: string;

  @Column({ type: 'varchar' })
  type: CaseRelationType;

  @ManyToOne(() => Case, { nullable: true, onDelete: 'CASCADE' })
  relatedCase: Case | null;

  @Column({ type: 'varchar', nullable: true })
  relatedCaseId: string | null;

  @ManyToOne(() => Document, { nullable: true, onDelete: 'CASCADE' })
  relatedDocument: Document | null;

  @Column({ type: 'varchar', nullable: true })
  relatedDocumentId: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  createdBy: User;

  @Column()
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;
}
