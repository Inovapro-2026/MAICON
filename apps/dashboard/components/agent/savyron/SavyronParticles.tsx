import { useEffect, useRef } from "react";
import type { SavyronState } from "./types";

interface SavyronParticlesProps {
  state: SavyronState;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  maxAlpha: number;
  pulseSpeed: number;
  color: string;
}

/** Partículas ambientais de fundo (ruído visual, NÃO simula estado do agente). */
export function SavyronParticles({ state }: SavyronParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };

    window.addEventListener("resize", handleResize);

    const isMobile = window.innerWidth < 768;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const particleCount = isMobile ? 16 : 36;
    const particles: Particle[] = [];

    const colors = [
      "rgba(56, 189, 248, ",
      "rgba(147, 51, 234, ",
      "rgba(99, 102, 241, ",
      "rgba(6, 182, 212, ",
    ];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25 - 0.05,
        size: Math.random() * (isMobile ? 1.5 : 2) + 1,
        alpha: Math.random() * 0.4 + 0.1,
        maxAlpha: Math.random() * 0.45 + 0.15,
        pulseSpeed: Math.random() * 0.015 + 0.005,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let speedMultiplier = 1;
    let glowFactor = isMobile ? 1 : 3;
    let extraAlpha = 0;
    if (state === "thinking") {
      speedMultiplier = isMobile ? 1.8 : 2.6;
      glowFactor = isMobile ? 2 : 6;
      extraAlpha = 0.25;
    } else if (state === "processing") {
      speedMultiplier = isMobile ? 1.5 : 2.2;
      glowFactor = isMobile ? 2 : 5;
      extraAlpha = 0.15;
    } else if (state === "listening") {
      speedMultiplier = 0.8;
    } else if (state === "speaking") {
      speedMultiplier = 1.4;
      glowFactor = isMobile ? 2 : 4;
    }

    const render = () => {
      ctx!.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (!prefersReducedMotion) {
          p.x += p.vx * speedMultiplier;
          p.y += p.vy * speedMultiplier;

          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;

          p.alpha += p.pulseSpeed * (state === "thinking" ? 1.6 : 1);
          if (p.alpha > p.maxAlpha + extraAlpha || p.alpha < 0.05) {
            p.pulseSpeed = -p.pulseSpeed;
          }
        }

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size * (state === "thinking" ? 1.25 : 1), 0, Math.PI * 2);
        ctx!.fillStyle = `${p.color}${Math.max(0, Math.min(1, p.alpha + extraAlpha * 0.5))})`;
        if (!isMobile) {
          ctx!.shadowColor = p.color === colors[0] ? "#00f5ff" : "#a855f7";
          ctx!.shadowBlur = p.size * glowFactor;
        }
        ctx!.fill();
        if (!isMobile) {
          ctx!.shadowBlur = 0;
        }
      }

      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-0 opacity-80"
      style={{ mixBlendMode: "screen" }}
    />
  );
}