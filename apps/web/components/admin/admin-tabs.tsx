"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Overview", href: "/admin" },
  { label: "Plans", href: "/admin/plans" },
  { label: "Restaurants", href: "/admin/restaurants" },
  { label: "Payments", href: "/admin/payments" },
  { label: "Releases", href: "/admin/releases" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      {TABS.map((tab) => {
        const isActive = tab.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "shrink-0 border-b-2 px-3 pb-3 text-sm font-medium whitespace-nowrap transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
