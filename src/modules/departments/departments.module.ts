import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from '../../entities/department.entity';
import { DepartmentsService } from './departments.service';
import { DepartmentsController } from './departments.controller';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Department]),
    forwardRef(() => UsersModule),
    AuditModule,
  ],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
