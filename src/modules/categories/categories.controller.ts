import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { User } from '../../entities/user.entity';
import { AuditService } from '../audit/audit.service';

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions(Permission.CATEGORIES_READ)
  list(@CurrentUser() user: User, @Query('active') active?: string) {
    return this.categoriesService.findAll(
      user.organizationId,
      active === 'true',
    );
  }

  @Post()
  @RequirePermissions(Permission.CATEGORIES_MANAGE)
  async create(@CurrentUser() actor: User, @Body() dto: CreateCategoryDto) {
    const created = await this.categoriesService.create({
      nameEn: dto.nameEn.trim(),
      nameAr: dto.nameAr.trim(),
      descriptionEn: dto.descriptionEn?.trim() || null,
      descriptionAr: dto.descriptionAr?.trim() || null,
      targetTimelineDays: dto.targetTimelineDays,
      retentionPeriodYears: dto.retentionPeriodYears,
      isActive: true,
      organizationId: actor.organizationId,
    });

    await this.auditService.log(
      'category.create',
      'category',
      created.id,
      actor.id,
      { nameEn: created.nameEn },
    );

    return created;
  }

  @Patch(':id')
  @RequirePermissions(Permission.CATEGORIES_MANAGE)
  async update(
    @CurrentUser() actor: User,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    await this.categoriesService.assertInOrganization(id, actor.organizationId);

    const updated = await this.categoriesService.update(id, {
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn.trim() } : {}),
      ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr.trim() } : {}),
      ...(dto.descriptionEn !== undefined
        ? { descriptionEn: dto.descriptionEn?.trim() || null }
        : {}),
      ...(dto.descriptionAr !== undefined
        ? { descriptionAr: dto.descriptionAr?.trim() || null }
        : {}),
      ...(dto.targetTimelineDays !== undefined
        ? { targetTimelineDays: dto.targetTimelineDays }
        : {}),
      ...(dto.retentionPeriodYears !== undefined
        ? { retentionPeriodYears: dto.retentionPeriodYears }
        : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });

    await this.auditService.log('category.update', 'category', id, actor.id, dto);
    return updated;
  }
}
