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

export type OtpPurpose = 'signup' | 'login' | 'reset';

const hashCode = (
  phone: string,
  code: string,
  purpose: OtpPurpose = 'signup',
) => createHash('sha256').update(`${purpose}:${phone}:${code}`).digest('hex');

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

  async send(phone: string, name?: string, purpose: OtpPurpose = 'signup') {
    if (!this.required()) return { required: false as const };
    const { code, id } = await this.issue(phone, purpose);
    const r = await this.whatsapp.sendText(
      phone,
      purpose === 'login'
        ? `Hello${name ? ` ${name}` : ''},\n\nYour F Cartel sign-in code is:\n\n${code}\n\nIt expires in 10 minutes. Never share it — F Cartel staff will never ask for it.`
        : purpose === 'reset'
          ? `Hello${name ? ` ${name}` : ''},\n\nYour F Cartel password reset code is:\n\n${code}\n\nIt expires in 10 minutes. If you didn't ask to reset your password, ignore this message.`
          : `Hello${name ? ` ${name}` : ''},\n\nYour F Cartel verification code is:\n\n${code}\n\nIt expires in 10 minutes. Do not share it with anyone.`,
    );
    if (!r.ok) {
      // A failed send doesn't count against the resend wait.
      await this.discard(id);
      throw new ServiceUnavailableException(
        'Could not send the WhatsApp code — check the number is on WhatsApp and try again',
      );
    }
    return {
      required: true as const,
      resendAfterSeconds: RESEND_AFTER_MS / 1000,
    };
  }

  /** Drops a code that could not be delivered. */
  discard(id: string) {
    return this.prisma.signupOtp
      .delete({ where: { id } })
      .catch(() => undefined);
  }

  /**
   * A new code for `key` (a phone number, or e.g. "user:<id>"), with the
   * resend wait and hourly cap. The caller delivers it.
   */
  async issue(key: string, purpose: OtpPurpose) {
    const phone = key;
    const recent = await this.prisma.signupOtp.findMany({
      where: {
        phone,
        purpose,
        createdAt: { gt: new Date(Date.now() - 3_600_000) },
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
        'Too many codes requested for this number — try again in an hour',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otp = await this.prisma.signupOtp.create({
      data: {
        phone,
        purpose,
        codeHash: hashCode(phone, code, purpose),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    return { code, id: otp.id };
  }

  /** Throws unless `code` is the latest live code for `phone`; then uses it up. */
  async consume(
    phone: string,
    code: string | undefined,
    purpose: OtpPurpose = 'signup',
    /** Password reset: always needs the code, even without WhatsApp. */
    strict = false,
  ) {
    if (!strict && !this.required()) return;
    if (!code) {
      throw new BadRequestException(
        'Enter the 6-digit code sent to your WhatsApp',
      );
    }
    const otp = await this.prisma.signupOtp.findFirst({
      where: { phone, purpose },
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
      Buffer.from(hashCode(phone, code, purpose)),
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
    await this.prisma.signupOtp.deleteMany({ where: { phone, purpose } });
  }
}
