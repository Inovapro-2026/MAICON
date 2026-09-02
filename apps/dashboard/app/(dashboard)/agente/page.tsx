import { DashboardShell } from "@/components/layout/shell";
import { AgentTab } from "@/components/agent/agent-tab";
import "./agent.css";

export default function AgentPage() {
  return (
    <DashboardShell title="Agente">
      <AgentTab />
    </DashboardShell>
  );
}
