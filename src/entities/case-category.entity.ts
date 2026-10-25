import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from './organization.entity';

@Entity('case_categories')
export class CaseCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nameEn: string;

  @Column()
  nameAr: string;

  @Column({ type: 'text', nullable: true })
  descriptionEn: string | null;

  @Column({ type: 'text', nullable: true })
  descriptionAr: string | null;

  @Column({ type: 'int' })
  targetTimelineDays: number;

  @Column({ type: 'int' })
  retentionPeriodYears: number;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  organization: Organization;

  @Column()
  organizationId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
