import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission, grantedPermissions, hasPermission } from '../../common/enums/permission.enum';
import { User } from '../../entities/user.entity';
import { AuditService } from '../audit/audit.service';

@Controller('roles')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly auditService: AuditService,
  ) {}

  @Get('catalog')
  @RequirePermissions(Permission.ROLES_READ)
  catalog() {
    return this.rolesService.catalog();
  }

  @Get()
  list(@CurrentUser() user: User) {
    const granted = grantedPermissions(user);
    if (
      !hasPermission(granted, Permission.ROLES_READ) &&
      !hasPermission(granted, Permission.USERS_MANAGE)
    ) {
      throw new ForbiddenException();
    }
    return this.rolesService.findAll(user.organizationId);
  }

  @Post()
  @RequirePermissions(Permission.ROLES_MANAGE)
  async create(@CurrentUser() actor: User, @Body() dto: CreateRoleDto) {
    const created = await this.rolesService.create(actor.organizationId, {
      nameEn: dto.nameEn.trim(),
      nameAr: dto.nameAr.trim(),
      descriptionEn: dto.descriptionEn?.trim() || null,
      descriptionAr: dto.descriptionAr?.trim() || null,
      permissions: dto.permissions,
      workflowStages: dto.workflowStages ?? [],
    });
    await this.auditService.log('role.create', 'role', created.id, actor.id, {
      slug: created.slug,
    });
    return created;
  }

  @Patch(':id')
  @RequirePermissions(Permission.ROLES_MANAGE)
  async update(
    @CurrentUser() actor: User,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    const updated = await this.rolesService.update(actor.organizationId, id, {
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn.trim() } : {}),
      ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr.trim() } : {}),
      ...(dto.descriptionEn !== undefined
        ? { descriptionEn: dto.descriptionEn?.trim() || null }
        : {}),
      ...(dto.descriptionAr !== undefined
        ? { descriptionAr: dto.descriptionAr?.trim() || null }
        : {}),
      ...(dto.permissions !== undefined ? { permissions: dto.permissions } : {}),
      ...(dto.workflowStages !== undefined
        ? { workflowStages: dto.workflowStages }
        : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });
    await this.auditService.log('role.update', 'role', id, actor.id, dto);
    return updated;
  }

  @Delete(':id')
  @RequirePermissions(Permission.ROLES_MANAGE)
  async remove(@CurrentUser() actor: User, @Param('id') id: string) {
    await this.rolesService.remove(actor.organizationId, id);
    await this.auditService.log('role.delete', 'role', id, actor.id, {});
    return { removed: true };
  }
}
