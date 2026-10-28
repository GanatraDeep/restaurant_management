import type { NotifyPayload } from '../notifications/notifications.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { superAdminEmails } from './super-admin';

/**
 * Sends an in-app notification to every super admin (flagged users plus
 * SUPER_ADMIN_EMAILS). Notifications are per branch, so each lands in the
 * super admin's first branch — the one their bell shows by default.
 */
export async function notifySuperAdmins(
  prisma: PrismaService,
  notifications: NotificationsService,
  payload: NotifyPayload,
) {
  const emails = [...superAdminEmails()];
  const admins = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { isSuperAdmin: true },
        ...(emails.length
          ? [{ email: { in: emails, mode: 'insensitive' as const } }]
          : []),
      ],
    },
    select: { id: true, branches: { select: { branchId: true }, take: 1 } },
  });
  for (const a of admins) {
    const branchId = a.branches[0]?.branchId;
    if (branchId) await notifications.notifyUser(a.id, branchId, payload);
  }
}
