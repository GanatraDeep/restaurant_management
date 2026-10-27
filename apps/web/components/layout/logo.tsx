import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function Logo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <Image
      src={BRAND.logoSrc}
      alt={BRAND.name}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-lg object-contain", className)}
      priority
    />
  );
}
