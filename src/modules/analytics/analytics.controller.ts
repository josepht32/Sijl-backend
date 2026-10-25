import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsPeriodDto } from './dto/analytics.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { User } from '../../entities/user.entity';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('operational')
  @RequirePermissions(Permission.CASES_READ)
  operational(@CurrentUser() user: User) {
    return this.analyticsService.operational(user);
  }

  @Get('executive')
  @RequirePermissions(Permission.CASES_READ)
  executive(@CurrentUser() user: User, @Query() query: AnalyticsPeriodDto) {
    return this.analyticsService.executive(user, query);
  }
}
