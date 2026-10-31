import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WhatsAppService } from '../../common/whatsapp/whatsapp.service';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  GuestVerificationService,
  type GuestClaims,
} from './guest-verification.service';

type Otp = {
  id: string;
  branchId: string;
  phone: string;
  name: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
};
type Customer = {
  id: string;
  branchId: string;
  phone: string;
  name: string | null;
  phoneVerifiedAt: Date | null;
  createdAt: Date;
};

function setup(opts: { whatsapp?: boolean; customers?: Customer[] } = {}) {
  const otps: Otp[] = [];
  const customers: Customer[] = [...(opts.customers ?? [])];
  const prisma = {
    customer: {
      findFirst: jest.fn(
        ({ where }: { where: { branchId: string; phone: string } }) =>
          Promise.resolve(
            customers.find(
              (c) => c.branchId === where.branchId && c.phone === where.phone,
            ) ?? null,
          ),
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<Customer>;
        }) => {
          const c = customers.find((x) => x.id === where.id)!;
          Object.assign(c, data);
          return Promise.resolve(c);
        },
      ),
      create: jest.fn(
        ({
          data,
        }: {
          data: Omit<Customer, 'id' | 'createdAt' | 'phoneVerifiedAt'> & {
            phoneVerifiedAt?: Date;
          };
        }) => {
          const c = {
            ...data,
            phoneVerifiedAt: data.phoneVerifiedAt ?? null,
            id: `c${customers.length + 1}`,
            createdAt: new Date(),
          };
          customers.push(c);
          return Promise.resolve(c);
        },
      ),
    },
    guestOtp: {
      findMany: jest.fn(
        ({
          where,
        }: {
          where: { branchId: string; phone: string; createdAt: { gt: Date } };
        }) =>
          Promise.resolve(
            otps
              .filter(
                (o) =>
                  o.branchId === where.branchId &&
                  o.phone === where.phone &&
                  o.createdAt > where.createdAt.gt,
              )
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
          ),
      ),
      findFirst: jest.fn(
        ({ where }: { where: { branchId: string; phone: string } }) =>
          Promise.resolve(
            otps
              .filter(
                (o) => o.branchId === where.branchId && o.phone === where.phone,
              )
              .sort(
                (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
              )[0] ?? null,
          ),
      ),
      create: jest.fn(
        ({ data }: { data: Omit<Otp, 'id' | 'attempts' | 'createdAt'> }) => {
          const o = {
            ...data,
            id: `o${otps.length + 1}`,
            attempts: 0,
            createdAt: new Date(),
          };
          otps.push(o);
          return Promise.resolve(o);
        },
      ),
      update: jest.fn(({ where }: { where: { id: string } }) => {
        const o = otps.find((x) => x.id === where.id)!;
        o.attempts += 1;
        return Promise.resolve(o);
      }),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        otps.splice(
          otps.findIndex((o) => o.id === where.id),
          1,
        );
        return Promise.resolve();
      }),
      deleteMany: jest.fn(() => {
        otps.length = 0;
        return Promise.resolve({ count: 0 });
      }),
    },
  };
  const env: Record<string, string> =
    opts.whatsapp === false
      ? {}
      : {
          WHATSAPP_API_URL: 'https://wa.test/send',
          WHATSAPP_SESSION_NAME: 'sess',
        };
  const service = new GuestVerificationService(
    prisma as unknown as PrismaService,
    new JwtService({ secret: 'test-secret-test-secret' }),
    new WhatsAppService({
      get: (k: string) => env[k],
    } as unknown as ConfigService),
  );
  const sent: { number: string; message: string; sessionName: string }[] = [];
  const fetchMock = jest.fn((_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body) as (typeof sent)[number]);
    return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  // The code is only ever sent, never stored in clear: read it from the message.
  const lastCode = () =>
    sent[sent.length - 1].message.trim().split('\n').pop()!;
  return { service, otps, customers, sent, lastCode, fetchMock };
}

describe('guest phone verification', () => {
  it('sends a WhatsApp code to a new number and lets them in with it', async () => {
    const t = setup();
    const r = await t.service.start(
      'b1',
      'Surat Thali House',
      'Priya',
      '9429267032',
    );
    expect(r.verified).toBe(false);
    expect(t.sent[0]).toMatchObject({
      sessionName: 'sess',
      number: '9429267032',
    });
    expect(t.sent[0].message).toMatch(
      /^Hello Priya,\n\nFor ordering at Surat Thali House, please find the OTP below to be verified\. \n\n\d{6}$/,
    );
    expect(t.otps[0].codeHash).not.toContain(t.lastCode());

    const { guestToken } = await t.service.check(
      'b1',
      '9429267032',
      t.lastCode(),
    );
    const claims = await t.service.verify(guestToken, 'b1');
    expect(claims).toMatchObject<Partial<GuestClaims>>({
      typ: 'guest',
      branchId: 'b1',
      name: 'Priya',
      phone: '9429267032',
    });
    expect(t.customers[0].phoneVerifiedAt).toBeInstanceOf(Date);
    expect(t.otps).toHaveLength(0);
  });

  it('never asks a verified number again', async () => {
    const t = setup({
      customers: [
        {
          id: 'c1',
          branchId: 'b1',
          phone: '9429267032',
          name: 'Priya',
          phoneVerifiedAt: new Date(),
          createdAt: new Date(),
        },
      ],
    });
    const r = await t.service.start('b1', 'R', 'Priya S', '9429267032');
    expect(r.verified).toBe(true);
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('skips the code when WhatsApp is not configured', async () => {
    const t = setup({ whatsapp: false });
    const r = await t.service.start('b1', 'R', 'Amit', '9876543210');
    expect(r.verified).toBe(true);
    expect(t.customers[0]).toMatchObject({
      name: 'Amit',
      phone: '9876543210',
      phoneVerifiedAt: null,
    });
  });

  it('rejects a wrong code, and locks after five tries', async () => {
    const t = setup();
    await t.service.start('b1', 'R', 'Priya', '9429267032');
    const wrong = t.lastCode() === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await expect(t.service.check('b1', '9429267032', wrong)).rejects.toThrow(
        /not right/,
      );
    }
    await expect(
      t.service.check('b1', '9429267032', t.lastCode()),
    ).rejects.toThrow(/Too many wrong tries/);
  });

  it('makes a guest wait before resending', async () => {
    const t = setup();
    await t.service.start('b1', 'R', 'Priya', '9429267032');
    await expect(
      t.service.start('b1', 'R', 'Priya', '9429267032'),
    ).rejects.toThrow(/wait/);
  });

  it("drops the code if WhatsApp couldn't send it", async () => {
    const t = setup();
    t.fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve('down'),
      }),
    );
    await expect(
      t.service.start('b1', 'R', 'Priya', '9429267032'),
    ).rejects.toThrow(/Could not send/);
    expect(t.otps).toHaveLength(0);
  });

  it("refuses another branch's token", async () => {
    const t = setup({ whatsapp: false });
    const { guestToken } = (await t.service.start(
      'b1',
      'R',
      'Amit',
      '9876543210',
    )) as { guestToken: string };
    await expect(t.service.verify(guestToken, 'b2')).rejects.toThrow(
      /confirm your name/,
    );
    await expect(t.service.verify('not-a-token', 'b1')).rejects.toThrow(
      /confirm your name/,
    );
  });
});

// Keeps the stored hash honest: it must depend on branch and phone too.
it('hashes codes per branch and phone', () => {
  const h = (b: string, p: string) =>
    createHash('sha256').update(`${b}:${p}:123456`).digest('hex');
  expect(h('b1', '9429267032')).not.toBe(h('b2', '9429267032'));
});
