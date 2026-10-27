import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AggregatorStatus } from '@nodedr-restaurant/types';
import { openSecret } from '../../auth/totp';
import { PrismaService } from '../../prisma/prisma.service';
import { postToTarget } from '../webhooks/http-post';
import { netOptionsFromEnv, resolveWebhookTarget } from '../webhooks/net-guard';
import { signPayload } from '../webhooks/signing';

const TIMEOUT_MS = 8000;

// Kitchen ticket progress → what the marketplace is told.
export const KOT_TO_AGGREGATOR_STATUS: Partial<
  Record<string, AggregatorStatus>
> = {
  PREPARING: 'PREPARING',
  READY: 'READY',
  SERVED: 'HANDED_OVER',
};

/**
 * Pushes Zomato / Swiggy order status changes (accepted, rejected, food
 * ready, handed to the rider, cancelled) to the connection's status
 * callback URL. Called fire-and-forget from OrdersService: it never throws,
 * and does nothing for orders that didn't come from a marketplace.
 */
@Injectable()
export class AggregatorStatusService {
  private readonly logger = new Logger(AggregatorStatusService.name);

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

  async push(orderId: string, status: AggregatorStatus): Promise<void> {
    try {
      const agg = await this.prisma.aggregatorOrder.findUnique({
        where: { orderId },
        include: { connection: true },
      });
      // Several kitchen tickets reaching READY should only be reported once.
      if (!agg || agg.lastStatusSent === status) return;

      const { connection } = agg;
      let error: string | null = null;
      if (connection.statusCallbackUrl) {
        const body = JSON.stringify({
          provider: connection.provider,
          outletId: connection.outletId,
          externalOrderId: agg.externalOrderId,
          orderId,
          status,
          at: new Date().toISOString(),
        });
        try {
          const target = await resolveWebhookTarget(
            connection.statusCallbackUrl,
            netOptionsFromEnv(),
          );
          const secret = openSecret(connection.webhookSecret, this.keyMaterial);
          const headers: Record<string, string> = {
            'X-FCartel-Signature': signPayload(
              secret,
              body,
              Math.floor(Date.now() / 1000),
            ),
          };
          if (connection.apiKey) {
            headers.Authorization = `Bearer ${openSecret(connection.apiKey, this.keyMaterial)}`;
          }
          const code = await postToTarget(target, body, TIMEOUT_MS, headers);
          if (code < 200 || code >= 300)
            error = `Marketplace answered HTTP ${code}`;
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        }
      }
      await this.prisma.aggregatorOrder.update({
        where: { id: agg.id },
        data: {
          lastStatusSent: status,
          lastSyncError: error?.slice(0, 300) ?? null,
        },
      });
      if (error) {
        await this.prisma.aggregatorConnection.update({
          where: { id: connection.id },
          data: {
            lastError: `Status update failed: ${error}`.slice(0, 300),
            lastErrorAt: new Date(),
          },
        });
      }
    } catch (err) {
      this.logger.warn(`aggregator status push failed: ${String(err)}`);
    }
  }
}
