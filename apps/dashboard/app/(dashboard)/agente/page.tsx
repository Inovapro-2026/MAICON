import { DashboardShell } from "@/components/layout/shell";
import { AgentTab } from "@/components/agent/agent-tab";
import { AgentTabV2 } from "@/components/agent/agent-tab-v2";
import "./agent.css";

export default function AgentPage() {
  // Feature flag do núcleo visual MAICON (V2).
  // ON por padrão (rollback = SAVYRON_AGENT_CORE_V2=false no ambiente).
  const coreV2 = process.env.SAVYRON_AGENT_CORE_V2 !== "false";

  return (
    <DashboardShell title="Agente" hideHeader fullBleed>
      {coreV2 ? <AgentTabV2 /> : <AgentTab />}
    </DashboardShell>
  );
}