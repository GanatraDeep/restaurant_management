"use client";

import { ChefHat, Printer, Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-auth";
import { useAppDownloads } from "@/hooks/use-settings";
import {
  desktopApp,
  desktopPrinters,
  type DesktopPrinter,
  type DesktopPrinterSettings,
} from "@/lib/print";

type Kind = "kot" | "bill" | "default";

const ROWS: { kind: Kind; label: string; hint: string; icon: typeof Printer }[] = [
  { kind: "kot", label: "Kitchen printer (KOTs)", hint: "Every KOT and token slip", icon: ChefHat },
  { kind: "bill", label: "Counter printer (bills)", hint: "Bills and receipts", icon: Receipt },
  { kind: "default", label: "Default printer", hint: "Used when the two above are left on default", icon: Printer },
];

/**
 * Two printers — one in the kitchen for KOTs, one at the counter for bills.
 * Only the Annapurna desktop app can send a print to a chosen printer without
 * a dialog, so the choice lives in the app (this card talks to it).
 */
export function DesktopPrinters() {
  // Only known in the browser (the app adds its bridge to window).
  const [app, setApp] = useState<ReturnType<typeof desktopApp>>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApp(desktopApp());
  }, []);
  const { data: me } = useCurrentUser();
  const isOwner = me?.user.roleName === "OWNER" || !!me?.user.isSuperAdmin;
  const { data: downloads } = useAppDownloads(isOwner && !!app?.outdated);
  const [printers, setPrinters] = useState<DesktopPrinter[] | null>(null);
  const [chosen, setChosen] = useState<DesktopPrinterSettings | null>(null);

  useEffect(() => {
    if (!app?.perKindPrinters) return;
    void Promise.all([desktopPrinters.list(), desktopPrinters.settings()]).then(([list, s]) => {
      setPrinters(list);
      setChosen(s);
    });
  }, [app]);

  if (!app) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-border p-4">
        <p className="text-sm font-medium text-foreground">Two printers — kitchen and counter?</p>
        <p className="text-xs text-muted-foreground">
          Use the Annapurna desktop app on the counter computer: it sends KOTs to the kitchen printer and bills to the
          counter printer, with no print dialog. Or keep a computer by the kitchen printer with the Kitchen Display open
          and <strong>Auto-print KOTs</strong> on, and print bills from the counter.
        </p>
      </div>
    );
  }

  if (app.outdated) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-warning/50 bg-warning/10 p-4">
        <p className="text-sm font-medium text-foreground">Update the Annapurna desktop app</p>
        <p className="text-xs text-muted-foreground">
          This is version {app.version}. Version 1.2 prints KOTs and bills without the print dialog and lets you pick a
          separate kitchen and counter printer here.
          {!downloads?.desktopAppUrl && !isOwner && " Ask the owner to download it from Settings → Apps."}
        </p>
        {downloads?.desktopAppUrl && (
          <a
            href={downloads.desktopAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Download the new version{downloads.desktopAppVersion ? ` (${downloads.desktopAppVersion})` : ""}
          </a>
        )}
      </div>
    );
  }

  const valueOf = (k: Kind) =>
    !chosen ? "" : k === "kot" ? chosen.kotPrinter : k === "bill" ? chosen.billPrinter : chosen.defaultPrinter;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-success/40 bg-success/5 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">Printers on this computer</p>
        <p className="text-xs text-muted-foreground">
          You&rsquo;re in the Annapurna desktop app {app.version}: prints go straight to these printers, no dialog. Saved on
          this computer.
        </p>
      </div>
      {ROWS.map(({ kind, label, hint, icon: Icon }) => (
        <div key={kind} className="grid items-center gap-1.5 sm:grid-cols-[1fr_16rem]">
          <div>
            <p className="flex items-center gap-1.5 text-sm text-foreground">
              <Icon className="h-4 w-4 text-muted-foreground" /> {label}
            </p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
          <select
            aria-label={label}
            disabled={!printers}
            value={valueOf(kind)}
            onChange={async (e) => {
              const name = e.target.value;
              const ok = await desktopPrinters.set(kind, name);
              if (!ok) return toast.error("Could not save the printer");
              setChosen(await desktopPrinters.settings());
              toast.success(`${label}: ${name || (kind === "default" ? "system default" : "same as default")}`);
            }}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">{kind === "default" ? "System default printer" : "Same as default printer"}</option>
            {(printers ?? []).map((p) => (
              <option key={p.name} value={p.name}>
                {p.displayName}
                {p.isDefault ? " (system default)" : ""}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
