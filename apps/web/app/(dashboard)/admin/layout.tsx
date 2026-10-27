"use client";

import { AdminTabs } from "@/components/admin/admin-tabs";
import { useCurrentUser } from "@/hooks/use-auth";

// F Cartel super-admin console: subscription plans, free trials, and every
// restaurant's subscription. The API enforces super-admin access too
// (SuperAdminGuard); this just avoids rendering pages that would 403.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data } = useCurrentUser();

  if (!data?.user.isSuperAdmin) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-center text-sm text-muted-foreground">
        The admin console is only available to F Cartel super admins.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[32px]">Admin console</h1>
        <p className="text-sm text-muted-foreground">Subscription plans, free trials, and restaurant billing</p>
      </div>
      <AdminTabs />
      {children}
    </div>
  );
}
