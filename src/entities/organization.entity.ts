import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Department } from './department.entity';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nameEn: string;

  @Column()
  nameAr: string;

  @OneToMany(() => Department, (department) => department.organization)
  departments: Department[];

  @CreateDateColumn()
  createdAt: Date;
}
