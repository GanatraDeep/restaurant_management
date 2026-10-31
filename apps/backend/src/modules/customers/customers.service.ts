import { Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { safeCell } from '../../common/sheets';
import type { CustomerDto } from '@nodedr-restaurant/types';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  list(branchId: string, search?: string) {
    return this.prisma.customer.findMany({
      where: {
        branchId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Every customer with visits and spend, as an Excel sheet. */
  async exportExcel(branchId: string): Promise<Buffer> {
    const [customers, stats] = await Promise.all([
      this.prisma.customer.findMany({
        where: { branchId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.order.groupBy({
        by: ['customerId'],
        where: { branchId, status: 'PAID', customerId: { not: null } },
        _count: { _all: true },
        _sum: { totalAmount: true },
        _max: { createdAt: true },
      }),
    ]);
    const byCustomer = new Map(stats.map((s) => [s.customerId, s]));
    const date = (d: Date | null | undefined) =>
      d ? d.toISOString().slice(0, 10) : null;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'F Cartel';
    const ws = wb.addWorksheet('Customers');
    ws.columns = [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'Birthday', key: 'birthday', width: 12 },
      { header: 'Anniversary', key: 'anniversary', width: 12 },
      { header: 'Visits (paid orders)', key: 'visits', width: 18 },
      { header: 'Total spent', key: 'spent', width: 13 },
      { header: 'Last visit', key: 'lastVisit', width: 12 },
      { header: 'Loyalty points', key: 'points', width: 14 },
      { header: 'Wallet balance', key: 'wallet', width: 14 },
      { header: 'Phone verified', key: 'verified', width: 14 },
      { header: 'Marketing', key: 'marketing', width: 12 },
      { header: 'Allergies', key: 'allergies', width: 20 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Customer since', key: 'since', width: 14 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).eachCell((c) => {
      c.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFC0283A' },
      };
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const c of customers) {
      const s = byCustomer.get(c.id);
      ws.addRow({
        name: safeCell(c.name),
        // Kept as text so Excel doesn't turn numbers into 9.43E+09.
        phone: safeCell(c.phone),
        email: safeCell(c.email),
        address: safeCell(c.address),
        birthday: date(c.birthday),
        anniversary: date(c.anniversary),
        visits: s?._count._all ?? 0,
        spent: Number(s?._sum.totalAmount ?? 0),
        lastVisit: date(s?._max.createdAt),
        points: c.loyaltyPoints,
        wallet: Number(c.walletBalance),
        verified: c.phoneVerifiedAt ? 'Yes' : 'No',
        marketing: c.marketingOptOut ? 'Opted out' : 'Yes',
        allergies: safeCell(c.allergies),
        notes: safeCell(c.notes),
        since: date(c.createdAt),
      });
    }
    ws.getColumn('phone').numFmt = '@';
    ws.getColumn('spent').numFmt = '#,##0.00';
    ws.getColumn('wallet').numFmt = '#,##0.00';
    ws.autoFilter = { from: 'A1', to: { row: 1, column: ws.columns.length } };
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async getById(branchId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, branchId },
      include: {
        orders: {
          where: { status: 'PAID' },
          orderBy: { billedAt: 'desc' },
          take: 20,
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            billedAt: true,
          },
        },
        giftCards: true,
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  create(branchId: string, dto: CustomerDto) {
    return this.prisma.customer.create({ data: { ...dto, branchId } });
  }

  async update(branchId: string, id: string, dto: Partial<CustomerDto>) {
    await this.assertInBranch(branchId, id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  // Hard delete — Order.customerId and GiftCard.customerId are both
  // optional with onDelete: SetNull (schema.prisma), so this never orphans
  // or blocks on past orders/gift cards; it just detaches them from the
  // profile being removed.
  async remove(branchId: string, id: string) {
    await this.assertInBranch(branchId, id);
    await this.prisma.customer.delete({ where: { id } });
    return { ok: true };
  }

  private async assertInBranch(branchId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, branchId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
  }
}
