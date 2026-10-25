import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { RoleDefinition } from '../../entities/role-definition.entity';
import { User } from '../../entities/user.entity';
import { Permission, PERMISSION_GROUPS } from '../../common/enums/permission.enum';
import { Role } from '../../common/enums/role.enum';
import { WorkflowStage } from '../../common/enums/workflow.enums';
import { PREDEFINED_ROLES } from '../../common/roles/predefined-roles';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RoleDefinition)
    private readonly rolesRepo: Repository<RoleDefinition>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async ensureDefaults(organizationId: string): Promise<void> {
    const existing = await this.rolesRepo.find({ where: { organizationId } });
    const bySlug = new Map(existing.map((role) => [role.slug, role]));

    for (const seed of PREDEFINED_ROLES) {
      const current = bySlug.get(seed.slug);
      if (!current) {
        await this.rolesRepo.save(
          this.rolesRepo.create({
            slug: seed.slug,
            nameEn: seed.nameEn,
            nameAr: seed.nameAr,
            descriptionEn: seed.descriptionEn,
            descriptionAr: seed.descriptionAr,
            permissions: seed.permissions,
            workflowStages: seed.workflowStages,
            isSystem: true,
            isActive: true,
            sortOrder: seed.sortOrder,
            organizationId,
          }),
        );
        continue;
      }

      const patch: Partial<RoleDefinition> = {};
      if (!current.isSystem) {
        patch.isSystem = true;
      }
      if (seed.slug === Role.ADMIN) {
        const required = [Permission.ROLES_READ, Permission.ROLES_MANAGE];
        const missing = required.filter(
          (permission) => !current.permissions?.includes(permission),
        );
        if (missing.length) {
          patch.permissions = [...new Set([...(current.permissions ?? []), ...missing])];
        }
        if (!current.isActive) {
          patch.isActive = true;
        }
      }
      if (Object.keys(patch).length) {
        await this.rolesRepo.update(current.id, patch);
      }
    }
  }

  async findAll(organizationId: string, activeOnly = false): Promise<RoleDefinition[]> {
    const roles = await this.rolesRepo.find({
      where: {
        organizationId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      order: { sortOrder: 'ASC', nameEn: 'ASC' },
    });
    const counts = await this.userCounts(roles.map((role) => role.id));
    return roles.map((role) => {
      role.userCount = counts.get(role.id) ?? 0;
      return role;
    });
  }

  findById(id: string): Promise<RoleDefinition | null> {
    return this.rolesRepo.findOne({ where: { id } });
  }

  findBySlug(organizationId: string, slug: string): Promise<RoleDefinition | null> {
    return this.rolesRepo.findOne({ where: { organizationId, slug } });
  }

  async resolve(organizationId: string, slugOrId: string): Promise<RoleDefinition> {
    const role =
      (await this.findById(slugOrId)) ||
      (await this.findBySlug(organizationId, slugOrId));
    if (!role || role.organizationId !== organizationId) {
      throw new BadRequestException('Unknown role');
    }
    if (!role.isActive) {
      throw new BadRequestException('This role is inactive');
    }
    return role;
  }

  async create(
    organizationId: string,
    data: {
      nameEn: string;
      nameAr: string;
      descriptionEn?: string | null;
      descriptionAr?: string | null;
      permissions: Permission[];
      workflowStages?: WorkflowStage[];
    },
  ): Promise<RoleDefinition> {
    const slug = await this.uniqueSlug(organizationId, data.nameEn);
    const created = await this.rolesRepo.save(
      this.rolesRepo.create({
        slug,
        nameEn: data.nameEn,
        nameAr: data.nameAr,
        descriptionEn: data.descriptionEn ?? null,
        descriptionAr: data.descriptionAr ?? null,
        permissions: uniquePermissions(data.permissions),
        workflowStages: uniqueStages(data.workflowStages ?? []),
        isSystem: false,
        isActive: true,
        sortOrder: 200,
        organizationId,
      }),
    );
    created.userCount = 0;
    return created;
  }

  async update(
    organizationId: string,
    id: string,
    data: Partial<RoleDefinition>,
  ): Promise<RoleDefinition> {
    const role = await this.assertInOrganization(id, organizationId);

    if (role.slug === Role.ADMIN) {
      if (data.isActive === false) {
        throw new BadRequestException('The administrator role cannot be deactivated');
      }
      if (data.permissions) {
        const required = [Permission.ROLES_READ, Permission.ROLES_MANAGE];
        data.permissions = [...new Set([...data.permissions, ...required])];
      }
    }

    await this.rolesRepo.update(id, {
      ...(data.nameEn !== undefined ? { nameEn: data.nameEn } : {}),
      ...(data.nameAr !== undefined ? { nameAr: data.nameAr } : {}),
      ...(data.descriptionEn !== undefined ? { descriptionEn: data.descriptionEn } : {}),
      ...(data.descriptionAr !== undefined ? { descriptionAr: data.descriptionAr } : {}),
      ...(data.permissions !== undefined
        ? { permissions: uniquePermissions(data.permissions) }
        : {}),
      ...(data.workflowStages !== undefined
        ? { workflowStages: uniqueStages(data.workflowStages) }
        : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    });

    return this.assertInOrganization(id, organizationId);
  }

  async remove(organizationId: string, id: string): Promise<void> {
    const role = await this.assertInOrganization(id, organizationId);
    if (role.isSystem) {
      throw new BadRequestException('Predefined roles cannot be deleted');
    }
    const assigned = await this.usersRepo.count({ where: { roleId: id } });
    if (assigned > 0) {
      throw new BadRequestException('Reassign users before deleting this role');
    }
    await this.rolesRepo.delete(id);
  }

  async assertInOrganization(
    id: string,
    organizationId: string,
  ): Promise<RoleDefinition> {
    const role = await this.findById(id);
    if (!role || role.organizationId !== organizationId) {
      throw new NotFoundException('Role not found');
    }
    const counts = await this.userCounts([role.id]);
    role.userCount = counts.get(role.id) ?? 0;
    return role;
  }

  catalog() {
    return {
      groups: PERMISSION_GROUPS,
      permissions: Object.values(Permission),
      stages: Object.values(WorkflowStage),
    };
  }

  private async uniqueSlug(organizationId: string, nameEn: string): Promise<string> {
    const base =
      nameEn
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 40) || `role_${randomUUID().slice(0, 8)}`;
    let slug = base;
    let attempt = 2;
    while (await this.findBySlug(organizationId, slug)) {
      if (attempt > 50) {
        return `role_${randomUUID().slice(0, 12)}`;
      }
      slug = `${base.slice(0, 32)}_${attempt}`;
      attempt += 1;
    }
    return slug;
  }

  private async userCounts(roleIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (!roleIds.length) {
      return counts;
    }
    const rows = await this.usersRepo
      .createQueryBuilder('user')
      .select('user.roleId', 'roleId')
      .addSelect('COUNT(user.id)', 'count')
      .where('user.roleId IN (:...roleIds)', { roleIds })
      .groupBy('user.roleId')
      .getRawMany<{ roleId: string; count: string }>();
    for (const row of rows) {
      counts.set(row.roleId, Number(row.count) || 0);
    }
    return counts;
  }

  async mapForOrganization(organizationId: string): Promise<{
    byId: Map<string, RoleDefinition>;
    bySlug: Map<string, RoleDefinition>;
  }> {
    const roles = await this.rolesRepo.find({ where: { organizationId } });
    return {
      byId: new Map(roles.map((role) => [role.id, role])),
      bySlug: new Map(roles.map((role) => [role.slug, role])),
    };
  }
}

function uniquePermissions(values: Permission[]): Permission[] {
  const allowed = new Set(Object.values(Permission));
  return [...new Set(values.filter((item) => allowed.has(item)))];
}

function uniqueStages(values: WorkflowStage[]): WorkflowStage[] {
  const allowed = new Set(Object.values(WorkflowStage));
  return [...new Set(values.filter((item) => allowed.has(item)))];
}
