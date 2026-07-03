// Mapeia o weathercode WMO (Open-Meteo) para rotulo PT-BR + icone Lucide. Puro
// (sem estado): usado na UI de clima por estado. Ver codigos WMO 4677.
import {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudRainWind,
  CloudLightning,
  type LucideIcon,
} from "lucide-react";

export type CondicaoClima = { rotulo: string; Icone: LucideIcon };

// Rotulo PT-BR do weathercode WMO.
export function rotuloWeathercode(code: number | null | undefined): string {
  if (code == null) return "—";
  if (code === 0) return "Ceu limpo";
  if (code === 1) return "Predominantemente limpo";
  if (code === 2) return "Parcialmente nublado";
  if (code === 3) return "Nublado";
  if (code === 45 || code === 48) return "Nevoa";
  if (code >= 51 && code <= 55) return "Garoa";
  if (code === 56 || code === 57) return "Garoa congelante";
  if (code >= 61 && code <= 65) return "Chuva";
  if (code === 66 || code === 67) return "Chuva congelante";
  if (code >= 71 && code <= 75) return "Neve";
  if (code === 77) return "Granizo fino";
  if (code >= 80 && code <= 82) return "Pancadas de chuva";
  if (code === 85 || code === 86) return "Pancadas de neve";
  if (code === 95) return "Tempestade";
  if (code === 96 || code === 99) return "Tempestade com granizo";
  return "—";
}

// Icone Lucide correspondente ao weathercode.
export function iconeWeathercode(code: number | null | undefined): LucideIcon {
  if (code == null) return Cloud;
  if (code === 0) return Sun;
  if (code >= 1 && code <= 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 51 && code <= 57) return CloudDrizzle;
  if (code >= 61 && code <= 67) return CloudRain;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow;
  if (code >= 80 && code <= 82) return CloudRainWind;
  if (code >= 95) return CloudLightning;
  return Cloud;
}

// Conveniencia: rotulo + icone juntos.
export function condicaoWeathercode(
  code: number | null | undefined,
): CondicaoClima {
  return { rotulo: rotuloWeathercode(code), Icone: iconeWeathercode(code) };
}
