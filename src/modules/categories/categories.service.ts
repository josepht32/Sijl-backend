import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CaseCategory } from '../../entities/case-category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(CaseCategory)
    private readonly categoriesRepo: Repository<CaseCategory>,
  ) {}

  findAll(organizationId: string, activeOnly = false): Promise<CaseCategory[]> {
    return this.categoriesRepo.find({
      where: {
        organizationId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      order: { nameEn: 'ASC' },
    });
  }

  findById(id: string): Promise<CaseCategory | null> {
    return this.categoriesRepo.findOne({ where: { id } });
  }

  async assertInOrganization(
    id: string,
    organizationId: string,
    activeOnly = false,
  ): Promise<CaseCategory> {
    const category = await this.findById(id);
    if (
      !category ||
      category.organizationId !== organizationId ||
      (activeOnly && !category.isActive)
    ) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  create(data: Partial<CaseCategory>): Promise<CaseCategory> {
    return this.categoriesRepo.save(this.categoriesRepo.create(data));
  }

  async update(id: string, data: Partial<CaseCategory>): Promise<CaseCategory> {
    await this.categoriesRepo.update(id, data);
    return this.findById(id);
  }
}
