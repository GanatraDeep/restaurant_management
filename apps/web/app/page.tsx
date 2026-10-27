"use client";

import { MotionConfig } from "motion/react";
import { AuthRedirectGate } from "@/components/marketing/auth-redirect-gate";
import { BrandingSection } from "@/components/marketing/branding-section";
import { Features } from "@/components/marketing/features";
import { GetStartedSection } from "@/components/marketing/get-started-section";
import { Hero } from "@/components/marketing/hero";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { ProductShowcase } from "@/components/marketing/product-showcase";
import { SecuritySection } from "@/components/marketing/security-section";

// F Cartel's public landing page. Every visitor gets it (any number of
// restaurants can sign up); an already-signed-in visitor is sent straight
// to their own branded dashboard by AuthRedirectGate.
export default function MarketingHomePage() {
  return (
    // reducedMotion="user" makes every Motion animation on this page defer
    // to the OS prefers-reduced-motion setting automatically (transforms
    // swap for instant/opacity-only changes) instead of threading
    // useReducedMotion() through every component individually.
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-full flex-col">
        <AuthRedirectGate />
        <MarketingNav />
        <main id="main-content">
          <Hero />
          <ProductShowcase />
          <Features />
          <BrandingSection />
          <SecuritySection />
          <GetStartedSection />
        </main>
        <MarketingFooter />
      </div>
    </MotionConfig>
  );
}
