"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/admin";

/**
 * Página que encerra o modo de suporte (impersonation): chama a API,
 * grava o novo token (sem empresa) e volta ao /admin.
 */
export default function ImpersonateExitPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await adminApi<{ token: string }>(
          "/admin/impersonate/exit",
          "POST",
        );
        if (cancelled) return;
        const res = await fetch("/api/auth/session/set", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: result.token }),
        });
        if (cancelled) return;
        if (res.ok) {
          router.push("/admin");
          router.refresh();
        } else {
          router.push("/admin");
        }
      } catch {
        router.push("/admin");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="text-sm text-zinc-500">Encerrando o modo de suporte...</div>
  );
}
