import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  releaseAnnounceSchema,
  RELEASE_TAG_RE,
  type ReleaseAnnounceDto,
} from '@nodedr-restaurant/types';
import { notifySuperAdmins } from '../../common/notify-super-admins';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { verifySignature } from '../webhooks/signing';
import {
  updaterConfigured,
  updaterDeploy,
  updaterStatus,
  type UpdaterStatus,
} from './updater-client';

// A deploy that has been "in progress" this long without the new version
// coming up is treated as stuck, so it can't block the next one forever.
const STALE_DEPLOY_MS = 20 * 60_000;

export function currentVersion(): string {
  return process.env.APP_VERSION || 'dev';
}

@Injectable()
export class ReleasesService implements OnModuleInit {
  private readonly logger = new Logger(ReleasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // A deploy replaces this very process: the new version records its own
  // success when it boots; a restored old version records the failure.
  async onModuleInit() {
    await this.reconcile().catch((err) =>
      this.logger.warn(`release reconcile failed: ${String(err)}`),
    );
  }

  /** Brings release rows in line with what is actually running. */
  async reconcile(status?: UpdaterStatus | null) {
    const current = currentVersion();
    if (RELEASE_TAG_RE.test(current)) {
      await this.prisma.appRelease.upsert({
        where: { tag: current },
        create: { tag: current, status: 'DEPLOYED', deployedAt: new Date() },
        update: {},
      });
      await this.prisma.appRelease.updateMany({
        where: {
          tag: current,
          status: { in: ['AVAILABLE', 'DEPLOYING', 'FAILED'] },
        },
        data: { status: 'DEPLOYED', deployedAt: new Date(), error: null },
      });
    }

    const deploying = await this.prisma.appRelease.findMany({
      where: { status: 'DEPLOYING', tag: { not: current } },
    });
    if (deploying.length === 0) return;
    const s =
      status !== undefined
        ? status
        : updaterConfigured()
          ? await updaterStatus().catch(() => null)
          : null;
    for (const r of deploying) {
      const stale =
        r.decidedAt && Date.now() - r.decidedAt.getTime() > STALE_DEPLOY_MS;
      if (s?.version === r.tag && s.state === 'error') {
        await this.prisma.appRelease.update({
          where: { id: r.id },
          data: { status: 'FAILED', error: s.error ?? 'Deploy failed' },
        });
      } else if (stale) {
        await this.prisma.appRelease.update({
          where: { id: r.id },
          data: {
            status: 'FAILED',
            error:
              'Deploy did not finish — the previous version is still running',
          },
        });
      }
    }
  }

  async overview() {
    const configured = updaterConfigured();
    const status = configured ? await updaterStatus().catch(() => null) : null;
    await this.reconcile(status);
    const releases = await this.prisma.appRelease.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      currentVersion: currentVersion(),
      updaterConfigured: configured,
      updaterReachable: configured ? status !== null : false,
      updater: status,
      releases,
    };
  }

  /** CI → server: a new image was published. Signed with RELEASE_WEBHOOK_SECRET. */
  async announce(rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = process.env.RELEASE_WEBHOOK_SECRET ?? '';
    const body = rawBody?.toString('utf8') ?? '';
    if (!secret || !signature || !verifySignature(secret, body, signature)) {
      throw new UnauthorizedException('Invalid signature');
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new BadRequestException('Body must be JSON');
    }
    const parsed = releaseAnnounceSchema.safeParse(json);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid release',
        issues: parsed.error.issues,
      });
    }
    return this.record(parsed.data, true);
  }

  /** Super admin adds a published tag by hand (e.g. CI couldn't reach the server). */
  addManually(dto: ReleaseAnnounceDto) {
    return this.record(dto, false);
  }

  private async record(dto: ReleaseAnnounceDto, notify: boolean) {
    const existing = await this.prisma.appRelease.findUnique({
      where: { tag: dto.tag },
    });
    const release = await this.prisma.appRelease.upsert({
      where: { tag: dto.tag },
      create: { ...dto },
      update: {
        commitSha: dto.commitSha ?? undefined,
        message: dto.message ?? undefined,
        author: dto.author ?? undefined,
        url: dto.url ?? undefined,
      },
    });
    if (!existing && notify && dto.tag !== currentVersion()) {
      await this.notifySuperAdmins(dto).catch((err) =>
        this.logger.warn(`release notification failed: ${String(err)}`),
      );
    }
    return release;
  }

  private async notifySuperAdmins(dto: ReleaseAnnounceDto) {
    const firstLine = dto.message?.split('\n')[0]?.slice(0, 140);
    await notifySuperAdmins(this.prisma, this.notifications, {
      type: 'release.available',
      title: 'New F Cartel version ready to deploy',
      body: `${dto.tag}${firstLine ? ` — ${firstLine}` : ''}. Review it in Admin → Releases.`,
    });
  }

  async deploy(id: string, userId: string) {
    if (!updaterConfigured()) {
      throw new ServiceUnavailableException(
        'This server has no updater, so it cannot deploy itself. See deploy/README.md.',
      );
    }
    const release = await this.prisma.appRelease.findUnique({ where: { id } });
    if (!release) throw new NotFoundException('Release not found');
    if (release.tag === currentVersion()) {
      throw new BadRequestException('That version is already running');
    }
    await this.reconcile();
    const busy = await this.prisma.appRelease.findFirst({
      where: { status: 'DEPLOYING' },
    });
    if (busy)
      throw new ConflictException(`${busy.tag} is still being deployed`);

    await this.prisma.appRelease.update({
      where: { id },
      data: {
        status: 'DEPLOYING',
        decidedById: userId,
        decidedAt: new Date(),
        error: null,
      },
    });
    try {
      await updaterDeploy(release.tag);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.appRelease.update({
        where: { id },
        data: { status: 'FAILED', error: message },
      });
      throw new ServiceUnavailableException(
        `Could not start the deploy: ${message}`,
      );
    }
    return { started: true, tag: release.tag };
  }

  async skip(id: string, userId: string) {
    const release = await this.prisma.appRelease.findUnique({ where: { id } });
    if (!release) throw new NotFoundException('Release not found');
    if (release.status !== 'AVAILABLE' && release.status !== 'FAILED') {
      throw new BadRequestException(
        'Only a waiting or failed release can be skipped',
      );
    }
    return this.prisma.appRelease.update({
      where: { id },
      data: { status: 'SKIPPED', decidedById: userId, decidedAt: new Date() },
    });
  }
}
