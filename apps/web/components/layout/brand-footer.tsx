import { LifeBuoy } from "lucide-react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

// One compact line: a small support link and the "Powered by" credit,
// both centred, so the footer never eats into the menu on a phone.
export function BrandFooter() {
  return (
    <div className="flex flex-col items-center gap-1 border-t border-sidebar-border px-4 py-2">
      {BRAND.supportUrl && (
        <a
          href={BRAND.supportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LifeBuoy className="h-3 w-3" />
          Contact support
        </a>
      )}
      <Link
        href="/docs"
        className="text-center text-[11px] leading-tight text-sidebar-foreground/60 hover:text-sidebar-foreground hover:underline"
      >
        Powered by <span className="font-semibold">{BRAND.name}</span>
      </Link>
    </div>
  );
}
