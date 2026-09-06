import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { SavyronAIBackgroundProps, SavyronModuleData, SavyronModuleId } from "./types";
import { SavyronCore } from "./SavyronCore";
import { SavyronModule } from "./SavyronModule";
import { SavyronConnection } from "./SavyronConnection";
import { SavyronParticles } from "./SavyronParticles";
import { SavyronStatus } from "./SavyronStatus";

const MODULES: SavyronModuleData[] = [
  { id: "pesquisa", label: "PESQUISA", order: 1, position: "top-left", floatDuration: 4.8 },
  { id: "objetivo", label: "OBJETIVO", order: 2, position: "top", floatDuration: 5.2 },
  { id: "planeja", label: "PLANEJA", order: 3, position: "mid-left", floatDuration: 4.5 },
  { id: "comunica", label: "COMUNICA", order: 4, position: "top-right", floatDuration: 5.5 },
  { id: "executa", label: "EXECUTA", order: 5, position: "bottom-left", floatDuration: 4.9 },
  { id: "analisa", label: "ANALISA", order: 6, position: "mid-right", floatDuration: 5.3 },
  { id: "aprende", label: "APRENDE", order: 7, position: "bottom-right", floatDuration: 4.7 },
];

interface SavyronAIProps extends SavyronAIBackgroundProps {
  children?: ReactNode;
}

/** Composição de fundo full-bleed do núcleo visual (portada do MAICON, sem métricas fictícias). */
export function SavyronAIBackground({
  state = "idle",
  activeModule: controlledActiveModule,
  onModuleSelect,
  audioAmplitude = 0.5,
  className = "",
  showFloorReflection = true,
  showStatusPill = true,
  children,
}: SavyronAIProps) {
  const [hoveredModule, setHoveredModule] = useState<SavyronModuleId | null>(null);
  const [internalActiveModule, setInternalActiveModule] = useState<SavyronModuleId | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [mobileCoreScale, setMobileCoreScale] = useState<number>(0.68);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeModule =
    controlledActiveModule !== undefined ? controlledActiveModule : internalActiveModule;

  const handleModuleClick = (id: SavyronModuleId) => {
    const next = activeModule === id ? null : id;
    if (controlledActiveModule === undefined) {
      setInternalActiveModule(next);
    }
    onModuleSelect?.(next);
  };

  const activeModuleData = MODULES.find((m) => m.id === (hoveredModule || activeModule));

  useEffect(() => {
    const computeViewport = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const mobile = vw < 768;
      setIsMobile(mobile);

      if (mobile) {
        const scaleW = (vw - 32) / 440;
        const scaleH = (vh * 0.45) / 420;
        setMobileCoreScale(Math.min(Math.max(0.58, Math.min(scaleW, scaleH)), 0.78));
      } else {
        const targetW = 1000;
        const targetH = 700;
        const scaleX = (vw - 40) / targetW;
        const scaleY = (vh - 170) / targetH;
        const computed = Math.min(scaleX, scaleY, 1.1);
        setScale(Math.max(0.68, computed));
      }
    };

    computeViewport();
    window.addEventListener("resize", computeViewport);
    return () => window.removeEventListener("resize", computeViewport);
  }, []);

  return (
    <div
      ref={containerRef}
      id="savyron-ai-background-container"
      className={`relative w-full h-[100dvh] min-h-[100dvh] overflow-hidden bg-[#03050D] flex flex-col items-center justify-center select-none ${className}`}
      style={{
        background:
          "radial-gradient(ellipse at 50% 45%, #0a1329 0%, #060b18 45%, #03050D 100%)",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div
        className="absolute top-[12%] sm:top-[15%] md:top-[17%] left-1/2 -translate-x-1/2 pointer-events-none select-none z-0 flex flex-col items-center justify-center w-full max-w-[100vw] overflow-hidden px-4"
        aria-hidden="true"
      >
        <div className="relative flex flex-col items-center">
          <span
            className="font-black tracking-[0.14em] sm:tracking-[0.20em] md:tracking-[0.26em] uppercase text-transparent bg-clip-text text-center whitespace-nowrap"
            style={{
              fontSize: "clamp(2.75rem, 14vw, 12rem)",
              lineHeight: 0.85,
              backgroundImage:
                "linear-gradient(180deg, rgba(147, 197, 253, 0.16) 0%, rgba(99, 102, 241, 0.08) 50%, rgba(168, 85, 247, 0.03) 100%)",
              filter:
                "drop-shadow(0 0 25px rgba(59, 130, 246, 0.18)) drop-shadow(0 0 60px rgba(139, 92, 246, 0.10))",
            }}
          >
            SAVYRON
          </span>
          <div className="w-[70%] max-w-[620px] h-[1px] mt-1 sm:mt-2 bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent" />
        </div>
      </div>

      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-900/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-violet-900/15 rounded-full blur-[120px] pointer-events-none" />

      <div className="absolute inset-0 opacity-15 bg-dot-matrix animate-drift pointer-events-none" />

      <div
        className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[580px] pointer-events-none rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(0, 180, 255, 0.16) 0%, rgba(139, 92, 246, 0.09) 45%, transparent 75%)",
          filter: "blur(75px)",
        }}
      />

      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none opacity-40 mix-blend-screen hidden lg:block">
        <div
          className="absolute left-[-20px] top-[40%] -translate-y-1/2 w-48 h-80 rounded-full blur-[30px]"
          style={{
            background:
              "radial-gradient(circle, rgba(14, 165, 233, 0.08) 0%, rgba(3, 5, 13, 0.95) 75%)",
          }}
        />
        <div
          className="absolute right-[-10px] top-[45%] -translate-y-1/2 w-40 h-72 rounded-full blur-[30px]"
          style={{
            background:
              "radial-gradient(circle, rgba(168, 85, 247, 0.08) 0%, rgba(3, 5, 13, 0.95) 75%)",
          }}
        />
      </div>

      <SavyronParticles state={state} />

      {isMobile ? (
        <div className="relative z-10 flex flex-col items-center justify-between w-full h-full pt-16 pb-28 px-3 overflow-hidden">
          <div className="relative flex flex-col items-center justify-center flex-1 w-full max-h-[50vh] min-h-[220px]">
            <div
              className="transition-transform duration-300 origin-center"
              style={{ transform: `scale(${mobileCoreScale})` }}
            >
              <SavyronCore
                state={state}
                audioAmplitude={audioAmplitude}
                activeModuleName={activeModuleData?.label}
              />
            </div>
          </div>

          <div className="w-full flex flex-col items-center gap-1.5 shrink-0 z-20">
            <div className="flex items-center gap-2 mb-0.5 opacity-70">
              <div className="w-7 h-[1px] bg-gradient-to-r from-transparent to-cyan-400" />
              <span className="text-[8.5px] font-mono tracking-[0.25em] text-cyan-300 uppercase">
                7 MÓDULOS CONECTADOS
              </span>
              <div className="w-7 h-[1px] bg-gradient-to-l from-transparent to-cyan-400" />
            </div>

            <div className="w-full max-w-full overflow-x-auto no-scrollbar py-1.5 px-2 flex items-center gap-2 snap-x touch-pan-x">
              {MODULES.map((m) => (
                <div key={m.id} className="snap-center shrink-0">
                  <SavyronModule
                    id={m.id}
                    label={m.label}
                    floatDuration={m.floatDuration}
                    isActive={activeModule === m.id}
                    isHovered={hoveredModule === m.id}
                    systemState={state}
                    compact={true}
                    onHover={(h) => setHoveredModule(h ? m.id : null)}
                    onClick={() => handleModuleClick(m.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="relative transition-transform duration-200 ease-out origin-center z-10"
          style={{ width: 1000, height: 720, transform: `scale(${scale})` }}
        >
          <SavyronConnection
            activeModule={activeModule}
            hoveredModule={hoveredModule}
            state={state}
          />

          <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: 500, top: 340 }}>
            <SavyronCore
              state={state}
              audioAmplitude={audioAmplitude}
              activeModuleName={activeModuleData?.label}
            />
          </div>

          <div className="absolute z-20" style={{ left: 500 - 73, top: 38 }}>
            <SavyronModule
              id="objetivo"
              label="OBJETIVO"
              floatDuration={5.2}
              isActive={activeModule === "objetivo"}
              isHovered={hoveredModule === "objetivo"}
              systemState={state}
              onHover={(h) => setHoveredModule(h ? "objetivo" : null)}
              onClick={() => handleModuleClick("objetivo")}
            />
          </div>
          <div className="absolute z-20" style={{ left: 95, top: 115 }}>
            <SavyronModule
              id="pesquisa"
              label="PESQUISA"
              floatDuration={4.8}
              isActive={activeModule === "pesquisa"}
              isHovered={hoveredModule === "pesquisa"}
              systemState={state}
              onHover={(h) => setHoveredModule(h ? "pesquisa" : null)}
              onClick={() => handleModuleClick("pesquisa")}
            />
          </div>
          <div className="absolute z-20" style={{ left: 86, top: 280 }}>
            <SavyronModule
              id="planeja"
              label="PLANEJA"
              floatDuration={4.5}
              isActive={activeModule === "planeja"}
              isHovered={hoveredModule === "planeja"}
              systemState={state}
              onHover={(h) => setHoveredModule(h ? "planeja" : null)}
              onClick={() => handleModuleClick("planeja")}
            />
          </div>
          <div className="absolute z-20" style={{ left: 100, top: 445 }}>
            <SavyronModule
              id="executa"
              label="EXECUTA"
              floatDuration={4.9}
              isActive={activeModule === "executa"}
              isHovered={hoveredModule === "executa"}
              systemState={state}
              onHover={(h) => setHoveredModule(h ? "executa" : null)}
              onClick={() => handleModuleClick("executa")}
            />
          </div>
          <div className="absolute z-20" style={{ left: 760, top: 115 }}>
            <SavyronModule
              id="comunica"
              label="COMUNICA"
              floatDuration={5.5}
              isActive={activeModule === "comunica"}
              isHovered={hoveredModule === "comunica"}
              systemState={state}
              onHover={(h) => setHoveredModule(h ? "comunica" : null)}
              onClick={() => handleModuleClick("comunica")}
            />
          </div>
          <div className="absolute z-20" style={{ left: 770, top: 280 }}>
            <SavyronModule
              id="analisa"
              label="ANALISA"
              floatDuration={5.3}
              isActive={activeModule === "analisa"}
              isHovered={hoveredModule === "analisa"}
              systemState={state}
              onHover={(h) => setHoveredModule(h ? "analisa" : null)}
              onClick={() => handleModuleClick("analisa")}
            />
          </div>
          <div className="absolute z-20" style={{ left: 755, top: 445 }}>
            <SavyronModule
              id="aprende"
              label="APRENDE"
              floatDuration={4.7}
              isActive={activeModule === "aprende"}
              isHovered={hoveredModule === "aprende"}
              systemState={state}
              onHover={(h) => setHoveredModule(h ? "aprende" : null)}
              onClick={() => handleModuleClick("aprende")}
            />
          </div>

          {showStatusPill && (
            <div className="absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left: 500, top: 652 }}>
              <SavyronStatus state={state} />
            </div>
          )}

          {showFloorReflection && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] max-w-[90vw] h-32 pointer-events-none z-10">
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
              <div className="absolute top-0 inset-x-0 h-full bg-gradient-to-b from-blue-900/10 to-transparent opacity-50" />
              <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[400px] h-[40px] bg-blue-500/20 blur-3xl rounded-full" />
            </div>
          )}
        </div>
      )}

      {children && <div className="relative z-30 w-full">{children}</div>}
    </div>
  );
}