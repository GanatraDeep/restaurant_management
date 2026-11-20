"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChecklistItem,
  ChecklistTemplateDto,
  ComplianceDto,
  LText,
  PlaybookDto,
  SopDto,
  SopIngredient,
  SopLine,
  SopQuizQuestion,
  SopStep,
} from "@nodedr-restaurant/types";
import { api } from "@/lib/api";

const q = (branchId: string | null) => `branchId=${encodeURIComponent(branchId ?? "")}`;

export interface SopSummary {
  id: string;
  title: LText;
  category: string | null;
  variants: string[];
  version: number;
  prepMinutes: number | null;
  coverUrl: string | null;
  audioUrl: string | null;
  stepCount: number;
  readCurrent: boolean;
  updatedAt: string;
}

export interface SopContent {
  title: LText;
  category: string | null;
  yieldText: string | null;
  prepMinutes: number | null;
  variants: string[];
  ingredients: SopIngredient[];
  steps: SopStep[];
  packaging: SopLine[];
  accompaniments: SopLine[];
  plating: Partial<LText> | null;
  audioUrl: string | null;
  coverUrl: string | null;
  version: number;
  updatedAt: string;
}

export interface SopFull extends SopContent {
  id: string;
  quiz: SopQuizQuestion[];
  shareToken: string | null;
  updatedByName: string | null;
  myAck: { quizScore: number | null; quizTotal: number | null; acknowledgedAt: string } | null;
}

export interface PublicSop extends SopContent {
  restaurantName: string;
}

export interface SopVersionRow {
  version: number;
  changeNote: string | null;
  createdByName: string | null;
  createdAt: string;
  snapshot: SopDto;
}

export interface LibraryResponse {
  sops: { key: string; title: LText; category?: string; variants: string[]; steps: number; added: boolean }[];
  counts: { checklists: number; playbooks: number; compliance: number };
}

export interface ChecklistEntry {
  ok?: boolean;
  value?: number | null;
  note?: string;
  by: string;
  at: string;
}

export interface ChecklistToday {
  id: string;
  name: LText;
  frequency: "DAILY" | "WEEKLY";
  dueTime: string | null;
  items: ChecklistItem[];
  isActive: boolean;
  periodKey: string;
  entries: Record<string, ChecklistEntry>;
  completedAt: string | null;
  completedByName: string | null;
  done: number;
  total: number;
  alerts: number;
  overdue: boolean;
  completed: boolean;
}

export interface ChecklistTemplateRow {
  id: string;
  name: LText;
  frequency: "DAILY" | "WEEKLY";
  dueTime: string | null;
  items: ChecklistItem[];
  isActive: boolean;
}

export interface ChecklistHistoryRow {
  id: string;
  periodKey: string;
  entries: Record<string, ChecklistEntry>;
  log: (ChecklistEntry & { itemId: string })[];
  completedAt: string | null;
  completedByName: string | null;
  template: { id: string; name: LText; items: ChecklistItem[]; frequency: string };
}

export interface PlaybookRow extends PlaybookDto {
  id: string;
}

export interface ComplianceRow {
  id: string;
  kind: ComplianceDto["kind"];
  name: string;
  number: string | null;
  provider: string | null;
  providerPhone: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  remindDays: number;
  cost: number | null;
  notes: string | null;
  daysLeft: number | null;
  overdue: boolean;
  dueSoon: boolean;
}

export interface TrainingResponse {
  sops: { id: string; title: LText; version: number }[];
  staff: {
    id: string;
    name: string;
    role: string;
    reads: Record<string, { version: number; current: boolean; score: number | null; total: number | null; at: string }>;
  }[];
}

export interface OverviewResponse {
  outlets: {
    branchId: string;
    name: string;
    checklistsDone: number;
    checklistsTotal: number;
    checklistsOverdue: number;
    temperatureAlerts: number;
    licencesOverdue: number;
    licencesDueSoon: number;
  }[];
  training: { sops: number; staff: number; readPercent: number | null };
}

// ------------------------------------------------------------------ queries

export const useSops = () => useQuery({ queryKey: ["sop", "list"], queryFn: () => api.get<SopSummary[]>("/sop/sops") });

export const useSop = (id: string | null) =>
  useQuery({ queryKey: ["sop", "one", id], queryFn: () => api.get<SopFull>(`/sop/sops/${id}`), enabled: !!id });

export const useSopVersions = (id: string | null, enabled = true) =>
  useQuery({ queryKey: ["sop", "versions", id], queryFn: () => api.get<SopVersionRow[]>(`/sop/sops/${id}/versions`), enabled: !!id && enabled });

export const usePublicSop = (token: string) =>
  useQuery({ queryKey: ["sop", "public", token], queryFn: () => api.get<PublicSop>(`/public/sop/${encodeURIComponent(token)}`), retry: false });

export const useSopLibrary = (enabled: boolean) =>
  useQuery({ queryKey: ["sop", "library"], queryFn: () => api.get<LibraryResponse>("/sop/library"), enabled });

export const useChecklistsToday = (branchId: string | null) =>
  useQuery({
    queryKey: ["sop", "checklists", "today", branchId],
    queryFn: () => api.get<{ date: string; checklists: ChecklistToday[] }>(`/sop/checklists/today?${q(branchId)}`),
    enabled: !!branchId,
    refetchInterval: 60_000,
  });

export const useChecklistTemplates = (branchId: string | null, enabled: boolean) =>
  useQuery({
    queryKey: ["sop", "checklists", "templates", branchId],
    queryFn: () => api.get<ChecklistTemplateRow[]>(`/sop/checklists?${q(branchId)}`),
    enabled: !!branchId && enabled,
  });

export const useChecklistHistory = (branchId: string | null, enabled: boolean) =>
  useQuery({
    queryKey: ["sop", "checklists", "history", branchId],
    queryFn: () => api.get<ChecklistHistoryRow[]>(`/sop/checklists/history?${q(branchId)}&days=14`),
    enabled: !!branchId && enabled,
  });

export const usePlaybooks = () => useQuery({ queryKey: ["sop", "playbooks"], queryFn: () => api.get<PlaybookRow[]>("/sop/playbooks") });

export const useCompliance = (branchId: string | null, enabled: boolean) =>
  useQuery({
    queryKey: ["sop", "compliance", branchId],
    queryFn: () => api.get<ComplianceRow[]>(`/sop/compliance?${q(branchId)}`),
    enabled: !!branchId && enabled,
  });

export const useSopTraining = (enabled: boolean) =>
  useQuery({ queryKey: ["sop", "training"], queryFn: () => api.get<TrainingResponse>("/sop/training"), enabled });

export const useSopOverview = (enabled: boolean) =>
  useQuery({ queryKey: ["sop", "overview"], queryFn: () => api.get<OverviewResponse>("/sop/overview"), enabled });

// ---------------------------------------------------------------- mutations

export function useSopActions(branchId: string | null) {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["sop"] });
  const useM = <V, R = unknown>(fn: (v: V) => Promise<R>) => useMutation({ mutationFn: fn, onSuccess: done });
  return {
    createSop: useM((dto: SopDto) => api.post<{ id: string }>("/sop/sops", dto)),
    updateSop: useM((v: { id: string; dto: SopDto }) => api.patch<{ id: string }>(`/sop/sops/${v.id}`, v.dto)),
    archiveSop: useM((id: string) => api.delete(`/sop/sops/${id}`)),
    ack: useM((v: { id: string; answers: number[] }) =>
      api.post<{ score: number; total: number; wrong: number[]; passed: boolean; saved: boolean }>(`/sop/sops/${v.id}/ack`, { answers: v.answers }),
    ),
    share: useM((id: string) => api.post<{ shareToken: string }>(`/sop/sops/${id}/share`)),
    unshare: useM((id: string) => api.delete(`/sop/sops/${id}/share`)),
    importSops: useM((keys: string[]) => api.post<{ added: number }>("/sop/library/import", { keys })),
    tick: useM((v: { templateId: string; itemId: string; ok?: boolean; value?: number | null; note?: string }) =>
      api.post(`/sop/checklists/${v.templateId}/tick?${q(branchId)}`, { itemId: v.itemId, ok: v.ok, value: v.value, note: v.note }),
    ),
    saveTemplate: useM((v: { id?: string; dto: ChecklistTemplateDto }) =>
      v.id ? api.patch(`/sop/checklists/${v.id}?${q(branchId)}`, v.dto) : api.post(`/sop/checklists?${q(branchId)}`, v.dto),
    ),
    deleteTemplate: useM((id: string) => api.delete(`/sop/checklists/${id}?${q(branchId)}`)),
    importChecklists: useM<void, { added: number }>(() => api.post<{ added: number }>(`/sop/checklists/import?${q(branchId)}`)),
    savePlaybook: useM((v: { id?: string; dto: PlaybookDto }) =>
      v.id ? api.patch(`/sop/playbooks/${v.id}`, v.dto) : api.post("/sop/playbooks", v.dto),
    ),
    deletePlaybook: useM((id: string) => api.delete(`/sop/playbooks/${id}`)),
    importPlaybooks: useM<void, { added: number }>(() => api.post<{ added: number }>("/sop/playbooks/import")),
    saveCompliance: useM((v: { id?: string; dto: ComplianceDto }) =>
      v.id ? api.patch(`/sop/compliance/${v.id}?${q(branchId)}`, v.dto) : api.post(`/sop/compliance?${q(branchId)}`, v.dto),
    ),
    renewCompliance: useM((v: { id: string; expiresOn: string; issuedOn?: string; cost?: number | null }) =>
      api.post(`/sop/compliance/${v.id}/renew?${q(branchId)}`, { expiresOn: v.expiresOn, issuedOn: v.issuedOn, cost: v.cost }),
    ),
    deleteCompliance: useM((id: string) => api.delete(`/sop/compliance/${id}?${q(branchId)}`)),
    importCompliance: useM<void, { added: number }>(() => api.post<{ added: number }>(`/sop/compliance/import?${q(branchId)}`)),
  };
}

export const uploadSopPhoto = (file: File) => api.upload<{ url: string }>("/sop/upload/photo", file);
export const uploadSopAudio = (file: File) => api.upload<{ url: string }>("/sop/upload/audio", file);
