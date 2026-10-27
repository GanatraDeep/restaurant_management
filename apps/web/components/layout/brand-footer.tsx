import { LifeBuoy } from "lucide-react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

export function BrandFooter() {
  return (
    <div className="flex flex-col gap-2 border-t border-sidebar-border px-4 py-3">
      {BRAND.supportUrl && (
        <a
          href={BRAND.supportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-sidebar-border px-3 py-1.5 text-xs font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LifeBuoy className="h-3.5 w-3.5" />
          Contact support
        </a>
      )}
      <Link
        href="/docs"
        className="text-left text-xs leading-tight text-sidebar-foreground/60 hover:text-sidebar-foreground hover:underline"
      >
        Powered by <span className="font-semibold">{BRAND.name}</span>
      </Link>
    </div>
  );
}
