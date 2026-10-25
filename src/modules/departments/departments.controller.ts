import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
} from './dto/department.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { User } from '../../entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { NotFoundException } from '@nestjs/common';

@Controller('departments')
export class DepartmentsController {
  constructor(
    private readonly departmentsService: DepartmentsService,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(Permission.DEPARTMENTS_READ)
  list(@CurrentUser() user: User) {
    return this.departmentsService.findAll(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions(Permission.DEPARTMENTS_READ)
  async getOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.departmentsService.assertInOrganization(
      id,
      user.organizationId,
    );
  }

  @Post()
  @RequirePermissions(Permission.DEPARTMENTS_MANAGE)
  async create(@CurrentUser() actor: User, @Body() dto: CreateDepartmentDto) {
    if (dto.managerId) {
      await this.assertManager(dto.managerId, actor.organizationId);
    }

    const created = await this.departmentsService.create({
      nameEn: dto.nameEn.trim(),
      nameAr: dto.nameAr.trim(),
      descriptionEn: dto.descriptionEn?.trim() || null,
      descriptionAr: dto.descriptionAr?.trim() || null,
      managerId: dto.managerId ?? null,
      organizationId: actor.organizationId,
    });

    await this.auditService.log(
      'department.create',
      'department',
      created.id,
      actor.id,
      { nameEn: created.nameEn },
    );

    return this.departmentsService.findById(created.id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.DEPARTMENTS_MANAGE)
  async update(
    @CurrentUser() actor: User,
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    await this.departmentsService.assertInOrganization(
      id,
      actor.organizationId,
    );

    if (dto.managerId) {
      await this.assertManager(dto.managerId, actor.organizationId);
    }

    const updated = await this.departmentsService.update(id, {
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn.trim() } : {}),
      ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr.trim() } : {}),
      ...(dto.descriptionEn !== undefined
        ? { descriptionEn: dto.descriptionEn?.trim() || null }
        : {}),
      ...(dto.descriptionAr !== undefined
        ? { descriptionAr: dto.descriptionAr?.trim() || null }
        : {}),
      ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
    });

    await this.auditService.log(
      'department.update',
      'department',
      id,
      actor.id,
      dto,
    );
    return updated;
  }

  private async assertManager(managerId: string, organizationId: string) {
    const manager = await this.usersService.findById(managerId);
    if (!manager || manager.organizationId !== organizationId) {
      throw new NotFoundException('Manager not found');
    }
    return manager;
  }
}
