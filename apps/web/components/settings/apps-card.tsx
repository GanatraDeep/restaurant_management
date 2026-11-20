"use client";

import { Download, MonitorDown, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useCurrentUser } from "@/hooks/use-auth";
import { useAppDownloads } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

const linkButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90";

/**
 * Where an owner gets Annapurna on their devices: the Android app, the
 * Windows desktop app (silent printing, kitchen + counter printers) and, for
 * iPhone, the website added to the home screen. Owners only.
 */
export function AppsCard() {
  const { data: me } = useCurrentUser();
  const isOwner = me?.user.roleName === "OWNER" || !!me?.user.isSuperAdmin;
  const { data } = useAppDownloads(isOwner);
  if (!isOwner || !data) return null;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div>
        <h2 className="text-[18px] font-medium text-foreground">Apps</h2>
        <p className="text-sm text-muted-foreground">
          Install Annapurna on your restaurant&rsquo;s devices. Only you (the owner) see these downloads.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <AppTile
          icon={<Smartphone className="h-5 w-5" />}
          title="Android"
          body="Phones and tablets. After downloading, open the file and allow installing from this source if Android asks."
        >
          {data.androidApkUrl ? (
            <a href={data.androidApkUrl} target="_blank" rel="noopener noreferrer" className={linkButton}>
              <Download className="h-4 w-4" /> Download APK
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">Not available yet.</p>
          )}
        </AppTile>

        <AppTile
          icon={<MonitorDown className="h-5 w-5" />}
          title={`Windows desktop${data.desktopAppVersion ? ` · ${data.desktopAppVersion}` : ""}`}
          body="For the counter computer: KOTs and bills print straight to your printers with no print dialog, with a separate kitchen and counter printer."
        >
          {data.desktopAppUrl ? (
            <a href={data.desktopAppUrl} target="_blank" rel="noopener noreferrer" className={linkButton}>
              <Download className="h-4 w-4" /> Download for Windows
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">Coming soon.</p>
          )}
        </AppTile>

        <AppTile
          icon={<Smartphone className="h-5 w-5" />}
          title="iPhone / iPad"
          body="No download needed — use the website in Safari:"
        >
          <ol className="list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
            <li>Open this site in Safari and sign in.</li>
            <li>Tap the Share button.</li>
            <li>Choose &ldquo;Add to Home Screen&rdquo;.</li>
          </ol>
        </AppTile>
      </div>
    </Card>
  );
}

function AppTile({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border border-border p-4")}>
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </p>
      <p className="flex-1 text-xs text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}
