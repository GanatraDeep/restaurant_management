"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { openSampleKotPrint } from "@/lib/print";

const STEPS = [
  "Install your receipt printer on this computer or tablet with its own driver, and print the printer's self-test once to check it works.",
  'In the driver settings, set the paper to 80 mm (or 58 mm) roll and turn "Darkness" / "Density" up if the print is light.',
  "Press Print a test KOT. In the print dialog pick the receipt printer, set Margins to None and Scale to 100% (Default), and turn off Headers and footers.",
  "The browser remembers these choices, so later KOTs and bills only need one click on Print.",
];

/** Everything prints through the browser's print dialog — explain the one-time setup. */
export function PrintingCard() {
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[18px] font-medium text-foreground">Printing</h2>
          <p className="text-sm text-muted-foreground">
            KOTs, bills and receipts print through your browser to any printer connected to the device you&rsquo;re using.
          </p>
        </div>
        <Button variant="outline" className="shrink-0" onClick={openSampleKotPrint}>
          <Printer className="h-4 w-4" />
          Print a test KOT
        </Button>
      </div>

      <ol className="flex flex-col gap-2 text-sm text-foreground">
        {STEPS.map((step, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium tabular-nums">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
        Want KOTs to print without the dialog each time? On a dedicated kitchen or billing PC, start Chrome with the{" "}
        <code className="rounded bg-background px-1 py-0.5 text-[11px] text-foreground">--kiosk-printing</code> option (add it to the
        shortcut&rsquo;s Target) — it then prints straight to the default printer.
      </p>
    </Card>
  );
}
