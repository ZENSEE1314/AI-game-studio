import { Controller, Get, Global, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermissions } from '../common/decorators';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /** One row per recipient. Pass `tx` so the notice commits (or rolls back) with the change it describes. */
  async notify(userIds: string[], n: { type: string; title: string; body: string; data?: Prisma.InputJsonValue }, tx?: Prisma.TransactionClient) {
    const ids = [...new Set(userIds)];
    if (!ids.length) return 0;
    const r = await (tx ?? this.prisma).notification.createMany({ data: ids.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body, data: n.data })) });
    return r.count;
  }

  /** Every active non-admin account. */
  async playerIds(tx?: Prisma.TransactionClient) {
    const rows = await (tx ?? this.prisma).user.findMany({ where: { status: 'ACTIVE', role: { not: 'SUPER_ADMIN' } }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async list(userId: string, q: { unreadOnly: boolean; page: number; limit: number }) {
    const where: Prisma.NotificationWhereInput = { userId, ...(q.unreadOnly ? { readAt: null } : {}) };
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, total, unread, page: q.page, limit: q.limit };
  }
  unreadCount(userId: string) { return this.prisma.notification.count({ where: { userId, readAt: null } }).then((unread) => ({ unread })); }

  async markRead(userId: string, id: string) {
    // userId in the filter: nobody can touch another account's notices; missing and foreign look identical.
    const r = await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    if (!r.count && !(await this.prisma.notification.findFirst({ where: { id, userId } }))) throw new NotFoundException('Notification not found');
    return { read: true };
  }
  async markAllRead(userId: string) {
    const r = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { marked: r.count };
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}
  @Get() @RequirePermissions('system:read')
  list(@CurrentUser() u: AuthUser, @Query('unread') unread?: string, @Query('page') p = '1', @Query('limit') l = '25') {
    return this.svc.list(u.id, { unreadOnly: unread === 'true', page: Math.max(1, +p || 1), limit: Math.min(100, Math.max(1, +l || 25)) });
  }
  @Get('unread-count') @RequirePermissions('system:read') count(@CurrentUser() u: AuthUser) { return this.svc.unreadCount(u.id); }
  @Post('read-all') @RequirePermissions('system:read') readAll(@CurrentUser() u: AuthUser) { return this.svc.markAllRead(u.id); }
  @Post(':id/read') @RequirePermissions('system:read') read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.markRead(u.id, id); }
}

@Global()
@Module({ providers: [NotificationsService], controllers: [NotificationsController], exports: [NotificationsService] })
export class NotificationsModule {}
