import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleDefinition } from '../../entities/role-definition.entity';
import { User } from '../../entities/user.entity';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([RoleDefinition, User]), AuditModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
