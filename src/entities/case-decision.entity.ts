import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DecisionType } from '../common/enums/decision.enums';
import { Case } from './case.entity';
import { User } from './user.entity';
import { Document } from './document.entity';

@Entity('case_decisions')
export class CaseDecision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => Case, { onDelete: 'CASCADE' })
  case: Case;

  @Column()
  caseId: string;

  @Column({ type: 'varchar' })
  type: DecisionType;

  @Column({ type: 'text' })
  instruction: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  performedBy: User;

  @Column()
  performedById: string;

  @OneToMany(() => Document, (document) => document.decision)
  documents: Document[];

  @CreateDateColumn()
  createdAt: Date;
}
