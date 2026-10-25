import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { User } from '../../entities/user.entity';
import { serializeUser } from '../../common/utils/serialize-user';
import { DepartmentsService } from '../departments/departments.service';
import { AuditService } from '../audit/audit.service';
import { RolesService } from '../roles/roles.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly departmentsService: DepartmentsService,
    private readonly auditService: AuditService,
    private readonly rolesService: RolesService,
  ) {}

  @Get()
  @RequirePermissions(Permission.USERS_READ)
  async list(@CurrentUser() user: User) {
    const users = await this.usersService.findAll(user.organizationId);
    return users.map(serializeUser);
  }

  @Post()
  @RequirePermissions(Permission.USERS_MANAGE)
  async create(@CurrentUser() actor: User, @Body() dto: CreateUserDto) {
    const existing = await this.usersService.findByEmailWithPassword(dto.email);
    if (existing) {
      throw new BadRequestException('A user with this email already exists');
    }

    if (dto.departmentId) {
      await this.departmentsService.assertInOrganization(
        dto.departmentId,
        actor.organizationId,
      );
    }

    const role = await this.rolesService.resolve(actor.organizationId, dto.role);

    const created = await this.usersService.create({
      email: dto.email.toLowerCase().trim(),
      passwordHash: await bcrypt.hash(dto.password, 10),
      nameEn: dto.nameEn.trim(),
      nameAr: dto.nameAr.trim(),
      role: role.slug,
      roleId: role.id,
      departmentId: dto.departmentId ?? null,
      organizationId: actor.organizationId,
      isActive: true,
    });

    await this.usersService.setWorkflowStages(
      created.id,
      actor.organizationId,
      dto.workflowStages ?? role.workflowStages ?? [],
    );

    await this.auditService.log(
      'user.create',
      'user',
      created.id,
      actor.id,
      { email: created.email },
    );

    return serializeUser(await this.usersService.findById(created.id));
  }

  @Patch(':id')
  @RequirePermissions(Permission.USERS_MANAGE)
  async update(
    @CurrentUser() actor: User,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const target = await this.usersService.findById(id);
    if (!target || target.organizationId !== actor.organizationId) {
      throw new NotFoundException('User not found');
    }

    if (dto.departmentId) {
      await this.departmentsService.assertInOrganization(
        dto.departmentId,
        actor.organizationId,
      );
    }

    const role = dto.role
      ? await this.rolesService.resolve(actor.organizationId, dto.role)
      : null;

    await this.usersService.update(id, {
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn.trim() } : {}),
      ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr.trim() } : {}),
      ...(role ? { role: role.slug, roleId: role.id } : {}),
      ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });

    if (dto.workflowStages || role) {
      await this.usersService.setWorkflowStages(
        id,
        actor.organizationId,
        dto.workflowStages ?? role?.workflowStages ?? target.workflowStages ?? [],
      );
    }

    await this.auditService.log('user.update', 'user', id, actor.id, dto);
    return serializeUser(await this.usersService.findById(id));
  }
}
