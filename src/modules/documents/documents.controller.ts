import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';
import { SignDocumentDto } from './dto/sign.dto';
import { ComposeDocumentDto } from './dto/compose.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { User } from '../../entities/user.entity';
import { serializeDocument } from '../cases/serialize-case';

@Controller()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('cases/:caseId/documents')
  @RequirePermissions(Permission.CASES_READ)
  list(@CurrentUser() user: User, @Param('caseId') caseId: string) {
    return this.documentsService.listForCase(user, caseId);
  }

  @Post('cases/:caseId/documents')
  @RequirePermissions(Permission.CASES_CREATE)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUser() user: User,
    @Param('caseId') caseId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.documentsService.uploadMany(user, caseId, files);
  }

  @Post('cases/:caseId/documents/compose')
  @RequirePermissions(Permission.CASES_CREATE)
  compose(
    @CurrentUser() user: User,
    @Param('caseId') caseId: string,
    @Body() dto: ComposeDocumentDto,
  ) {
    return this.documentsService.composeFromHtml(user, caseId, dto);
  }

  @Get('documents/:id')
  @RequirePermissions(Permission.CASES_READ)
  async getOne(@CurrentUser() user: User, @Param('id') id: string) {
    return serializeDocument(await this.documentsService.getAccessible(user, id));
  }

  @Get('documents/:id/file')
  @RequirePermissions(Permission.CASES_READ)
  @Header('Cache-Control', 'private, max-age=0, no-cache')
  async file(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const delivered = await this.documentsService.deliver(user, id, 'preview');
    return this.toFile(delivered, true);
  }

  @Get('documents/:id/download')
  @RequirePermissions(Permission.CASES_READ)
  @Header('Cache-Control', 'private, no-store')
  async download(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const delivered = await this.documentsService.deliver(user, id, 'download');
    return this.toFile(delivered, false);
  }

  @Get('documents/:id/downloads')
  @RequirePermissions(Permission.CASES_READ)
  listDownloads(@CurrentUser() user: User, @Param('id') id: string) {
    return this.documentsService.listDownloads(user, id);
  }

  @Post('documents/:id/sign')
  @RequirePermissions(Permission.CASES_READ)
  sign(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: SignDocumentDto,
  ) {
    return this.documentsService.sign(user, id, dto.signatureDataUrl);
  }

  private toFile(
    delivered: {
      body: Buffer;
      mimeType: string;
      fileName: string;
    },
    inline: boolean,
  ) {
    const encoded = encodeURIComponent(delivered.fileName);
    const canInline =
      inline &&
      (delivered.mimeType.startsWith('image/') || delivered.mimeType === 'application/pdf');
    return new StreamableFile(delivered.body, {
      type: delivered.mimeType,
      disposition: `${canInline ? 'inline' : 'attachment'}; filename="${encoded}"; filename*=UTF-8''${encoded}`,
    });
  }
}
