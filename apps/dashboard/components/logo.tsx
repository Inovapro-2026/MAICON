import Image from "next/image";

const LOGO_WIDTH = 1125;
const LOGO_HEIGHT = 722;

/**
 * Logo oficial SAVYRON (marca + wordmark já embutidos na imagem).
 *
 * Dimensão controlada por altura + largura automática, preservando o
 * aspect ratio exato (nunca renderiza no tamanho nativo do arquivo nem
 * distorce a proporção).
 *
 * - Sem `height`: altura responsiva — ~40px em mobile, até 56px em
 *   desktop (padrão para telas de auth centralizadas).
 * - Com `height`: altura fixa em px (headers, footer, CTA).
 */
export function Logo({
  compact = false,
  height,
  priority = true,
  className = "",
}: {
  compact?: boolean;
  height?: number;
  priority?: boolean;
  className?: string;
}) {
  let renderedHeight: string;
  if (height != null) {
    renderedHeight = `${compact ? Math.min(height, 40) : height}px`;
  } else if (compact) {
    renderedHeight = "clamp(32px, 6vw, 40px)";
  } else {
    renderedHeight = "clamp(40px, 8vw, 56px)";
  }

  return (
    <Image
      src="/logo.png"
      alt="SAVYRON"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      priority={priority}
      className={`logo-savyron-animated transition-all duration-300 ${className}`}
      style={{
        height: renderedHeight,
        width: "auto",
        aspectRatio: `${LOGO_WIDTH} / ${LOGO_HEIGHT}`,
      }}
    />
  );
}

