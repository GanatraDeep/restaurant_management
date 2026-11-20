"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ChecklistsTab } from "@/components/sop/checklists-tab";
import { ComplianceTab } from "@/components/sop/compliance-tab";
import { PlaybooksTab } from "@/components/sop/playbooks-tab";
import { SopsTab } from "@/components/sop/sops-tab";
import { OverviewTab, TrainingTab } from "@/components/sop/training-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n/context";

const TABS = ["sops", "checklists", "playbooks", "licences", "training", "overview"] as const;
type Tab = (typeof TABS)[number];
const MANAGER_ONLY: Tab[] = ["licences", "training", "overview"];

function KitchenSops() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const { data: me } = useCurrentUser();
  const canManage = hasPermission(me?.user, "sop.manage");
  const tabs = TABS.filter((x) => canManage || !MANAGER_ONLY.includes(x));
  const asked = params.get("tab") as Tab | null;
  const tab: Tab = asked && tabs.includes(asked) ? asked : "sops";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{t("nav.sop")}</h1>
        <p className="text-sm text-muted-foreground">{t("sop.subtitle")}</p>
      </div>
      <Tabs value={tab} onValueChange={(v) => router.replace(`/sop?tab=${v}`, { scroll: false })}>
        {/* Scrolls sideways on phones instead of squeezing six labels together. */}
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <TabsList className="h-10 w-max max-w-none justify-start">
            {tabs.map((x) => (
              <TabsTrigger key={x} value={x} className="h-full flex-none px-3.5">{t(`sop.tab.${x}`)}</TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="sops" className="pt-2"><SopsTab canManage={canManage} /></TabsContent>
        <TabsContent value="checklists" className="pt-2"><ChecklistsTab canManage={canManage} /></TabsContent>
        <TabsContent value="playbooks" className="pt-2"><PlaybooksTab canManage={canManage} /></TabsContent>
        {canManage && (
          <>
            <TabsContent value="licences" className="pt-2"><ComplianceTab /></TabsContent>
            <TabsContent value="training" className="pt-2"><TrainingTab /></TabsContent>
            <TabsContent value="overview" className="pt-2"><OverviewTab /></TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

export default function KitchenSopsPage() {
  return (
    <Suspense>
      <KitchenSops />
    </Suspense>
  );
}
