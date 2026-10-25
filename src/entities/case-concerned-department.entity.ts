import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Case } from './case.entity';
import { Department } from './department.entity';
import { User } from './user.entity';

@Entity('case_concerned_departments')
@Index(['caseId', 'departmentId'], { unique: true })
export class CaseConcernedDepartment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Case, { onDelete: 'CASCADE' })
  case: Case;

  @Column()
  caseId: string;

  @ManyToOne(() => Department, { onDelete: 'RESTRICT' })
  department: Department;

  @Column()
  departmentId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  assignedBy: User | null;

  @Column({ type: 'varchar', nullable: true })
  assignedById: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
