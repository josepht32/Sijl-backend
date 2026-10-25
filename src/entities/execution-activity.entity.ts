import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Case } from './case.entity';
import { User } from './user.entity';
import { Department } from './department.entity';
import { Document } from './document.entity';

@Entity('execution_activities')
export class ExecutionActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => Case, { onDelete: 'CASCADE' })
  case: Case;

  @Column()
  caseId: string;

  @Column({ type: 'text' })
  comment: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  author: User;

  @Column()
  authorId: string;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  department: Department | null;

  @Column({ type: 'varchar', nullable: true })
  departmentId: string | null;

  @OneToMany(() => Document, (document) => document.activity)
  documents: Document[];

  @CreateDateColumn()
  createdAt: Date;
}
