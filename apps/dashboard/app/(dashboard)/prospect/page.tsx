"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Upload } from "lucide-react";
import { DashboardShell } from "@/components/layout/shell";
import { ProspectTab } from "@/components/prospect/prospect-tab";
import { ImportTab } from "@/components/prospect/import-tab";

function ProspectHub() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab");

  const active = tab === "import" ? "import" : "prospect";

  const setTab = (next: "prospect" | "import") => {
    router.replace(next === "import" ? "/prospect?tab=import" : "/prospect");
  };

  return (
    <>
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setTab("prospect")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
            active === "prospect"
              ? "bg-emerald-600 text-white shadow-sm"
              : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
          }`}
        >
          <Search className="h-4 w-4" /> Prospecção web
        </button>
        <button
          onClick={() => setTab("import")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
            active === "import"
              ? "bg-emerald-600 text-white shadow-sm"
              : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
          }`}
        >
          <Upload className="h-4 w-4" /> Importação manual
        </button>
      </div>

      {active === "prospect" ? <ProspectTab /> : <ImportTab />}
    </>
  );
}

export default function ProspectPage() {
  return (
    <DashboardShell title="Prospecção">
      <Suspense
        fallback={
          <div className="py-10 text-center text-sm text-zinc-500">
            Carregando…
          </div>
        }
      >
        <ProspectHub />
      </Suspense>
    </DashboardShell>
  );
}
