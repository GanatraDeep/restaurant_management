import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/marketing/reveal";
import { Button } from "@/components/ui/button";

export function GetStartedSection() {
  return (
    <section id="get-started" className="px-4 py-24 sm:px-6">
      <Reveal className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-primary/20 bg-primary/5 px-6 py-16 text-center sm:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--primary),transparent_85%),transparent)]"
        />
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Set up your restaurant in minutes
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Create your account, add your logo, and your branded workspace is
          ready — menu, tables, and POS included.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" className="h-11 px-6 text-[15px]" nativeButton={false} render={<Link href="/signup" />}>
            Create your account
            <ArrowRight className="size-4" data-icon="inline-end" />
          </Button>
          <Button variant="outline" size="lg" className="h-11 px-6 text-[15px]" nativeButton={false} render={<Link href="/login" />}>
            I already have an account
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
