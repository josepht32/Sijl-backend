import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { WorkflowService } from './workflow.service';
import {
  CreateRelationDto,
  ForwardCaseDto,
  ResubmitCaseDto,
  ReturnCaseDto,
} from './dto/workflow.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { User } from '../../entities/user.entity';

const filesInterceptor = FilesInterceptor('files', 10, {
  storage: memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

@Controller('cases/:caseId')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get('history')
  @RequirePermissions(Permission.CASES_READ)
  history(@CurrentUser() user: User, @Param('caseId') caseId: string) {
    return this.workflowService.history(user, caseId);
  }

  @Post('forward')
  @RequirePermissions(Permission.CASES_READ)
  @UseInterceptors(filesInterceptor)
  forward(
    @CurrentUser() user: User,
    @Param('caseId') caseId: string,
    @Body() dto: ForwardCaseDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.workflowService.forward(user, caseId, dto, files);
  }

  @Post('return')
  @RequirePermissions(Permission.CASES_READ)
  @UseInterceptors(filesInterceptor)
  returnCase(
    @CurrentUser() user: User,
    @Param('caseId') caseId: string,
    @Body() dto: ReturnCaseDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.workflowService.returnForCompletion(user, caseId, dto, files);
  }

  @Post('resubmit')
  @RequirePermissions(Permission.CASES_READ)
  @UseInterceptors(filesInterceptor)
  resubmit(
    @CurrentUser() user: User,
    @Param('caseId') caseId: string,
    @Body() dto: ResubmitCaseDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.workflowService.resubmit(user, caseId, dto, files);
  }

  @Get('related-suggestions')
  @RequirePermissions(Permission.CASES_READ)
  relatedSuggestions(@CurrentUser() user: User, @Param('caseId') caseId: string) {
    return this.workflowService.suggestRelated(user, caseId);
  }

  @Get('relations')
  @RequirePermissions(Permission.CASES_READ)
  relations(@CurrentUser() user: User, @Param('caseId') caseId: string) {
    return this.workflowService.listRelations(user, caseId);
  }

  @Post('relations')
  @RequirePermissions(Permission.CASES_READ)
  addRelation(
    @CurrentUser() user: User,
    @Param('caseId') caseId: string,
    @Body() dto: CreateRelationDto,
  ) {
    return this.workflowService.addRelation(user, caseId, dto);
  }

  @Delete('relations/:relationId')
  @RequirePermissions(Permission.CASES_READ)
  removeRelation(
    @CurrentUser() user: User,
    @Param('caseId') caseId: string,
    @Param('relationId') relationId: string,
  ) {
    return this.workflowService.removeRelation(user, caseId, relationId);
  }
}
