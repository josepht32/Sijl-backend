import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Case } from './case.entity';
import { User } from './user.entity';

@Entity('case_grants')
@Index(['caseId', 'userId'], { unique: true })
export class CaseGrant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Case, (caseEntity) => caseEntity.grants, {
    onDelete: 'CASCADE',
  })
  case: Case;

  @Column()
  caseId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'varchar', default: 'read' })
  accessLevel: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  grantedBy: User | null;

  @Column({ type: 'varchar', nullable: true })
  grantedById: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
