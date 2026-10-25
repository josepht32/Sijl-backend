import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { WorkflowStageAssignment } from '../../entities/workflow-stage-assignment.entity';
import { RoleDefinition } from '../../entities/role-definition.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { DepartmentsModule } from '../departments/departments.module';
import { AuditModule } from '../audit/audit.module';
import { RolesModule } from '../roles/roles.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, WorkflowStageAssignment, RoleDefinition]),
    forwardRef(() => DepartmentsModule),
    AuditModule,
    RolesModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
