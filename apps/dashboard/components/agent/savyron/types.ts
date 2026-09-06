/**
 * Tipos do núcleo visual MAICON portado para o SAVYRON.
 * `SavyronState` ganhou `error` (só o tipo; os componentes tratam por default).
 * Removidas todas as métricas fictícias do MAICON original.
 */

export type SavyronState = "idle" | "thinking" | "listening" | "speaking" | "processing" | "error";

export type SavyronModuleId =
  | "pesquisa"
  | "objetivo"
  | "planeja"
  | "comunica"
  | "executa"
  | "analisa"
  | "aprende";

export interface SavyronModuleData {
  id: SavyronModuleId;
  label: string;
  order: number;
  position:
    | "top-left"
    | "top"
    | "top-right"
    | "mid-left"
    | "mid-right"
    | "bottom-left"
    | "bottom-right";
  floatDuration: number;
}

export interface SavyronAIBackgroundProps {
  state?: SavyronState;
  activeModule?: SavyronModuleId | null;
  onModuleSelect?: (moduleId: SavyronModuleId | null) => void;
  audioAmplitude?: number;
  className?: string;
  showFloorReflection?: boolean;
  showStatusPill?: boolean;
}