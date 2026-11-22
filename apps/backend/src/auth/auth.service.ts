import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  STAFF_ROLES,
  type LoginDto,
  type PinLoginDto,
  type RegisterDto,
  type SessionUser,
} from '@nodedr-restaurant/types';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { TwoFactorService } from './two-factor.service';
import { SignupOtpService } from './signup-otp.service';
import { isRootAdminUser, isSuperAdminUser } from '../common/super-admin';

/** How long "Remember me" keeps someone signed in on that device. */
export const REMEMBER_ME_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly twoFactor: TwoFactorService,
    private readonly signupOtp: SignupOtpService,
  ) {}

  private toSessionUser(user: {
    id: string;
    restaurantId: string;
    name: string;
    roleId: string;
    email?: string | null;
    isSuperAdmin?: boolean;
    role: { name: string; permissions: { permission: { key: string } }[] };
  }): SessionUser {
    return {
      id: user.id,
      restaurantId: user.restaurantId,
      name: user.name,
      roleId: user.roleId,
      roleName: user.role.name,
      permissions: user.role.permissions.map((rp) => rp.permission.key),
      isSuperAdmin: isSuperAdminUser(user),
      isRootAdmin: isRootAdminUser(user),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, isActive: true },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Only asked for after the password is right, so the response never
    // reveals which emails exist or which accounts use two-factor.
    if (user.twoFactorEnabled) {
      await this.twoFactor.verifyLogin(user, dto.totp);
    }

    return this.issueSession(user, dto.rememberMe);
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (existing) {
      throw new BadRequestException(
        'An account with this email already exists',
      );
    }
    const phoneTaken = await this.prisma.user.findFirst({
      where: { phone: dto.phone, role: { name: 'OWNER' } },
      select: { id: true },
    });
    if (phoneTaken) {
      throw new BadRequestException(
        'A restaurant is already registered with this mobile number — sign in instead',
      );
    }
    // The owner's WhatsApp number must be theirs (skipped when WhatsApp
    // isn't set up on this server).
    await this.signupOtp.consume(dto.phone, dto.otpCode);

    // Permissions are global, not per-tenant — upsert (idempotent) outside
    // the transaction below rather than re-creating them per restaurant.
    for (const permission of PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { key: permission.key },
        update: {},
        create: permission,
      });
    }
    const allPermissions = await this.prisma.permission.findMany();
    const permissionByKey = new Map(allPermissions.map((p) => [p.key, p]));

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const owner = await this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: { name: dto.restaurantName },
      });
      const branch = await tx.branch.create({
        // The verified number doubles as the branch's phone on bills.
        data: {
          restaurantId: restaurant.id,
          name: dto.branchName,
          phone: dto.phone,
        },
      });

      let ownerRoleId = '';
      for (const roleName of STAFF_ROLES) {
        const role = await tx.role.create({
          data: {
            restaurantId: restaurant.id,
            name: roleName,
            label: roleName.replace(/_/g, ' '),
          },
        });
        if (roleName === 'OWNER') ownerRoleId = role.id;

        const grantedKeys = DEFAULT_ROLE_PERMISSIONS[roleName];
        await tx.rolePermission.createMany({
          data: grantedKeys
            .map((key) => permissionByKey.get(key))
            .filter((p): p is NonNullable<typeof p> => Boolean(p))
            .map((permission) => ({
              roleId: role.id,
              permissionId: permission.id,
            })),
        });
      }

      const user = await tx.user.create({
        data: {
          restaurantId: restaurant.id,
          roleId: ownerRoleId,
          name: dto.ownerName,
          email: dto.email,
          phone: dto.phone,
          passwordHash,
        },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      });

      await tx.userBranch.create({
        data: { userId: user.id, branchId: branch.id },
      });

      return user;
    });

    return this.issueSession(owner);
  }

  // ─── WhatsApp OTP sign-in ────────────────────────────────────────────────

  /** Whether this server can send WhatsApp codes (the login page shows the option only then). */
  loginOtpAvailable(): boolean {
    return this.signupOtp.required();
  }

  private normalisePhone(phone: string) {
    const d = phone.replace(/\D/g, '');
    return d.replace(/^(91|0)(?=\d{10}$)/, '');
  }

  /** Active accounts whose saved mobile is this number (any format saved). */
  private async usersByPhone(phone: string) {
    const norm = this.normalisePhone(phone);
    if (norm.length < 10) return { norm, users: [] };
    const candidates = await this.prisma.user.findMany({
      where: { isActive: true, phone: { endsWith: norm.slice(-10) } },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
    return {
      norm,
      users: candidates.filter(
        (u) => this.normalisePhone(u.phone ?? '') === norm,
      ),
    };
  }

  async sendLoginOtp(phone: string) {
    if (!this.loginOtpAvailable()) {
      throw new ServiceUnavailableException(
        'WhatsApp sign-in is not set up on this server — use your email and password',
      );
    }
    const { norm, users } = await this.usersByPhone(phone);
    if (users.length === 0) {
      throw new BadRequestException(
        'No account uses this mobile number. Sign in with your email, or ask your manager to add your number to your staff profile.',
      );
    }
    return this.signupOtp.send(
      norm,
      users.length === 1 ? users[0].name : undefined,
      'login',
    );
  }

  async verifyLoginOtp(dto: {
    phone: string;
    code: string;
    totp?: string;
    rememberMe?: boolean;
  }) {
    // Never fall back to "no code needed" for sign-in.
    if (!this.loginOtpAvailable()) {
      throw new ServiceUnavailableException(
        'WhatsApp sign-in is not set up on this server — use your email and password',
      );
    }
    const { norm, users } = await this.usersByPhone(dto.phone);
    if (users.length === 0)
      throw new UnauthorizedException('No account uses this mobile number');
    if (users.length > 1) {
      throw new BadRequestException(
        'More than one account uses this number — sign in with your email and password instead',
      );
    }
    const user = users[0];
    // The WhatsApp code proves the phone; an authenticator code is still asked
    // for when switched on — checked first, so asking for it doesn't use up
    // the WhatsApp code.
    if (user.twoFactorEnabled) {
      await this.twoFactor.verifyLogin(user, dto.totp);
    }
    await this.signupOtp.consume(norm, dto.code, 'login');
    return this.issueSession(user, dto.rememberMe);
  }

  sendSignupOtp(phone: string, ownerName?: string) {
    return this.signupOtp.send(phone, ownerName);
  }

  async hasAnyRestaurant(): Promise<boolean> {
    const restaurant = await this.prisma.restaurant.findFirst({
      select: { id: true },
    });
    return restaurant !== null;
  }

  async pinLogin(dto: PinLoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    if (!user || !user.isActive || !user.pinHash) {
      throw new UnauthorizedException('PIN login not available for this user');
    }
    // A 4-8 digit PIN must not be a way around the second factor.
    if (user.twoFactorEnabled) {
      throw new UnauthorizedException(
        'PIN login is off for accounts with two-factor authentication — sign in with your password',
      );
    }

    const valid = await bcrypt.compare(dto.pin, user.pinHash);
    if (!valid) {
      throw new UnauthorizedException('Incorrect PIN');
    }

    return this.issueSession(user);
  }

  private async issueSession(
    user: Parameters<AuthService['toSessionUser']>[0],
    rememberMe = false,
  ) {
    const sessionUser = this.toSessionUser(user);
    const token = await this.jwt.signAsync(
      { sub: user.id },
      rememberMe ? { expiresIn: `${REMEMBER_ME_DAYS}d` } : undefined,
    );
    return { token, user: sessionUser, rememberMe };
  }
}
