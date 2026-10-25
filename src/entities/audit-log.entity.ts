import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  action: string;

  @Column()
  entityType: string;

  @Column()
  entityId: string;

  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
