import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Document } from './document.entity';
import { User } from './user.entity';

@Entity('document_downloads')
export class DocumentDownload {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  traceCode: string;

  @ManyToOne(() => Document, { onDelete: 'CASCADE' })
  document: Document;

  @Column()
  documentId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  user: User | null;

  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @Column()
  caseId: string;

  @Column({ type: 'varchar' })
  purpose: 'preview' | 'download';

  @Column({ default: false })
  watermarked: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
