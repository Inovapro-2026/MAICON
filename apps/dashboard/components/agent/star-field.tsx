"use client";

import { useMemo } from "react";

interface Star {
  id: number;
  x: number; // percentage
  y: number; // percentage
  size: number; // px
  opacity: number;
  duration: number; // seconds
  delay: number; // seconds
  color: string;
}

// Cores sutis das estrelas para profundidade
const STAR_COLORS = [
  "#FFFFFF",
  "#E0F2FE", // ice blue
  "#BAE6FD", // light cyan
  "#C4B5FD", // soft purple
  "#DDD6FE", // soft violet
];

export function StarField() {
  // Geração determinística para evitar divergência de hidratação SSR
  const stars: Star[] = useMemo(() => {
    const list: Star[] = [];
    const count = 190;
    for (let i = 0; i < count; i++) {
      // Golden ratio and prime hashing for organic distribution
      const x = ((i * 37.77 + (i % 7) * 13.1) % 99) + 0.5;
      const y = ((i * 53.33 + (i % 11) * 7.9) % 99) + 0.5;
      const size = ((i % 5) === 0 ? 2.5 : (i % 3) === 0 ? 2 : 1.2);
      const opacity = 0.25 + ((i * 17) % 65) / 100;
      const duration = 2.4 + ((i * 19) % 36) / 10;
      const delay = ((i * 23) % 50) / 10;
      const color = STAR_COLORS[i % STAR_COLORS.length];

      list.push({
        id: i,
        x,
        y,
        size,
        opacity,
        duration,
        delay,
        color,
      });
    }
    return list;
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* Nebulosas radiais de fundo com profundidade sutil */}
      <div className="absolute -top-[15%] left-[15%] h-[550px] w-[550px] rounded-full bg-gradient-to-br from-[#6366F1]/15 to-[#8B5CF6]/10 blur-[120px]" />
      <div className="absolute top-[20%] right-[10%] h-[500px] w-[500px] rounded-full bg-gradient-to-bl from-[#A855F7]/12 to-[#EC4899]/08 blur-[130px]" />
      <div className="absolute bottom-[5%] left-[25%] h-[450px] w-[450px] rounded-full bg-gradient-to-tr from-[#38BDF8]/10 to-[#6366F1]/15 blur-[120px]" />

      {/* Brilho radial focado atrás do VoiceOrb */}
      <div className="absolute top-[28%] left-1/2 -translate-x-1/2 -translate-y-1/2 h-[420px] w-[420px] rounded-full bg-gradient-to-r from-[#6366F1]/20 via-[#8B5CF6]/25 to-[#EC4899]/15 blur-[80px]" />

      {/* Campo de estrelas */}
      {stars.map((star) => (
        <span
          key={star.id}
          className="star-particle"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            backgroundColor: star.color,
            boxShadow: star.size > 1.8 ? `0 0 ${star.size * 2}px ${star.color}` : "none",
            animationDuration: `${star.duration}s`,
            animationDelay: `${star.delay}s`,
            opacity: star.opacity,
          }}
        />
      ))}
    </div>
  );
}
