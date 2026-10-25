import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  htmlHasContent,
  htmlToPdf,
  safeDocumentFileName,
  sanitizeComposedHtml,
} from '../../common/utils/html-to-pdf';
import { ComposeDocumentDto } from './dto/compose.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { Document } from '../../entities/document.entity';
import { DocumentDownload } from '../../entities/document-download.entity';
import { User } from '../../entities/user.entity';
import { CasesService } from '../cases/cases.service';
import { AuditService } from '../audit/audit.service';
import { serializeDocument, serializeDocuments } from '../cases/serialize-case';
import { canSignCaseDocuments } from '../../common/utils/case-access';
import { Permission, grantedPermissions, hasPermission } from '../../common/enums/permission.enum';
import { makeTraceCode } from '../../common/utils/watermark';
import { applySignaturePng, isPdf, watermarkPdf } from '../../common/utils/pdf-security';
import { extractDocumentText, htmlToPlainText } from '../../common/utils/document-text';
import {
  canConvertToPdf,
  fileExtension,
  renderPreviewPdf,
} from '../../common/utils/document-preview';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 400 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.txt',
  '.md',
  '.markdown',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
]);

export function uploadRoot(): string {
  return process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  constructor(
    @InjectRepository(Document)
    private readonly documentsRepo: Repository<Document>,
    @InjectRepository(DocumentDownload)
    private readonly downloadsRepo: Repository<DocumentDownload>,
    private readonly casesService: CasesService,
    private readonly auditService: AuditService,
  ) {}

  async listForCase(user: User, caseId: string) {
    await this.casesService.assertAccessibleEntity(user, caseId);
    const documents = await this.documentsRepo.find({
      where: { caseId },
      relations: ['uploadedBy', 'signedBy'],
      order: { uploadedAt: 'DESC' },
    });
    return serializeDocuments(documents);
  }

  async attachFiles(
    user: User,
    caseId: string,
    files: Express.Multer.File[],
    options?: {
      movementId?: string;
      decisionId?: string;
      activityId?: string;
      isOriginal?: boolean;
    },
  ) {
    if (!files?.length) {
      throw new BadRequestException('At least one file is required');
    }
    await this.casesService.assertAccessibleEntity(user, caseId);
    for (const file of files) {
      this.assertFile(file);
    }
    const stored = [];
    for (const file of files) {
      stored.push(
        await this.storeFile(user, caseId, file, {
          movementId: options?.movementId ?? null,
          decisionId: options?.decisionId ?? null,
          activityId: options?.activityId ?? null,
          isOriginal: options?.isOriginal ?? true,
        }),
      );
    }
    await this.casesService.touchActivity(caseId);
    return stored;
  }

  async uploadMany(user: User, caseId: string, files: Express.Multer.File[]) {
    const stored = await this.attachFiles(user, caseId, files, { isOriginal: true });
    await this.auditService.log('document.upload', 'case', caseId, user.id, {
      count: stored.length,
      names: stored.map((doc) => doc.originalFileName),
    });
    return stored.map((doc) => serializeDocument(doc));
  }

  async composeFromHtml(user: User, caseId: string, dto: ComposeDocumentDto) {
    await this.casesService.assertAccessibleEntity(user, caseId);
    const html = sanitizeComposedHtml(dto.html ?? '');
    if (!htmlHasContent(html)) {
      throw new BadRequestException('Document content is required');
    }
    const title = safeDocumentFileName(dto.title?.trim() || 'document');
    let pdf: Buffer;
    try {
      pdf = await htmlToPdf(html, { title, rtl: Boolean(dto.rtl) });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`HTML to PDF failed: ${detail}`);
      throw new BadRequestException('Unable to convert the document to PDF');
    }
    if (!pdf?.length) {
      throw new BadRequestException('Unable to convert the document to PDF');
    }
    const stored = await this.storeFile(
      user,
      caseId,
      {
        originalname: `${title}.pdf`,
        buffer: pdf,
        size: pdf.length,
        mimetype: 'application/pdf',
      } as Express.Multer.File,
      {
        isOriginal: true,
        extractedText: [title, htmlToPlainText(html)].filter(Boolean).join('\n'),
      },
    );
    await this.casesService.touchActivity(caseId);
    await this.auditService.log('document.compose', 'case', caseId, user.id, {
      name: stored.originalFileName,
    });
    return serializeDocument(stored);
  }

  async getAccessible(user: User, id: string) {
    const document = await this.documentsRepo.findOne({
      where: { id },
      relations: ['uploadedBy', 'signedBy'],
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    await this.casesService.assertAccessibleEntity(user, document.caseId);
    return document;
  }

  filePath(document: Document): string {
    return join(uploadRoot(), document.storageKey);
  }

  async deliver(
    user: User,
    id: string,
    purpose: 'preview' | 'download',
  ): Promise<{
    body: Buffer;
    mimeType: string;
    fileName: string;
    watermarked: boolean;
  }> {
    const document = await this.getAccessible(user, id);
    const original = readFileSync(this.filePath(document));
    const eventId = randomUUID();
    const traceCode = makeTraceCode(eventId);
    const downloadedAt = new Date();
    let body: Buffer = original;
    let mimeType = document.mimeType;
    let fileName = document.originalFileName;
    let watermarked = false;
    const watermarkContext = {
      email: user.email,
      traceCode,
      downloadedAt,
    };

    const convertToPdf = canConvertToPdf(document.mimeType, document.originalFileName);
    if (isPdf(document.mimeType) || convertToPdf) {
      try {
        const source = isPdf(document.mimeType)
          ? original
          : await renderPreviewPdf(
              original,
              document.mimeType,
              document.originalFileName,
            );
        body = await watermarkPdf(source, watermarkContext);
        mimeType = 'application/pdf';
        fileName = isPdf(document.mimeType)
          ? document.originalFileName
          : this.previewPdfName(document.originalFileName);
        watermarked = true;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.error(`Watermarked PDF failed for ${document.originalFileName}: ${detail}`);
        throw new BadRequestException(
          purpose === 'download'
            ? 'Unable to prepare a watermarked download for this file'
            : 'Unable to prepare a PDF preview for this file',
        );
      }
    }

    await this.downloadsRepo.save(
      this.downloadsRepo.create({
        id: eventId,
        traceCode,
        documentId: document.id,
        userId: user.id,
        caseId: document.caseId,
        purpose,
        watermarked,
      }),
    );
    await this.auditService.log(
      purpose === 'download' ? 'document.download' : 'document.preview',
      'document',
      document.id,
      user.id,
      { traceCode, watermarked, purpose },
    );

    return {
      body,
      mimeType,
      fileName,
      watermarked,
    };
  }

  async listDownloads(user: User, id: string) {
    if (!hasPermission(grantedPermissions(user), Permission.CASES_READ_ALL)) {
      throw new ForbiddenException('Not allowed to inspect download traces');
    }
    const document = await this.getAccessible(user, id);
    return this.downloadsRepo.find({
      where: { documentId: document.id },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async sign(user: User, id: string, signatureDataUrl: string) {
    const document = await this.getAccessible(user, id);
    if (document.parentDocumentId) {
      throw new BadRequestException('A signed copy cannot be signed again');
    }
    if (!isPdf(document.mimeType)) {
      throw new BadRequestException('Signing is only available for PDF documents');
    }
    if (
      !canSignCaseDocuments({
        role: user.role,
        assignedStages: user.workflowStages,
        permissions: grantedPermissions(user),
      })
    ) {
      throw new ForbiddenException('You are not allowed to sign this document');
    }

    const png = this.parsePngDataUrl(signatureDataUrl);
    const original = readFileSync(this.filePath(document));
    const signedBytes = await applySignaturePng(original, png);
    const signedName = this.signedFileName(document.originalFileName);
    const stored = await this.storeFile(
      user,
      document.caseId,
      {
        originalname: signedName,
        buffer: signedBytes,
        size: signedBytes.length,
        mimetype: 'application/pdf',
      } as Express.Multer.File,
      {
        isOriginal: false,
        parentDocumentId: document.id,
        signedById: user.id,
        signedAt: new Date(),
        version: (document.version || 1) + 1,
      },
    );

    await this.casesService.touchActivity(document.caseId);
    await this.auditService.log('document.sign', 'document', document.id, user.id, {
      signedDocumentId: stored.id,
    });

    return serializeDocument(stored);
  }

  private parsePngDataUrl(value: string): Buffer {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(value.trim());
    if (!match) {
      throw new BadRequestException('Signature must be a PNG image');
    }
    const png = Buffer.from(match[1], 'base64');
    if (png.length < 8 || png[0] !== 0x89 || png[1] !== 0x50) {
      throw new BadRequestException('Signature must be a PNG image');
    }
    if (png.length > MAX_SIGNATURE_BYTES) {
      throw new BadRequestException('Signature image is too large');
    }
    return png;
  }

  private signedFileName(name: string): string {
    if (name.toLowerCase().endsWith('.pdf')) {
      return `${name.slice(0, -4)} (signed).pdf`;
    }
    return `${name} (signed).pdf`;
  }

  private assertFile(file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Empty file is not allowed');
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException('File exceeds the 20MB limit');
    }
    const ext = fileExtension(file.originalname);
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) && !ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        `File type ${file.mimetype || ext || 'unknown'} is not supported`,
      );
    }
  }

  private previewPdfName(name: string): string {
    return name.replace(/\.[^.]+$/, '') + '.pdf';
  }

  private async storeFile(
    user: User,
    caseId: string,
    file: Express.Multer.File,
    options?: {
      movementId?: string | null;
      decisionId?: string | null;
      activityId?: string | null;
      isOriginal?: boolean;
      parentDocumentId?: string | null;
      signedById?: string | null;
      signedAt?: Date | null;
      version?: number;
      extractedText?: string | null;
    },
  ): Promise<Document> {
    const caseDir = join(uploadRoot(), caseId);
    mkdirSync(caseDir, { recursive: true });
    const storageKey = `${caseId}/${randomUUID()}`;
    writeFileSync(join(uploadRoot(), storageKey), file.buffer);
    const extractedText = (
      options?.extractedText ??
      extractDocumentText(file.buffer, file.mimetype, file.originalname)
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50_000);

    const saved = await this.documentsRepo.save(
      this.documentsRepo.create({
        caseId,
        originalFileName: file.originalname,
        storageKey,
        mimeType: file.mimetype,
        extractedText: extractedText || null,
        sizeBytes: file.size,
        version: options?.version ?? 1,
        isOriginal: options?.isOriginal ?? true,
        movementId: options?.movementId ?? null,
        decisionId: options?.decisionId ?? null,
        activityId: options?.activityId ?? null,
        parentDocumentId: options?.parentDocumentId ?? null,
        signedById: options?.signedById ?? null,
        signedAt: options?.signedAt ?? null,
        uploadedById: user.id,
      }),
    );

    return this.documentsRepo.findOne({
      where: { id: saved.id },
      relations: ['uploadedBy', 'signedBy'],
    });
  }
}
