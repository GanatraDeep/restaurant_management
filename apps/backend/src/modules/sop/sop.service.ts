import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import {
  ltext,
  type ChecklistEntryDto,
  type ChecklistItem,
  type ChecklistTemplateDto,
  type ComplianceDto,
  type LText,
  type PlaybookDto,
  type SessionUser,
  type SopDto,
  type SopQuizQuestion,
} from '@nodedr-restaurant/types';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { BranchTimeService } from '../../common/services/branch-time.service';
import {
  STARTER_CHECKLISTS,
  STARTER_COMPLIANCE,
  STARTER_PLAYBOOKS,
  STARTER_SOPS,
} from './sop-library';

const json = (v: unknown) => v as Prisma.InputJsonValue;
const DAY = 86_400_000;

/** Share of quiz answers that must be right to sign off an SOP. */
export const QUIZ_PASS_RATIO = 0.8;

export function quizResult(quiz: SopQuizQuestion[], answers: number[]) {
  const total = quiz.length;
  const wrong: number[] = [];
  quiz.forEach((q, i) => {
    if (answers[i] !== q.answer) wrong.push(i);
  });
  const score = total - wrong.length;
  return { score, total, wrong, passed: total === 0 || score / total >= QUIZ_PASS_RATIO };
}

/** Local date "YYYY-MM-DD" and time "HH:MM" in a timezone. */
export function localNow(tz: string, now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return { date, time, weekday };
}

/** ISO week key for a "YYYY-MM-DD" date: "2026-W47". */
export function isoWeekKey(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export const periodKeyFor = (frequency: string, date: string) =>
  frequency === 'WEEKLY' ? isoWeekKey(date) : date;

type Entry = { ok?: boolean; value?: number | null; note?: string; by: string; at: string };

export function itemDone(item: ChecklistItem, e: Entry | undefined) {
  if (!e) return false;
  return item.kind === 'CHECK' ? e.ok === true : e.value !== null && e.value !== undefined;
}

export function outOfRange(item: ChecklistItem, e: Entry | undefined) {
  if (!e || item.kind === 'CHECK' || e.value === null || e.value === undefined) return false;
  return (item.min !== undefined && e.value < item.min) || (item.max !== undefined && e.value > item.max);
}

/** Days from today (branch-local date) until a date; negative = overdue. */
export function daysUntil(today: string, date: Date | null) {
  if (!date) return null;
  return Math.round((date.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / DAY);
}

@Injectable()
export class SopService {
  private readonly logger = new Logger(SopService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly time: BranchTimeService,
  ) {}

  // ------------------------------------------------------------------ SOPs

  private sopData(dto: SopDto) {
    return {
      title: json(dto.title),
      category: dto.category || null,
      yieldText: dto.yieldText || null,
      prepMinutes: dto.prepMinutes ?? null,
      variants: [...new Set(dto.variants)],
      ingredients: json(dto.ingredients),
      steps: json(dto.steps),
      packaging: json(dto.packaging),
      accompaniments: json(dto.accompaniments),
      plating: dto.plating?.en || dto.plating?.hi || dto.plating?.gu || dto.plating?.mr ? json(dto.plating) : Prisma.DbNull,
      quiz: json(dto.quiz),
      audioUrl: dto.audioUrl ?? null,
      coverUrl: dto.coverUrl ?? null,
    };
  }

  private snapshot(dto: SopDto) {
    const { changeNote: _note, ...rest } = dto;
    return json(rest);
  }

  async listSops(restaurantId: string, userId: string) {
    const sops = await this.prisma.sop.findMany({
      where: { restaurantId, isArchived: false },
      orderBy: [{ category: 'asc' }, { updatedAt: 'desc' }],
      select: {
        id: true, title: true, category: true, variants: true, version: true, prepMinutes: true,
        coverUrl: true, audioUrl: true, steps: true, updatedAt: true, starterKey: true,
        acks: { where: { userId }, select: { version: true } },
      },
    });
    return sops.map(({ acks, steps, ...s }) => ({
      ...s,
      stepCount: Array.isArray(steps) ? steps.length : 0,
      readCurrent: acks.some((a) => a.version === s.version),
    }));
  }

  private async findSop(restaurantId: string, id: string) {
    const sop = await this.prisma.sop.findFirst({ where: { id, restaurantId } });
    if (!sop) throw new NotFoundException('SOP not found');
    return sop;
  }

  async getSop(restaurantId: string, id: string, userId: string) {
    const sop = await this.findSop(restaurantId, id);
    const myAck = await this.prisma.sopAck.findFirst({
      where: { sopId: id, userId, version: sop.version },
      select: { quizScore: true, quizTotal: true, acknowledgedAt: true },
    });
    return { ...sop, myAck };
  }

  async createSop(restaurantId: string, user: SessionUser, dto: SopDto, starterKey?: string) {
    return this.prisma.sop.create({
      data: {
        restaurantId,
        ...this.sopData(dto),
        starterKey: starterKey ?? null,
        updatedByName: user.name,
        versions: {
          create: {
            version: 1,
            snapshot: this.snapshot(dto),
            changeNote: dto.changeNote || (starterKey ? 'Copied from the starter library' : 'First version'),
            createdByName: user.name,
          },
        },
      },
    });
  }

  async updateSop(restaurantId: string, user: SessionUser, id: string, dto: SopDto) {
    const sop = await this.findSop(restaurantId, id);
    const version = sop.version + 1;
    const updated = await this.prisma.sop.update({
      where: { id },
      data: {
        ...this.sopData(dto),
        version,
        updatedByName: user.name,
        versions: {
          create: {
            version,
            snapshot: this.snapshot(dto),
            changeNote: dto.changeNote || null,
            createdByName: user.name,
          },
        },
      },
    });
    // Everyone who cooks it needs to know the recipe changed — and re-read it.
    const branches = await this.prisma.branch.findMany({ where: { restaurantId }, select: { id: true } });
    const title = ltext(dto.title, 'en');
    await Promise.all(
      branches.map((b) =>
        this.notifications
          .notifyByPermission(b.id, 'sop.view', {
            type: 'sop.updated',
            title: `SOP changed: ${title}`,
            body: dto.changeNote ? `${dto.changeNote} — please read it again.` : 'Please read the new version.',
            entity: 'Sop',
            entityId: id,
          })
          .catch((e) => this.logger.warn(`SOP change notification failed: ${String(e)}`)),
      ),
    );
    return updated;
  }

  async archiveSop(restaurantId: string, id: string) {
    await this.findSop(restaurantId, id);
    await this.prisma.sop.update({ where: { id }, data: { isArchived: true, shareToken: null } });
    return { ok: true };
  }

  async versions(restaurantId: string, id: string) {
    await this.findSop(restaurantId, id);
    return this.prisma.sopVersion.findMany({
      where: { sopId: id },
      orderBy: { version: 'desc' },
      select: { version: true, changeNote: true, createdByName: true, createdAt: true, snapshot: true },
    });
  }

  async acknowledge(restaurantId: string, user: SessionUser, id: string, answers: number[]) {
    const sop = await this.findSop(restaurantId, id);
    const result = quizResult((sop.quiz as SopQuizQuestion[]) ?? [], answers);
    if (!result.passed) return { ...result, saved: false };
    await this.prisma.sopAck.upsert({
      where: { sopId_userId_version: { sopId: id, userId: user.id, version: sop.version } },
      update: { quizScore: result.score, quizTotal: result.total, acknowledgedAt: new Date() },
      create: { sopId: id, userId: user.id, version: sop.version, quizScore: result.score, quizTotal: result.total },
    });
    return { ...result, saved: true };
  }

  /** Who has read which SOP's current version — the owner's training view. */
  async training(restaurantId: string) {
    const [sops, staff] = await Promise.all([
      this.prisma.sop.findMany({
        where: { restaurantId, isArchived: false },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, version: true, acks: { select: { userId: true, version: true, quizScore: true, quizTotal: true, acknowledgedAt: true } } },
      }),
      this.prisma.user.findMany({
        where: {
          restaurantId,
          isActive: true,
          role: { permissions: { some: { permission: { key: { in: ['sop.view', 'sop.manage'] } } } } },
        },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, role: { select: { label: true } } },
      }),
    ]);
    return {
      sops: sops.map((s) => ({ id: s.id, title: s.title, version: s.version })),
      staff: staff.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role?.label ?? '',
        reads: Object.fromEntries(
          sops.flatMap((s) => {
            const a = s.acks.filter((x) => x.userId === u.id).sort((x, y) => y.version - x.version)[0];
            return a
              ? [[s.id, { version: a.version, current: a.version === s.version, score: a.quizScore, total: a.quizTotal, at: a.acknowledgedAt }]]
              : [];
          }),
        ),
      })),
    };
  }

  async share(restaurantId: string, id: string, on: boolean) {
    const sop = await this.findSop(restaurantId, id);
    const shareToken = on ? sop.shareToken ?? randomBytes(12).toString('base64url') : null;
    await this.prisma.sop.update({ where: { id }, data: { shareToken } });
    return { shareToken };
  }

  /** Read-only SOP for a shared WhatsApp link. No quiz answers. */
  async publicSop(token: string) {
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) throw new NotFoundException('Link not found');
    const sop = await this.prisma.sop.findFirst({
      where: { shareToken: token, isArchived: false },
      select: {
        title: true, category: true, yieldText: true, prepMinutes: true, variants: true, ingredients: true,
        steps: true, packaging: true, accompaniments: true, plating: true, audioUrl: true, coverUrl: true,
        version: true, updatedAt: true, restaurant: { select: { name: true } },
      },
    });
    if (!sop) throw new NotFoundException('This link was turned off or does not exist');
    const { restaurant, ...rest } = sop;
    return { ...rest, restaurantName: restaurant.name };
  }

  // -------------------------------------------------------------- Library

  async library(restaurantId: string) {
    const [sops, checklists, playbooks, compliance] = await Promise.all([
      this.prisma.sop.findMany({ where: { restaurantId, isArchived: false, starterKey: { not: null } }, select: { starterKey: true } }),
      Promise.resolve(STARTER_CHECKLISTS.length),
      Promise.resolve(STARTER_PLAYBOOKS.length),
      Promise.resolve(STARTER_COMPLIANCE.length),
    ]);
    const have = new Set(sops.map((s) => s.starterKey));
    return {
      sops: STARTER_SOPS.map((s) => ({
        key: s.key, title: s.title, category: s.category, variants: s.variants, steps: s.steps.length, added: have.has(s.key),
      })),
      counts: { checklists, playbooks, compliance },
    };
  }

  async importSops(restaurantId: string, user: SessionUser, keys: string[]) {
    const have = new Set(
      (await this.prisma.sop.findMany({ where: { restaurantId, isArchived: false, starterKey: { in: keys } }, select: { starterKey: true } })).map((s) => s.starterKey),
    );
    let added = 0;
    for (const { key, ...dto } of STARTER_SOPS.filter((s) => keys.includes(s.key) && !have.has(s.key))) {
      await this.createSop(restaurantId, user, dto, key);
      added++;
    }
    return { added };
  }

  // ----------------------------------------------------------- Playbooks

  listPlaybooks(restaurantId: string) {
    return this.prisma.playbook.findMany({ where: { restaurantId }, orderBy: { createdAt: 'asc' } });
  }

  createPlaybook(restaurantId: string, dto: PlaybookDto) {
    return this.prisma.playbook.create({
      data: { restaurantId, channel: dto.channel, title: json(dto.title), sections: json(dto.sections) },
    });
  }

  async updatePlaybook(restaurantId: string, id: string, dto: PlaybookDto) {
    const p = await this.prisma.playbook.findFirst({ where: { id, restaurantId } });
    if (!p) throw new NotFoundException('Playbook not found');
    return this.prisma.playbook.update({
      where: { id },
      data: { channel: dto.channel, title: json(dto.title), sections: json(dto.sections) },
    });
  }

  async deletePlaybook(restaurantId: string, id: string) {
    const { count } = await this.prisma.playbook.deleteMany({ where: { id, restaurantId } });
    if (!count) throw new NotFoundException('Playbook not found');
    return { ok: true };
  }

  async importPlaybooks(restaurantId: string) {
    const existing = await this.prisma.playbook.findMany({ where: { restaurantId }, select: { channel: true } });
    const have = new Set(existing.map((p) => p.channel));
    const todo = STARTER_PLAYBOOKS.filter((p) => !have.has(p.channel));
    for (const p of todo) await this.createPlaybook(restaurantId, p);
    return { added: todo.length };
  }

  // ---------------------------------------------------------- Checklists

  listTemplates(branchId: string) {
    return this.prisma.checklistTemplate.findMany({ where: { branchId }, orderBy: { createdAt: 'asc' } });
  }

  private checkItems(dto: ChecklistTemplateDto) {
    const ids = new Set<string>();
    for (const it of dto.items) {
      if (ids.has(it.id)) throw new BadRequestException('Two checklist items have the same id');
      ids.add(it.id);
      if (it.min !== undefined && it.max !== undefined && it.min > it.max)
        throw new BadRequestException(`"${it.label.en}": the lowest value is above the highest`);
    }
  }

  createTemplate(branchId: string, dto: ChecklistTemplateDto) {
    this.checkItems(dto);
    return this.prisma.checklistTemplate.create({
      data: {
        branchId,
        name: json(dto.name),
        frequency: dto.frequency,
        dueTime: dto.dueTime ?? null,
        items: json(dto.items),
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateTemplate(branchId: string, id: string, dto: ChecklistTemplateDto) {
    this.checkItems(dto);
    const t = await this.prisma.checklistTemplate.findFirst({ where: { id, branchId } });
    if (!t) throw new NotFoundException('Checklist not found');
    return this.prisma.checklistTemplate.update({
      where: { id },
      data: {
        name: json(dto.name),
        frequency: dto.frequency,
        dueTime: dto.dueTime ?? null,
        items: json(dto.items),
        isActive: dto.isActive ?? t.isActive,
      },
    });
  }

  async deleteTemplate(branchId: string, id: string) {
    const { count } = await this.prisma.checklistTemplate.deleteMany({ where: { id, branchId } });
    if (!count) throw new NotFoundException('Checklist not found');
    return { ok: true };
  }

  async importChecklists(branchId: string) {
    const existing = await this.prisma.checklistTemplate.findMany({ where: { branchId }, select: { name: true } });
    const have = new Set(existing.map((t) => (t.name as LText).en.toLowerCase()));
    const todo = STARTER_CHECKLISTS.filter((t) => !have.has(t.name.en.toLowerCase()));
    for (const { key: _k, ...t } of todo) await this.createTemplate(branchId, t);
    return { added: todo.length };
  }

  private summarise(t: { frequency: string; dueTime: string | null; items: unknown }, run: { entries: unknown; completedAt: Date | null } | undefined, now: { time: string; weekday: number }) {
    const items = (t.items as ChecklistItem[]) ?? [];
    const entries = (run?.entries as Record<string, Entry>) ?? {};
    const done = items.filter((i) => itemDone(i, entries[i.id])).length;
    const alerts = items.filter((i) => outOfRange(i, entries[i.id])).length;
    const due = t.dueTime ?? (t.frequency === 'WEEKLY' ? '18:00' : null);
    const overdue =
      !run?.completedAt && !!due && now.time >= due && (t.frequency === 'DAILY' || now.weekday === 0);
    return { done, total: items.length, alerts, overdue, completed: !!run?.completedAt };
  }

  /** Today's (and this week's) checklists for an outlet, with progress. */
  async today(branchId: string) {
    const tz = await this.time.tzForBranch(branchId);
    const now = localNow(tz);
    const templates = await this.prisma.checklistTemplate.findMany({
      where: { branchId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    const keys = [...new Set(templates.map((t) => periodKeyFor(t.frequency, now.date)))];
    const runs = await this.prisma.checklistRun.findMany({
      where: { branchId, periodKey: { in: keys }, templateId: { in: templates.map((t) => t.id) } },
    });
    return {
      date: now.date,
      checklists: templates.map((t) => {
        const periodKey = periodKeyFor(t.frequency, now.date);
        const run = runs.find((r) => r.templateId === t.id && r.periodKey === periodKey);
        return {
          ...t,
          periodKey,
          entries: (run?.entries as Record<string, Entry>) ?? {},
          completedAt: run?.completedAt ?? null,
          completedByName: run?.completedByName ?? null,
          ...this.summarise(t, run, now),
        };
      }),
    };
  }

  async tick(branchId: string, user: SessionUser, templateId: string, dto: ChecklistEntryDto) {
    const t = await this.prisma.checklistTemplate.findFirst({ where: { id: templateId, branchId, isActive: true } });
    if (!t) throw new NotFoundException('Checklist not found');
    const items = t.items as ChecklistItem[];
    const item = items.find((i) => i.id === dto.itemId);
    if (!item) throw new BadRequestException('That item is not on this checklist');
    if (item.kind !== 'CHECK' && dto.value === undefined && dto.ok === undefined)
      throw new BadRequestException(`Enter the reading for "${item.label.en}"`);

    const tz = await this.time.tzForBranch(branchId);
    const now = localNow(tz);
    const periodKey = periodKeyFor(t.frequency, now.date);
    const at = new Date().toISOString();
    const entry: Entry = {
      ...(item.kind === 'CHECK' ? { ok: dto.ok ?? true } : { value: dto.value ?? null }),
      ...(dto.note ? { note: dto.note } : {}),
      by: user.name,
      at,
    };

    const run = await this.prisma.checklistRun.findUnique({ where: { templateId_periodKey: { templateId, periodKey } } });
    const entries = { ...((run?.entries as Record<string, Entry>) ?? {}), [item.id]: entry };
    const log = [...((run?.log as unknown[]) ?? []), { itemId: item.id, ...entry }].slice(-500);
    const allDone = items.every((i) => itemDone(i, entries[i.id]));
    const data = {
      entries: json(entries),
      log: json(log),
      completedAt: allDone ? run?.completedAt ?? new Date() : null,
      completedByName: allDone ? run?.completedByName ?? user.name : null,
    };
    const saved = await this.prisma.checklistRun.upsert({
      where: { templateId_periodKey: { templateId, periodKey } },
      update: data,
      create: { templateId, branchId, periodKey, ...data },
    });

    if (outOfRange(item, entry)) {
      const range = [item.min, item.max].filter((v) => v !== undefined).join(' to ');
      await this.notifications
        .notifyByPermission(branchId, 'sop.manage', {
          type: 'sop.temperature',
          title: `${item.label.en}: ${entry.value}${item.unit ?? ''} — out of range`,
          body: `Should be ${range}${item.unit ?? ''}. Logged by ${user.name} on "${(t.name as LText).en}".`,
          entity: 'Checklist',
          entityId: t.id,
        })
        .catch((e) => this.logger.warn(`Temperature alert failed: ${String(e)}`));
    }
    return { ...saved, ...this.summarise(t, saved, now) };
  }

  /** Past runs with every tick — the audit trail. */
  async history(branchId: string, templateId?: string, days = 14) {
    const since = new Date(Date.now() - Math.min(Math.max(days, 1), 90) * DAY);
    return this.prisma.checklistRun.findMany({
      where: { branchId, ...(templateId ? { templateId } : {}), createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, periodKey: true, entries: true, log: true, completedAt: true, completedByName: true, createdAt: true,
        template: { select: { id: true, name: true, items: true, frequency: true } },
      },
    });
  }

  // ---------------------------------------------------------- Compliance

  async listCompliance(branchId: string) {
    const tz = await this.time.tzForBranch(branchId);
    const { date } = localNow(tz);
    const items = await this.prisma.complianceItem.findMany({
      where: { branchId, isActive: true },
      orderBy: [{ expiresOn: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    });
    return items.map((c) => {
      const daysLeft = daysUntil(date, c.expiresOn);
      return {
        ...c,
        cost: c.cost === null ? null : Number(c.cost),
        daysLeft,
        overdue: daysLeft !== null && daysLeft < 0,
        dueSoon: daysLeft !== null && daysLeft >= 0 && daysLeft <= c.remindDays,
      };
    });
  }

  private complianceData(dto: Partial<ComplianceDto>) {
    const d = (v?: string | null) => (v ? new Date(`${v}T00:00:00Z`) : v === null ? null : undefined);
    return {
      kind: dto.kind,
      name: dto.name,
      number: dto.number || null,
      provider: dto.provider || null,
      providerPhone: dto.providerPhone || null,
      issuedOn: d(dto.issuedOn),
      expiresOn: d(dto.expiresOn),
      remindDays: dto.remindDays,
      cost: dto.cost ?? null,
      notes: dto.notes || null,
    };
  }

  createCompliance(branchId: string, dto: ComplianceDto) {
    return this.prisma.complianceItem.create({
      data: { branchId, ...this.complianceData(dto), kind: dto.kind, name: dto.name },
    });
  }

  async updateCompliance(branchId: string, id: string, dto: ComplianceDto) {
    const c = await this.prisma.complianceItem.findFirst({ where: { id, branchId } });
    if (!c) throw new NotFoundException('Not found');
    return this.prisma.complianceItem.update({
      where: { id },
      data: { ...this.complianceData(dto), lastRemindedAt: null },
    });
  }

  async renewCompliance(branchId: string, id: string, dto: { issuedOn?: string; expiresOn: string; cost?: number | null; number?: string }) {
    const c = await this.prisma.complianceItem.findFirst({ where: { id, branchId } });
    if (!c) throw new NotFoundException('Not found');
    return this.prisma.complianceItem.update({
      where: { id },
      data: {
        issuedOn: dto.issuedOn ? new Date(`${dto.issuedOn}T00:00:00Z`) : new Date(),
        expiresOn: new Date(`${dto.expiresOn}T00:00:00Z`),
        ...(dto.cost !== undefined ? { cost: dto.cost } : {}),
        ...(dto.number ? { number: dto.number } : {}),
        lastRemindedAt: null,
      },
    });
  }

  async deleteCompliance(branchId: string, id: string) {
    const { count } = await this.prisma.complianceItem.updateMany({ where: { id, branchId }, data: { isActive: false } });
    if (!count) throw new NotFoundException('Not found');
    return { ok: true };
  }

  async importCompliance(branchId: string) {
    const existing = await this.prisma.complianceItem.findMany({ where: { branchId, isActive: true }, select: { name: true } });
    const have = new Set(existing.map((c) => c.name.toLowerCase()));
    const todo = STARTER_COMPLIANCE.filter((c) => !have.has(c.name.toLowerCase()));
    for (const c of todo) await this.createCompliance(branchId, c);
    return { added: todo.length };
  }

  // ------------------------------------------------------------ Overview

  /** One row per outlet: today's checklists, temperature alerts, licences — plus SOP training coverage. */
  async overview(restaurantId: string) {
    const branches = await this.prisma.branch.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
    const outlets = await Promise.all(
      branches.map(async (b) => {
        const [{ checklists }, compliance] = await Promise.all([this.today(b.id), this.listCompliance(b.id)]);
        return {
          branchId: b.id,
          name: b.name,
          checklistsDone: checklists.filter((c) => c.completed).length,
          checklistsTotal: checklists.length,
          checklistsOverdue: checklists.filter((c) => c.overdue).length,
          temperatureAlerts: checklists.reduce((n, c) => n + c.alerts, 0),
          licencesOverdue: compliance.filter((c) => c.overdue).length,
          licencesDueSoon: compliance.filter((c) => c.dueSoon).length,
        };
      }),
    );
    const t = await this.training(restaurantId);
    const cells = t.sops.length * t.staff.length;
    const read = t.staff.reduce((n, s) => n + Object.values(s.reads).filter((r) => r.current).length, 0);
    return {
      outlets,
      training: { sops: t.sops.length, staff: t.staff.length, readPercent: cells ? Math.round((read / cells) * 100) : null },
    };
  }

  // ----------------------------------------------------------- Reminders

  @Cron(CronExpression.EVERY_30_MINUTES)
  async sendReminders() {
    try {
      await this.remindCompliance();
      await this.remindChecklists();
    } catch (e) {
      this.logger.error(`SOP reminders failed: ${String(e)}`);
    }
  }

  async remindCompliance(now = new Date()) {
    const horizon = new Date(now.getTime() + 365 * DAY);
    const items = await this.prisma.complianceItem.findMany({
      where: {
        isActive: true,
        expiresOn: { not: null, lte: horizon },
        OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lt: new Date(now.getTime() - 3 * DAY) } }],
      },
    });
    let sent = 0;
    for (const c of items) {
      const today = now.toISOString().slice(0, 10);
      const days = daysUntil(today, c.expiresOn)!;
      if (days > c.remindDays) continue;
      const when = days < 0 ? `expired ${-days} day(s) ago` : days === 0 ? 'expires today' : `expires in ${days} day(s)`;
      await this.notifications.notifyByPermission(c.branchId, 'sop.manage', {
        type: 'sop.compliance',
        title: `${c.name} ${when}`,
        body: c.provider ? `Renew with ${c.provider}${c.providerPhone ? ` (${c.providerPhone})` : ''}.` : 'Renew it and update the date.',
        entity: 'Compliance',
        entityId: c.id,
      });
      await this.prisma.complianceItem.update({ where: { id: c.id }, data: { lastRemindedAt: now } });
      sent++;
    }
    return sent;
  }

  async remindChecklists(now = new Date()) {
    const templates = await this.prisma.checklistTemplate.findMany({
      where: { isActive: true },
      select: {
        id: true, branchId: true, name: true, frequency: true, dueTime: true, items: true, remindedFor: true,
        branch: { select: { restaurant: { select: { timezone: true } } } },
      },
    });
    let sent = 0;
    for (const t of templates) {
      const local = localNow(t.branch.restaurant.timezone || 'Asia/Kolkata', now);
      const periodKey = periodKeyFor(t.frequency, local.date);
      if (t.remindedFor === periodKey) continue;
      const run = await this.prisma.checklistRun.findUnique({
        where: { templateId_periodKey: { templateId: t.id, periodKey } },
        select: { entries: true, completedAt: true },
      });
      if (!this.summarise(t, run ?? undefined, local).overdue) continue;
      const name = (t.name as LText).en;
      await this.notifications.notifyByPermission(t.branchId, 'sop.view', {
        type: 'sop.checklist',
        title: `"${name}" checklist not done`,
        body: t.dueTime ? `It was due at ${t.dueTime}.` : 'It is due today.',
        entity: 'Checklist',
        entityId: t.id,
      });
      await this.prisma.checklistTemplate.update({ where: { id: t.id }, data: { remindedFor: periodKey } });
      sent++;
    }
    return sent;
  }
}
