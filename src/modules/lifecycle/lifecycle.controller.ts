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
import { LifecycleService } from './lifecycle.service';
import {
  AssignDepartmentDto,
  CreateActivityDto,
  CreateDecisionDto,
} from './dto/lifecycle.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { User } from '../../entities/user.entity';

const filesInterceptor = FilesInterceptor('files', 10, {
  storage: memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

@Controller('cases/:caseId')
export class LifecycleController {
  constructor(private readonly lifecycleService: LifecycleService) {}

  @Get('decisions')
  @RequirePermissions(Permission.CASES_READ)
  listDecisions(@CurrentUser() user: User, @Param('caseId') caseId: string) {
    return this.lifecycleService.listDecisions(user, caseId);
  }

  @Post('decisions')
  @RequirePermissions(Permission.CASES_READ)
  @UseInterceptors(filesInterceptor)
  decide(
    @CurrentUser() user: User,
    @Param('caseId') caseId: string,
    @Body() dto: CreateDecisionDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.lifecycleService.decide(user, caseId, dto, files);
  }

  @Get('departments')
  @RequirePermissions(Permission.CASES_READ)
  listDepartments(@CurrentUser() user: User, @Param('caseId') caseId: string) {
    return this.lifecycleService.listDepartments(user, caseId);
  }

  @Post('departments')
  @RequirePermissions(Permission.CASES_READ)
  assignDepartment(
    @CurrentUser() user: User,
    @Param('caseId') caseId: string,
    @Body() dto: AssignDepartmentDto,
  ) {
    return this.lifecycleService.assignDepartment(user, caseId, dto);
  }

  @Delete('departments/:departmentId')
  @RequirePermissions(Permission.CASES_READ)
  removeDepartment(
    @CurrentUser() user: User,
    @Param('caseId') caseId: string,
    @Param('departmentId') departmentId: string,
  ) {
    return this.lifecycleService.removeDepartment(user, caseId, departmentId);
  }

  @Get('activities')
  @RequirePermissions(Permission.CASES_READ)
  listActivities(@CurrentUser() user: User, @Param('caseId') caseId: string) {
    return this.lifecycleService.listActivities(user, caseId);
  }

  @Post('activities')
  @RequirePermissions(Permission.CASES_READ)
  @UseInterceptors(filesInterceptor)
  addActivity(
    @CurrentUser() user: User,
    @Param('caseId') caseId: string,
    @Body() dto: CreateActivityDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.lifecycleService.addActivity(user, caseId, dto, files);
  }
}
