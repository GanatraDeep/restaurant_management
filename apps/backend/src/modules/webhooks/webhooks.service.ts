import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { openSecret, sealSecret } from '../../auth/totp';
import { PrismaService } from '../../prisma/prisma.service';
import { netOptionsFromEnv, resolveWebhookTarget } from './net-guard';
import { postToTarget } from './http-post';
import { BACKOFF_MS, MAX_ATTEMPTS, signPayload } from './signing';
import {
  WEBHOOK_EVENTS,
  WEBHOOK_PHONE_FIELDS,
  WEBHOOK_RESERVED_HEADERS,
  WEBHOOK_SAMPLE_DATA,
  renderWebhookTemplate,
  type WebhookEnvelope,
  type WebhookEvent,
} from '@nodedr-restaurant/types';

export { WEBHOOK_EVENTS };
export type { WebhookEvent };

export interface WebhookHeader {
  name: string;
  value: string;
}

export interface WebhookEndpointDto {
  url: string;
  events: string[];
  description?: string;
  /** JSON body template; null/'' = standard envelope. */
  payloadTemplate?: string | null;
  /** Full list of extra headers. A header sent with an empty value keeps its saved value. */
  headers?: WebhookHeader[];
}

const MAX_TEMPLATE = 10_000;
const HEADER_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

const TIMEOUT_MS = 8000;
const BATCH = 20;
const CLAIM_MS = 2 * 60_000;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get keyMaterial() {
    return (
      this.config.get<string>('WEBHOOK_KEY') ??
      this.config.getOrThrow<string>('JWT_SECRET')
    );
  }

  // --- Emitting ------------------------------------------------------------

  /**
   * Queues the event for every active endpoint subscribed to it. Never
   * throws: a webhook problem must not fail the order or booking that
   * triggered it.
   */
  async emitForBranch(branchId: string, event: WebhookEvent, data: unknown) {
    try {
      const branch = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { restaurantId: true, name: true, restaurant: { select: { name: true } } },
      });
      if (!branch) return;
      await this.emit(branch.restaurantId, event, {
        branchId,
        branchName: branch.name,
        restaurantName: branch.restaurant.name,
        ...(data as object),
      });
    } catch (err) {
      this.logger.warn(`emit ${event} failed: ${String(err)}`);
    }
  }

  /** Is anything listening for this event? Lets callers fail early and clearly. */
  async hasSubscriber(branchId: string, event: WebhookEvent) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { restaurantId: true },
    });
    if (!branch) return false;
    const n = await this.prisma.webhookEndpoint.count({
      where: {
        restaurantId: branch.restaurantId,
        isActive: true,
        events: { has: event },
      },
    });
    return n > 0;
  }

  async emit(restaurantId: string, event: WebhookEvent, data: object) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { restaurantId, isActive: true, events: { has: event } },
      select: { id: true },
    });
    if (endpoints.length === 0) return;
    const payload = {
      event,
      createdAt: new Date().toISOString(),
      data,
    } as Prisma.InputJsonValue;
    await this.prisma.webhookDelivery.createMany({
      data: endpoints.map((e) => ({ endpointId: e.id, event, payload })),
    });
  }

  // --- Endpoint management -------------------------------------------------

  list(restaurantId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { restaurantId },
      select: {
        id: true,
        url: true,
        events: true,
        description: true,
        isActive: true,
        createdAt: true,
        payloadTemplate: true,
        headerNames: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(restaurantId: string, dto: WebhookEndpointDto) {
    const events = this.validateEvents(dto.events);
    await this.assertUrl(dto.url);
    const payloadTemplate = this.validateTemplate(dto.payloadTemplate, events);
    const headers = this.mergeHeaders(dto.headers ?? [], []);
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const row = await this.prisma.webhookEndpoint.create({
      data: {
        restaurantId,
        url: dto.url,
        events,
        description: dto.description,
        secret: sealSecret(secret, this.keyMaterial),
        payloadTemplate,
        ...this.headerData(headers),
      },
      select: {
        id: true,
        url: true,
        events: true,
        description: true,
        isActive: true,
        payloadTemplate: true,
        headerNames: true,
      },
    });
    // The signing secret is returned here and never again.
    return { ...row, secret };
  }

  async update(restaurantId: string, id: string, dto: WebhookEndpointDto) {
    const existing = await this.get(restaurantId, id);
    const events = this.validateEvents(dto.events);
    if (dto.url !== existing.url) await this.assertUrl(dto.url);
    const payloadTemplate = this.validateTemplate(dto.payloadTemplate, events);
    const headers = dto.headers
      ? this.mergeHeaders(dto.headers, this.openHeaders(existing.headers))
      : this.openHeaders(existing.headers);
    return this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        url: dto.url,
        events,
        description: dto.description ?? null,
        payloadTemplate,
        ...this.headerData(headers),
      },
      select: {
        id: true,
        url: true,
        events: true,
        description: true,
        isActive: true,
        payloadTemplate: true,
        headerNames: true,
      },
    });
  }

  /** A template must be JSON that renders for every chosen event's sample data. */
  private validateTemplate(template: string | null | undefined, events: string[]) {
    const t = template?.trim();
    if (!t) return null;
    if (t.length > MAX_TEMPLATE)
      throw new BadRequestException('The custom body is too long (max 10,000 characters)');
    for (const event of events) {
      try {
        renderWebhookTemplate(t, this.sampleEnvelope(event));
      } catch (err) {
        throw new BadRequestException(err instanceof Error ? err.message : 'Invalid body template');
      }
    }
    return t;
  }

  private sampleEnvelope(event: string, phone?: string): WebhookEnvelope {
    const data: Record<string, unknown> = {
      ...(WEBHOOK_SAMPLE_DATA[event as WebhookEvent] ?? { message: 'Hello from F Cartel' }),
    };
    if (phone) for (const f of WEBHOOK_PHONE_FIELDS) if (f in data) data[f] = phone;
    return { event, createdAt: new Date().toISOString(), data };
  }

  /** Validates the new list; an empty value keeps the value already saved under that name. */
  private mergeHeaders(next: WebhookHeader[], saved: WebhookHeader[]): WebhookHeader[] {
    if (next.length > 10) throw new BadRequestException('At most 10 custom headers');
    const seen = new Set<string>();
    const out: WebhookHeader[] = [];
    for (const h of next) {
      const name = h.name.trim();
      if (!name && !h.value) continue;
      if (!HEADER_NAME.test(name))
        throw new BadRequestException(`"${name}" is not a valid header name`);
      const lower = name.toLowerCase();
      if (WEBHOOK_RESERVED_HEADERS.includes(lower) || lower.startsWith('x-fcartel-'))
        throw new BadRequestException(`The header "${name}" is set by F Cartel and can't be changed`);
      if (seen.has(lower)) throw new BadRequestException(`"${name}" is listed twice`);
      seen.add(lower);
      const value = h.value
        ? h.value
        : (saved.find((s) => s.name.toLowerCase() === lower)?.value ?? '');
      if (!value) throw new BadRequestException(`Enter a value for the "${name}" header`);
      if (value.length > 2000 || /[\r\n]/.test(value))
        throw new BadRequestException(`The "${name}" header value is not valid`);
      out.push({ name, value });
    }
    return out;
  }

  private headerData(headers: WebhookHeader[]) {
    return {
      headers: headers.length ? sealSecret(JSON.stringify(headers), this.keyMaterial) : null,
      headerNames: headers.map((h) => h.name),
    };
  }

  private openHeaders(sealed: string | null): WebhookHeader[] {
    if (!sealed) return [];
    try {
      return JSON.parse(openSecret(sealed, this.keyMaterial)) as WebhookHeader[];
    } catch {
      return [];
    }
  }

  /** The exact body a delivery sends: the custom template, or the standard envelope. */
  buildBody(template: string | null, payload: unknown, deliveryId: string) {
    if (!template) return JSON.stringify(payload);
    return renderWebhookTemplate(template, { ...(payload as WebhookEnvelope), deliveryId });
  }

  private validateEvents(events: string[]) {
    const unknown = events.filter(
      (e) => !(WEBHOOK_EVENTS as readonly string[]).includes(e),
    );
    if (events.length === 0 || unknown.length > 0)
      throw new BadRequestException(
        unknown.length
          ? `Unknown event: ${unknown.join(', ')}`
          : 'Choose at least one event',
      );
    return [...new Set(events)];
  }

  private async assertUrl(url: string) {
    try {
      await resolveWebhookTarget(url, netOptionsFromEnv());
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Invalid URL',
      );
    }
  }

  private async get(restaurantId: string, id: string) {
    const e = await this.prisma.webhookEndpoint.findFirst({
      where: { id, restaurantId },
    });
    if (!e) throw new NotFoundException('Webhook not found');
    return e;
  }

  async setActive(restaurantId: string, id: string, isActive: boolean) {
    await this.get(restaurantId, id);
    await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { isActive },
    });
    return { ok: true };
  }

  async remove(restaurantId: string, id: string) {
    await this.get(restaurantId, id);
    await this.prisma.webhookEndpoint.delete({ where: { id } });
    return { ok: true };
  }

  async deliveries(restaurantId: string, id: string) {
    await this.get(restaurantId, id);
    return this.prisma.webhookDelivery.findMany({
      where: { endpointId: id },
      select: {
        id: true,
        event: true,
        status: true,
        attempts: true,
        lastStatusCode: true,
        lastError: true,
        createdAt: true,
        deliveredAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Sends one event's sample data right now so the receiver can be checked.
   * `phone` replaces the sample's customer number, so a WhatsApp test reaches you.
   */
  async sendTest(restaurantId: string, id: string, opts: { event?: string; phone?: string } = {}) {
    const e = await this.get(restaurantId, id);
    const event = opts.event && e.events.includes(opts.event) ? opts.event : e.events[0];
    const envelope = this.sampleEnvelope(event, opts.phone?.replace(/[^\d+]/g, '') || undefined);
    const row = await this.prisma.webhookDelivery.create({
      data: {
        endpointId: e.id,
        event: 'test',
        payload: { ...envelope, test: true } as Prisma.InputJsonValue,
      },
    });
    await this.attempt(row.id);
    const result = await this.prisma.webhookDelivery.findUniqueOrThrow({
      where: { id: row.id },
      select: {
        status: true,
        attempts: true,
        lastStatusCode: true,
        lastError: true,
      },
    });
    let body: string | null = null;
    try {
      body = this.buildBody(e.payloadTemplate, { ...envelope, test: true }, row.id);
    } catch {
      body = null;
    }
    // A test is a one-off: don't keep retrying it in the background.
    if (result.status === 'PENDING')
      await this.prisma.webhookDelivery.update({ where: { id: row.id }, data: { status: 'FAILED' } });
    return { ...result, status: result.status === 'PENDING' ? 'FAILED' : result.status, event, body };
  }

  // --- Delivery worker -----------------------------------------------------

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tick() {
    try {
      const due = await this.prisma.webhookDelivery.findMany({
        where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
        select: { id: true },
        orderBy: { nextAttemptAt: 'asc' },
        take: BATCH,
      });
      await Promise.all(due.map((d) => this.attempt(d.id)));
    } catch (err) {
      this.logger.error(`webhook tick failed: ${String(err)}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanup() {
    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    await this.prisma.webhookDelivery.deleteMany({
      where: { status: { not: 'PENDING' }, createdAt: { lt: cutoff } },
    });
  }

  /** One delivery attempt. Claims the row first so overlapping ticks never double-send. */
  async attempt(deliveryId: string) {
    const claimed = await this.prisma.webhookDelivery.updateMany({
      where: {
        id: deliveryId,
        status: 'PENDING',
        nextAttemptAt: { lte: new Date() },
      },
      data: {
        nextAttemptAt: new Date(Date.now() + CLAIM_MS),
        attempts: { increment: 1 },
      },
    });
    if (claimed.count === 0) return;

    const d = await this.prisma.webhookDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
      include: { endpoint: true },
    });
    let statusCode: number | null = null;
    let error: string | null = null;
    try {
      const body = this.buildBody(d.endpoint.payloadTemplate, d.payload, d.id);
      if (!d.endpoint.isActive && d.event !== 'test')
        throw new Error('Endpoint is disabled');
      const secret = openSecret(d.endpoint.secret, this.keyMaterial);
      // Re-resolve and re-check on every attempt (the address pinned for
      // this request cannot change between check and connect).
      const target = await resolveWebhookTarget(
        d.endpoint.url,
        netOptionsFromEnv(),
      );
      const signature = signPayload(secret, body, Math.floor(Date.now() / 1000));
      statusCode = await postToTarget(target, body, TIMEOUT_MS, {
        // The restaurant's own headers first, so ours can never be overridden.
        ...Object.fromEntries(this.openHeaders(d.endpoint.headers).map((h) => [h.name, h.value])),
        'X-FCartel-Event': d.event,
        'X-FCartel-Delivery': d.id,
        'X-FCartel-Signature': signature,
        // Same values under the old names, for receivers set up before the rename.
        'X-OrderRestro-Event': d.event,
        'X-OrderRestro-Delivery': d.id,
        'X-OrderRestro-Signature': signature,
      });
      if (statusCode < 200 || statusCode >= 300)
        error = `Receiver answered HTTP ${statusCode}`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    if (!error) {
      await this.prisma.webhookDelivery.update({
        where: { id: d.id },
        data: {
          status: 'SUCCESS',
          lastStatusCode: statusCode,
          lastError: null,
          deliveredAt: new Date(),
        },
      });
      return;
    }
    const exhausted = d.attempts >= MAX_ATTEMPTS;
    await this.prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        status: exhausted ? 'FAILED' : 'PENDING',
        lastStatusCode: statusCode,
        lastError: error.slice(0, 300),
        nextAttemptAt: new Date(
          Date.now() + (BACKOFF_MS[d.attempts - 1] ?? BACKOFF_MS.at(-1)!),
        ),
      },
    });
  }
}
