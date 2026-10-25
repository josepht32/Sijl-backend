import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Permission } from '../common/enums/permission.enum';
import { WorkflowStage } from '../common/enums/workflow.enums';
import { Organization } from './organization.entity';

@Entity('roles')
@Index(['organizationId', 'slug'], { unique: true })
export class RoleDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  slug: string;

  @Column()
  nameEn: string;

  @Column()
  nameAr: string;

  @Column({ type: 'text', nullable: true })
  descriptionEn: string | null;

  @Column({ type: 'text', nullable: true })
  descriptionAr: string | null;

  @Column({ type: 'simple-json' })
  permissions: Permission[];

  @Column({ type: 'simple-json' })
  workflowStages: WorkflowStage[];

  @Column({ default: false })
  isSystem: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 100 })
  sortOrder: number;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  organization: Organization;

  @Column()
  organizationId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  userCount?: number;
}
