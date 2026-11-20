"use client";

import { Download, MonitorDown, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminSettings, useUpdateAdminSettings, type AdminPlatformSettings } from "@/hooks/use-admin";
import { ApiError } from "@/lib/api";

/**
 * The links restaurant owners download the apps from (Settings -> Apps):
 * the Android APK and the Windows desktop app — e.g. Google Drive share links
 * to the latest build. Changing a link here updates every owner's page.
 */
export function AppDownloadsCard() {
  const { data: settings } = useAdminSettings();
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Download className="h-5 w-5 text-muted-foreground" /> App downloads
        </h2>
        <p className="text-sm text-muted-foreground">
          Links restaurant owners see under Settings → Apps. Upload a new build (e.g. to Google Drive, shared as
          &ldquo;Anyone with the link&rdquo;) and paste its link here.
        </p>
      </div>
      {settings ? <Form key={JSON.stringify(settings)} settings={settings} /> : <Skeleton className="h-40" />}
    </Card>
  );
}

function Form({ settings }: { settings: AdminPlatformSettings }) {
  const update = useUpdateAdminSettings();
  const [apk, setApk] = useState(settings.androidApkUrl ?? "");
  const [desktop, setDesktop] = useState(settings.desktopAppUrl ?? "");
  const [version, setVersion] = useState(settings.desktopAppVersion ?? "");
  const dirty =
    apk !== (settings.androidApkUrl ?? "") ||
    desktop !== (settings.desktopAppUrl ?? "") ||
    version !== (settings.desktopAppVersion ?? "");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate(
          { androidApkUrl: apk.trim(), desktopAppUrl: desktop.trim(), desktopAppVersion: version.trim() },
          {
            onSuccess: () => toast.success("Download links saved"),
            onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not save"),
          },
        );
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="apk-url" className="flex items-center gap-1.5">
          <Smartphone className="h-4 w-4 text-muted-foreground" /> Android app (APK) link
        </Label>
        <Input id="apk-url" type="url" placeholder="https://drive.google.com/file/d/…" value={apk} onChange={(e) => setApk(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="desktop-url" className="flex items-center gap-1.5">
            <MonitorDown className="h-4 w-4 text-muted-foreground" /> Windows desktop app link
          </Label>
          <Input
            id="desktop-url"
            type="url"
            placeholder="https://drive.google.com/file/d/…"
            value={desktop}
            onChange={(e) => setDesktop(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="desktop-version">Version</Label>
          <Input id="desktop-version" placeholder="1.2.0" maxLength={20} value={version} onChange={(e) => setVersion(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Leave the desktop link empty to hide that download. An empty Android link falls back to the built-in Annapurna APK.
      </p>
      <Button type="submit" className="self-start" disabled={!dirty || update.isPending}>
        {update.isPending ? "Saving…" : "Save links"}
      </Button>
    </form>
  );
}
