"use client";

import { ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformAdminActions, usePlatformAdmins } from "@/hooks/use-admin";
import { useCurrentUser } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

/**
 * The platform team. The super admin from the server's SUPER_ADMIN_EMAILS
 * adds and removes the others; every admin opens this console.
 */
export default function AdminsPage() {
  const { data: me } = useCurrentUser();
  const isRoot = !!me?.user.isRootAdmin;
  const { data, isLoading } = usePlatformAdmins();
  const { add, remove } = usePlatformAdminActions();
  const [f, setF] = useState({ email: "", name: "", phone: "", password: "" });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    add.mutate(
      {
        email: f.email.trim(),
        name: f.name.trim() || undefined,
        phone: f.phone.trim() || undefined,
        password: f.password || undefined,
      },
      {
        onSuccess: (r) => {
          toast.success(r.created ? `Account created — ${f.email} can sign in now` : `${f.email} is now an admin`);
          setF({ email: "", name: "", phone: "", password: "" });
        },
        onError: (err) => toast.error(errMsg(err)),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {isRoot && (
        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <UserPlus className="h-5 w-5" /> Add an admin
            </h2>
            <p className="text-sm text-muted-foreground">
              Someone who already has an F Cartel account: enter their email. Someone new: also give a name and a password
              — they get an account that opens only this admin console.
            </p>
          </div>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adm-email">Email</Label>
              <Input id="adm-email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adm-name">Name (new account only)</Label>
              <Input id="adm-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adm-phone">WhatsApp number (optional)</Label>
              <Input id="adm-phone" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adm-pass">Password (new account only)</Label>
              <PasswordInput id="adm-pass" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={!f.email.trim() || add.isPending}>{add.isPending ? "Adding…" : "Add admin"}</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="flex flex-col divide-y divide-border p-0">
        {isLoading ? (
          <Skeleton className="m-4 h-16" />
        ) : (
          (data ?? []).map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                  {a.name}
                  {a.root && <Badge variant="secondary">Super admin · server</Badge>}
                  {!a.isActive && <Badge variant="outline">Switched off</Badge>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[a.email, a.phone, a.restaurantName].filter(Boolean).join(" · ")}
                </p>
              </div>
              {isRoot && !a.root && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    confirm(`Remove ${a.name} as an admin?`) &&
                    remove.mutate(a.id, { onSuccess: () => toast.success("Removed"), onError: (e) => toast.error(errMsg(e)) })
                  }
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              )}
            </div>
          ))
        )}
      </Card>
      {!isRoot && (
        <p className="text-sm text-muted-foreground">Only the super admin set on the server can add or remove admins.</p>
      )}
    </div>
  );
}
