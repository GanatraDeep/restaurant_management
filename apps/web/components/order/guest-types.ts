// Shapes of the public table-QR API (apps/backend/src/modules/public).

export interface PublicMenuItem {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: string;
  halfPrice: string | null;
  /** Plain / Butter / Oil — the guest picks one; priced on the server. */
  variants?: { name: string; price: number }[];
  isVeg: boolean;
  spiceLevel: "NONE" | "MILD" | "MEDIUM" | "HOT" | "EXTRA_HOT";
  modifierGroups: {
    modifierGroup: {
      id: string;
      name: string;
      minSelect: number;
      maxSelect: number;
      isRequired: boolean;
      modifiers: { id: string; name: string; priceAdjustment: string; isDefault: boolean }[];
    };
  }[];
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  items: PublicMenuItem[];
}

export interface PublicMenuResponse {
  restaurantName: string;
  logoUrl: string | null;
  branchName: string;
  tableName: string;
  /** TAKEAWAY: the counter QR (no table, no waiter / bill buttons). */
  mode?: "TABLE" | "TAKEAWAY";
  otpEnabled: boolean;
  payFirst: boolean;
  upi: { vpa: string; payeeName: string } | null;
  categories: PublicMenuCategory[];
}

export interface PublicStatus {
  order: {
    orderNumber: string;
    status: string;
    acceptance: string;
    totalAmount: string;
    payFirst: boolean;
    guestPaidAt: string | null;
    amountDue: number | null;
    /** Token system: the number the counter will call. */
    token?: number | null;
    items: { id: string; nameSnapshot: string; quantity: number; status: string }[];
  } | null;
  openRequests: ("WAITER" | "BILL")[];
}

// One cart line = an item plus its chosen options and portion; the same item
// with different choices is a separate line.
export interface CartLine {
  key: string;
  menuItemId: string;
  modifierIds: string[];
  portion?: "HALF" | "FULL";
  /** Chosen variant name, e.g. "Butter". */
  variant?: string;
  label: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export interface GuestSession {
  token: string;
  name: string;
  phone: string;
}
