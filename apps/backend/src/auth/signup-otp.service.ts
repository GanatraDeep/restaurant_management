import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { WhatsAppService } from '../common/whatsapp/whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_MS = 30 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

const hashCode = (phone: string, code: string) =>
  createHash('sha256').update(`signup:${phone}:${code}`).digest('hex');

/**
 * Verifies a new restaurant owner's WhatsApp number before the account is
 * created: a 6-digit code goes to that number, and registering needs it.
 * On a server without WhatsApp set up there is nothing to send, so the step
 * is skipped (same rule as the guest QR sign-in).
 */
@Injectable()
export class SignupOtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  /** Whether registering needs a code on this server. */
  required(): boolean {
    return !!this.whatsapp.settings();
  }

  async send(phone: string, name?: string) {
    if (!this.required()) return { required: false as const };
    const recent = await this.prisma.signupOtp.findMany({
      where: { phone, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
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
        'Too many codes requested for this number — try again in an hour',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otp = await this.prisma.signupOtp.create({
      data: {
        phone,
        codeHash: hashCode(phone, code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    const r = await this.whatsapp.sendText(
      phone,
      `Hello${name ? ` ${name}` : ''},\n\nYour Annapurna verification code is:\n\n${code}\n\nIt expires in 10 minutes. Do not share it with anyone.`,
    );
    if (!r.ok) {
      // A failed send doesn't count against the resend wait.
      await this.prisma.signupOtp
        .delete({ where: { id: otp.id } })
        .catch(() => undefined);
      throw new ServiceUnavailableException(
        'Could not send the WhatsApp code — check the number is on WhatsApp and try again',
      );
    }
    return {
      required: true as const,
      resendAfterSeconds: RESEND_AFTER_MS / 1000,
    };
  }

  /** Throws unless `code` is the latest live code for `phone`; then uses it up. */
  async consume(phone: string, code: string | undefined) {
    if (!this.required()) return;
    if (!code) {
      throw new BadRequestException(
        'Enter the 6-digit code sent to your WhatsApp',
      );
    }
    const otp = await this.prisma.signupOtp.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt < new Date()) {
      throw new BadRequestException(
        'That code has expired — tap Resend code for a new one',
      );
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Too many wrong tries — tap Resend code for a new one',
      );
    }
    const ok = timingSafeEqual(
      Buffer.from(hashCode(phone, code)),
      Buffer.from(otp.codeHash),
    );
    if (!ok) {
      await this.prisma.signupOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(
        'That code is not right — check the WhatsApp message and try again',
      );
    }
    await this.prisma.signupOtp.deleteMany({ where: { phone } });
  }
}
