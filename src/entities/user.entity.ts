import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Permission } from '../common/enums/permission.enum';
import { WorkflowStage } from '../common/enums/workflow.enums';
import { Organization } from './organization.entity';
import { Department } from './department.entity';
import { RoleDefinition } from './role-definition.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  passwordHash: string;

  @Column()
  nameEn: string;

  @Column()
  nameAr: string;

  @Column({ type: 'varchar' })
  role: string;

  @ManyToOne(() => RoleDefinition, { nullable: true, onDelete: 'SET NULL' })
  roleDefinition: RoleDefinition | null;

  @Column({ type: 'varchar', nullable: true })
  roleId: string | null;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  organization: Organization;

  @Column()
  organizationId: string;

  @ManyToOne(() => Department, (department) => department.employees, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  department: Department | null;

  @Column({ type: 'varchar', nullable: true })
  departmentId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  workflowStages: WorkflowStage[];

  permissions: Permission[];
}
