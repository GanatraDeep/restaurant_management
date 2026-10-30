import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_MS = 30 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const GUEST_TOKEN_TTL = '90d';

export interface GuestClaims {
  typ: 'guest';
  branchId: string;
  customerId: string;
  name: string;
  phone: string;
}

const hashCode = (branchId: string, phone: string, code: string) =>
  createHash('sha256').update(`${branchId}:${phone}:${code}`).digest('hex');

/**
 * Phone verification for the table-QR page. A number is verified once per
 * branch with a WhatsApp OTP; after that the guest just types it. Either way
 * the guest gets a signed token that the order endpoints require, carrying
 * their customer record, name and number.
 */
@Injectable()
export class GuestVerificationService {
  private readonly logger = new Logger(GuestVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** The WhatsApp sender, or null when it isn't configured (OTP is skipped). */
  private whatsapp() {
    const url = this.config.get<string>('WHATSAPP_API_URL');
    const session = this.config.get<string>('WHATSAPP_SESSION_NAME');
    return url && session ? { url, session } : null;
  }

  async start(
    branchId: string,
    restaurantName: string,
    name: string,
    phone: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { branchId, phone },
      orderBy: { createdAt: 'asc' },
    });
    const sender = this.whatsapp();
    // Seen and verified before (or OTP not set up on this server): no code.
    if (customer?.phoneVerifiedAt || !sender) {
      return {
        verified: true as const,
        guestToken: await this.issue(branchId, name, phone),
      };
    }

    const recent = await this.prisma.guestOtp.findMany({
      where: {
        branchId,
        phone,
        createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (
      recent[0] &&
      Date.now() - recent[0].createdAt.getTime() < RESEND_AFTER_MS
    ) {
      throw new HttpException(
        'Please wait a few seconds before asking for another code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (recent.length >= MAX_SENDS_PER_HOUR) {
      throw new HttpException(
        'Too many codes requested for this number — please ask the staff to take your order',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otp = await this.prisma.guestOtp.create({
      data: {
        branchId,
        phone,
        name,
        codeHash: hashCode(branchId, phone, code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    // A failed send doesn't count against the resend wait.
    await this.send(
      sender,
      phone,
      `Hello ${name},\n\nFor ordering at ${restaurantName}, please find the OTP below to be verified. \n\n${code}`,
    ).catch(async (err: unknown) => {
      await this.prisma.guestOtp
        .delete({ where: { id: otp.id } })
        .catch(() => undefined);
      throw err;
    });
    return {
      verified: false as const,
      resendAfterSeconds: RESEND_AFTER_MS / 1000,
    };
  }

  async check(branchId: string, phone: string, code: string) {
    const otp = await this.prisma.guestOtp.findFirst({
      where: { branchId, phone },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt < new Date()) {
      throw new BadRequestException(
        'That code has expired — tap Resend for a new one',
      );
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Too many wrong tries — tap Resend for a new code',
      );
    }
    const given = Buffer.from(hashCode(branchId, phone, code));
    const want = Buffer.from(otp.codeHash);
    if (!timingSafeEqual(given, want)) {
      await this.prisma.guestOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(
        'That code is not right — check the WhatsApp message and try again',
      );
    }
    await this.prisma.guestOtp.deleteMany({ where: { branchId, phone } });
    return { guestToken: await this.issue(branchId, otp.name, phone, true) };
  }

  /** Finds or creates the guest's customer record and signs their token. */
  private async issue(
    branchId: string,
    name: string,
    phone: string,
    justVerified = false,
  ) {
    const existing = await this.prisma.customer.findFirst({
      where: { branchId, phone },
      orderBy: { createdAt: 'asc' },
    });
    const customer = existing
      ? await this.prisma.customer.update({
          where: { id: existing.id },
          data: {
            ...(existing.name ? {} : { name }),
            ...(justVerified ? { phoneVerifiedAt: new Date() } : {}),
          },
        })
      : await this.prisma.customer.create({
          data: {
            branchId,
            name,
            phone,
            ...(justVerified ? { phoneVerifiedAt: new Date() } : {}),
          },
        });
    const claims: GuestClaims = {
      typ: 'guest',
      branchId,
      customerId: customer.id,
      name,
      phone,
    };
    return this.jwt.signAsync(claims, { expiresIn: GUEST_TOKEN_TTL });
  }

  /** Checks a guest token belongs to this branch; returns who it is. */
  async verify(token: string, branchId: string): Promise<GuestClaims> {
    let claims: GuestClaims;
    try {
      claims = await this.jwt.verifyAsync<GuestClaims>(token);
    } catch {
      throw new UnauthorizedException(
        'Please confirm your name and number again',
      );
    }
    if (claims.typ !== 'guest' || claims.branchId !== branchId) {
      throw new UnauthorizedException(
        'Please confirm your name and number again',
      );
    }
    return claims;
  }

  private async send(
    sender: { url: string; session: string },
    number: string,
    message: string,
  ) {
    try {
      const res = await fetch(sender.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionName: sender.session,
          type: 'text',
          number,
          message,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok)
        throw new Error(
          `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
        );
    } catch (err) {
      this.logger.warn(
        `WhatsApp OTP to ${number.slice(0, 2)}******${number.slice(-2)} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException(
        'Could not send the WhatsApp code right now — please try again, or ask the staff to take your order',
      );
    }
  }
}
