import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CasesService } from './cases.service';
import { CreateCaseDto, GrantAccessDto, QueryCasesDto } from './dto/case.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { User } from '../../entities/user.entity';

@Controller('cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Get('stats')
  @RequirePermissions(Permission.CASES_READ)
  stats(@CurrentUser() user: User) {
    return this.casesService.stats(user);
  }

  @Get()
  @RequirePermissions(Permission.CASES_READ)
  list(@CurrentUser() user: User, @Query() query: QueryCasesDto) {
    return this.casesService.list(user, query);
  }

  @Post()
  @RequirePermissions(Permission.CASES_CREATE)
  create(@CurrentUser() user: User, @Body() dto: CreateCaseDto) {
    return this.casesService.create(user, dto);
  }

  @Get(':id')
  @RequirePermissions(Permission.CASES_READ)
  getOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.casesService.getAccessible(user, id);
  }

  @Get(':id/grants')
  @RequirePermissions(Permission.CASES_READ)
  listGrants(@CurrentUser() user: User, @Param('id') id: string) {
    return this.casesService.listGrants(user, id);
  }

  @Post(':id/grants')
  @RequirePermissions(Permission.CASES_READ)
  grantAccess(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: GrantAccessDto,
  ) {
    return this.casesService.grantAccess(user, id, dto.userId);
  }

  @Delete(':id/grants/:grantId')
  @RequirePermissions(Permission.CASES_READ)
  revokeAccess(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('grantId') grantId: string,
  ) {
    return this.casesService.revokeAccess(user, id, grantId);
  }
}
