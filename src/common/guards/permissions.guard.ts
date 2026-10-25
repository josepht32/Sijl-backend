import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Permission, grantedPermissions, hasPermission } from '../enums/permission.enum';
import { User } from '../../entities/user.entity';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) {
      return true;
    }
    const user = context.switchToHttp().getRequest().user as User | undefined;
    if (!user) {
      return false;
    }
    return required.every((permission) =>
      hasPermission(grantedPermissions(user), permission),
    );
  }
}
