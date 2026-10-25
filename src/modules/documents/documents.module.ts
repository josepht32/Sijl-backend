import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from '../../entities/document.entity';
import { DocumentDownload } from '../../entities/document-download.entity';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { CasesModule } from '../cases/cases.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, DocumentDownload]),
    CasesModule,
    AuditModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
