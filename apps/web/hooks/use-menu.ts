"use client";

import type { MenuCategoryDto, MenuItemDto } from "@nodedr-restaurant/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  showOnWebsite: boolean;
  takeawayCharge?: string | null;
  _count: { items: number };
}

export interface KitchenStation {
  id: string;
  name: string;
  /** Desktop app: this station's KOTs print here. Empty = the KOT printer. */
  printerName?: string | null;
  _count?: { items: number };
}

export interface Modifier {
  id: string;
  name: string;
  priceAdjustment: string;
  isDefault: boolean;
  /** false = sold out (hidden from menus). */
  isActive?: boolean;
  sortOrder?: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  modifiers: Modifier[];
  /** Items that offer this group (Menu → Add-ons list only). */
  menuItems?: { menuItemId: string }[];
}

export interface ModifierGroupInput {
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  modifiers: { id?: string; name: string; priceAdjustment: number; isDefault: boolean; isActive: boolean }[];
}

/** Add-on groups (Choose sauce, Extra toppings…) of the branch. */
export function useModifierGroups(branchId: string | null) {
  return useQuery({
    queryKey: ["menu", "modifier-groups", branchId],
    queryFn: () => api.get<ModifierGroup[]>(`/menu/modifier-groups?branchId=${branchId}`),
    enabled: !!branchId,
  });
}

export function useModifierGroupActions(branchId: string | null) {
  const queryClient = useQueryClient();
  const done = () => {
    queryClient.invalidateQueries({ queryKey: ["menu"] });
    queryClient.invalidateQueries({ queryKey: ["public-menu"] });
  };
  return {
    create: useMutation({
      mutationFn: (dto: ModifierGroupInput) => api.post<ModifierGroup>(`/menu/modifier-groups?branchId=${branchId}`, dto),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: (v: { id: string; dto: ModifierGroupInput }) =>
        api.patch<ModifierGroup>(`/menu/modifier-groups/${v.id}?branchId=${branchId}`, v.dto),
      onSuccess: done,
    }),
    setItems: useMutation({
      mutationFn: (v: { id: string; menuItemIds: string[] }) =>
        api.put(`/menu/modifier-groups/${v.id}/items?branchId=${branchId}`, { menuItemIds: v.menuItemIds }),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/menu/modifier-groups/${id}?branchId=${branchId}`),
      onSuccess: done,
    }),
  };
}

export interface MenuItem {
  id: string;
  categoryId: string;
  stationId: string | null;
  name: string;
  description?: string | null;
  takeawayCharge?: string | null;
  imageUrl: string | null;
  price: string;
  halfPrice: string | null;
  /** Rates for kinds of the same dish (Plain / Butter / Oil); empty = one price. */
  variants: { name: string; price: number }[];
  taxRatePercent: string;
  isVeg: boolean;
  isActive: boolean;
  isCombo: boolean;
  isFavorite: boolean;
  sendToKitchen: boolean;
  /** Not sent to the kitchen: true = counter slip, false = no ticket at all. */
  counterSlip?: boolean;
  category: { id: string; name: string };
  station: { id: string; name: string } | null;
  modifierGroups: { modifierGroup: ModifierGroup }[];
}

export function useCategories(branchId: string | null) {
  return useQuery({
    queryKey: ["menu", "categories", branchId],
    queryFn: () => api.get<MenuCategory[]>(`/menu/categories?branchId=${branchId}`),
    enabled: !!branchId,
  });
}

export function useStations(branchId: string | null) {
  return useQuery({
    queryKey: ["menu", "stations", branchId],
    queryFn: () => api.get<KitchenStation[]>(`/menu/stations?branchId=${branchId}`),
    enabled: !!branchId,
  });
}

export function useStationActions(branchId: string | null) {
  const queryClient = useQueryClient();
  const done = () => {
    queryClient.invalidateQueries({ queryKey: ["menu", "stations", branchId] });
    queryClient.invalidateQueries({ queryKey: ["menu", "items", branchId] });
    queryClient.invalidateQueries({ queryKey: ["kds"] });
  };
  return {
    create: useMutation({
      mutationFn: (name: string) => api.post<KitchenStation>(`/menu/stations?branchId=${branchId}`, { name }),
      onSuccess: done,
    }),
    rename: useMutation({
      mutationFn: (v: { id: string; name: string }) => api.patch(`/menu/stations/${v.id}?branchId=${branchId}`, { name: v.name }),
      onSuccess: done,
    }),
    setPrinter: useMutation({
      mutationFn: (v: { id: string; printerName: string | null }) =>
        api.patch(`/menu/stations/${v.id}?branchId=${branchId}`, { printerName: v.printerName }),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/menu/stations/${id}?branchId=${branchId}`),
      onSuccess: done,
    }),
  };
}

export function useMenuItems(branchId: string | null, categoryId?: string) {
  return useQuery({
    queryKey: ["menu", "items", branchId, categoryId],
    queryFn: () =>
      api.get<MenuItem[]>(
        `/menu/items?branchId=${branchId}${categoryId ? `&categoryId=${categoryId}` : ""}`,
      ),
    enabled: !!branchId,
  });
}

export function useCreateCategory(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: MenuCategoryDto) =>
      api.post(`/menu/categories?branchId=${branchId}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["menu", "categories", branchId] }),
  });
}

export function useUpdateCategory(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<MenuCategoryDto> }) =>
      api.patch(`/menu/categories/${id}?branchId=${branchId}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["menu", "categories", branchId] }),
  });
}

export function useDeleteCategory(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/menu/categories/${id}?branchId=${branchId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu", "categories", branchId] });
      queryClient.invalidateQueries({ queryKey: ["menu", "items", branchId] });
    },
  });
}

export function useUploadItemImage() {
  return useMutation({
    mutationFn: (file: File) => api.upload<{ url: string }>("/menu/items/upload-image", file),
  });
}

export function useCreateMenuItem(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: MenuItemDto) => api.post(`/menu/items?branchId=${branchId}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["menu", "items", branchId] }),
  });
}

export function useUpdateMenuItem(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<MenuItemDto> }) =>
      api.patch(`/menu/items/${id}?branchId=${branchId}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["menu", "items", branchId] }),
  });
}

export function useDeleteMenuItem(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/menu/items/${id}?branchId=${branchId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["menu", "items", branchId] }),
  });
}
