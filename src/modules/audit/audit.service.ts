import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async log(
    action: string,
    entityType: string,
    entityId: string,
    userId?: string | null,
    metadata?: unknown,
  ): Promise<void> {
    await this.auditRepo.save({
      action,
      entityType,
      entityId,
      userId: userId ?? null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  }
}
