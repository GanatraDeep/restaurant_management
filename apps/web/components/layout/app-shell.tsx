"use client";

import type { SessionUser } from "@nodedr-restaurant/types";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { EntityDialogHost } from "@/components/layout/entity-dialog-host";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useRestaurantBranding } from "@/hooks/use-settings";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { BrandFooter } from "./brand-footer";
import { BranchSwitcher } from "./branch-switcher";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

// The restaurant's own logo + name lead the sidebar header — F Cartel is
// white-label, so the operator's branding takes the prime spot an operator
// actually looks at. The F Cartel mark moves to a small "Powered by" credit
// at the bottom (BrandFooter) instead of competing with it up here. A
// restaurant that hasn't uploaded a logo yet gets a monogram of its name
// rather than the F Cartel mark; the product mark only shows while settings
// are still loading.
function RestaurantBrand() {
  const { data: restaurant } = useRestaurantBranding();

  if (!restaurant) {
    return (
      <>
        <Logo />
        <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
          {BRAND.name}
        </span>
      </>
    );
  }

  return (
    <>
      {restaurant.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded asset served from the backend, not a Next-optimizable remote source
        <img
          src={restaurant.logoUrl}
          alt={restaurant.name}
          className="h-8 w-8 shrink-0 rounded-lg object-contain"
        />
      ) : (
        <div
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary"
        >
          {restaurant.name.trim().charAt(0).toUpperCase()}
        </div>
      )}
      <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
        {restaurant.name}
      </span>
    </>
  );
}

const SIDEBAR_KEY = "fcartel:sidebar";

export function AppShell({
  user,
  children,
}: {
  user?: SessionUser;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop sidebar: closed by default for more working room; the menu
  // button opens it, and the choice is remembered on this device.
  const [desktopOpen, setDesktopOpen] = useState(false);
  useEffect(() => {
    try {
      // localStorage only exists after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDesktopOpen(localStorage.getItem(SIDEBAR_KEY) === "open");
    } catch {
      // Storage blocked: stays closed.
    }
  }, []);
  const toggleMenu = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setDesktopOpen((open) => {
        try {
          localStorage.setItem(SIDEBAR_KEY, open ? "closed" : "open");
        } catch {
          // Not remembered; still toggles.
        }
        return !open;
      });
    } else {
      setMobileOpen(true);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className={cn("hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar", desktopOpen && "lg:flex")}>
        <div className="flex h-16 items-center gap-2 px-5">
          <RestaurantBrand />
        </div>
        <div className="px-3 pb-3">
          <BranchSwitcher />
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <SidebarNav user={user} />
        </div>
        <BrandFooter />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-16 items-center gap-2 px-5">
            <RestaurantBrand />
          </div>
          <div className="px-3 pb-3">
            <BranchSwitcher />
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            <SidebarNav user={user} onNavigate={() => setMobileOpen(false)} />
          </div>
          <BrandFooter />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={toggleMenu}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
              aria-label={desktopOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={desktopOpen}
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* With the sidebar closed, the restaurant's name moves up here. */}
            {!desktopOpen && (
              <div className="hidden min-w-0 items-center gap-2 lg:flex">
                <RestaurantBrand />
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher compact />
            <NotificationBell />
            <UserMenu user={user} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8">{children}</main>
        <EntityDialogHost />
      </div>
      <MobileBottomNav user={user} onMore={() => setMobileOpen(true)} />
    </div>
  );
}
