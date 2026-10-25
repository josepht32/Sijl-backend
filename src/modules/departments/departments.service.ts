import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from '../../entities/department.entity';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentsRepo: Repository<Department>,
  ) {}

  findAll(organizationId: string): Promise<Department[]> {
    return this.departmentsRepo.find({
      where: { organizationId },
      relations: ['manager', 'employees'],
      order: { createdAt: 'ASC' },
    });
  }

  findById(id: string): Promise<Department | null> {
    return this.departmentsRepo.findOne({
      where: { id },
      relations: ['manager', 'employees'],
    });
  }

  async assertInOrganization(
    id: string,
    organizationId: string,
  ): Promise<Department> {
    const department = await this.findById(id);
    if (!department || department.organizationId !== organizationId) {
      throw new NotFoundException('Department not found');
    }
    return department;
  }

  create(data: Partial<Department>): Promise<Department> {
    return this.departmentsRepo.save(this.departmentsRepo.create(data));
  }

  async update(id: string, data: Partial<Department>): Promise<Department> {
    await this.departmentsRepo.update(id, data);
    return this.findById(id);
  }
}
