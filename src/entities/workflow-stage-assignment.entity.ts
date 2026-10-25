import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WorkflowStage } from '../common/enums/workflow.enums';
import { User } from './user.entity';
import { Organization } from './organization.entity';

@Entity('workflow_stage_assignments')
@Index(['userId', 'stage'], { unique: true })
export class WorkflowStageAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'varchar' })
  stage: WorkflowStage;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  organization: Organization;

  @Column()
  organizationId: string;
}
