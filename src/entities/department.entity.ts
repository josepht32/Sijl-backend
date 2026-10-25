import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { User } from './user.entity';

@Entity('departments')
export class Department {
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

  @ManyToOne(() => Organization, (organization) => organization.departments, {
    onDelete: 'CASCADE',
  })
  organization: Organization;

  @Column()
  organizationId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'managerId' })
  manager: User | null;

  @Column({ type: 'varchar', nullable: true })
  managerId: string | null;

  @OneToMany(() => User, (user) => user.department)
  employees: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
