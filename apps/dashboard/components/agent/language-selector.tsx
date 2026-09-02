"use client";

import { useState } from "react";
import { Globe, ChevronDown } from "lucide-react";

const LANGUAGES = [
  { code: "pt-BR", label: "Português" },
  { code: "en-US", label: "English" },
  { code: "es-ES", label: "Español" },
];

export function LanguageSelector() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(LANGUAGES[0]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Selecionar idioma"
        className="flex items-center gap-2 rounded-full agent-glass-card px-3.5 py-1.5 text-xs font-medium text-[#E2E8F0] hover:border-[#818CF8]/50 hover:bg-[#0E1545]/80 transition-all cursor-pointer shadow-sm"
      >
        <Globe className="h-3.5 w-3.5 text-[#38BDF8]" />
        <span>
          Idioma: <strong className="font-semibold text-white">{selected.label}</strong>
        </span>
        <ChevronDown className={`h-3 w-3 text-[#94A3B8] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full mb-2 z-40 w-36 overflow-hidden rounded-xl agent-glass-card p-1 shadow-2xl border border-[#6366F1]/30">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  setSelected(lang);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  lang.code === selected.code
                    ? "bg-[#6366F1]/30 text-[#38BDF8] font-semibold"
                    : "text-[#CBD5E1] hover:bg-white/10 hover:text-white"
                }`}
              >
                <span>{lang.label}</span>
                {lang.code === selected.code && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#38BDF8]" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
