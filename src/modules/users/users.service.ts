import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { WorkflowStageAssignment } from '../../entities/workflow-stage-assignment.entity';
import { RoleDefinition } from '../../entities/role-definition.entity';
import { WorkflowStage } from '../../common/enums/workflow.enums';
import { Permission, permissionsFor } from '../../common/enums/permission.enum';
import { RolesService } from '../roles/roles.service';
import { canViewExecutiveAnalytics } from '../../common/utils/case-access';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(WorkflowStageAssignment)
    private readonly assignmentsRepo: Repository<WorkflowStageAssignment>,
    private readonly rolesService: RolesService,
  ) {}

  async findById(id: string): Promise<User | null> {
    const user = await this.usersRepo.findOne({
      where: { id },
      relations: ['department'],
    });
    if (user) {
      await this.attachAccess([user]);
    }
    return user;
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    const user = await this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.department', 'department')
      .where('user.email = :email', { email: email.toLowerCase().trim() })
      .getOne();
    if (user) {
      await this.attachAccess([user]);
    }
    return user;
  }

  async findAll(organizationId: string): Promise<User[]> {
    const users = await this.usersRepo.find({
      where: { organizationId },
      relations: ['department'],
      order: { createdAt: 'ASC' },
    });
    await this.attachAccess(users);
    return users;
  }

  create(data: Partial<User>): Promise<User> {
    const user = this.usersRepo.create(data);
    return this.usersRepo.save(user);
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    await this.usersRepo.update(id, data);
    return this.findById(id);
  }

  async setWorkflowStages(
    userId: string,
    organizationId: string,
    stages: WorkflowStage[],
  ): Promise<void> {
    await this.assignmentsRepo.delete({ userId });
    const unique = [...new Set(stages)];
    if (!unique.length) {
      return;
    }
    await this.assignmentsRepo.save(
      unique.map((stage) =>
        this.assignmentsRepo.create({ userId, organizationId, stage }),
      ),
    );
  }

  count(): Promise<number> {
    return this.usersRepo.count();
  }

  private async attachAccess(users: User[]): Promise<void> {
    if (!users.length) {
      return;
    }
    const assignments = await this.assignmentsRepo.find({
      where: { userId: In(users.map((user) => user.id)) },
    });
    const byUser = new Map<string, WorkflowStage[]>();
    for (const assignment of assignments) {
      const list = byUser.get(assignment.userId) ?? [];
      list.push(assignment.stage);
      byUser.set(assignment.userId, list);
    }

    const byOrg = new Map<
      string,
      { byId: Map<string, RoleDefinition>; bySlug: Map<string, RoleDefinition> }
    >();
    const orgIds = [...new Set(users.map((user) => user.organizationId))];
    await Promise.all(
      orgIds.map(async (organizationId) => {
        byOrg.set(organizationId, await this.rolesService.mapForOrganization(organizationId));
      }),
    );

    for (const user of users) {
      user.workflowStages = byUser.get(user.id) ?? [];
      const maps = byOrg.get(user.organizationId);
      const definition =
        (user.roleId ? maps?.byId.get(user.roleId) : undefined) ??
        maps?.bySlug.get(user.role);
      user.roleDefinition = definition ?? null;
      const permissions = new Set<Permission>(
        definition?.permissions ?? permissionsFor(user.role),
      );
      if (
        canViewExecutiveAnalytics({
          role: user.role,
          assignedStages: user.workflowStages,
          permissions: [...permissions],
        })
      ) {
        permissions.add(Permission.ANALYTICS_EXECUTIVE);
      }
      user.permissions = [...permissions];
    }
  }
}
