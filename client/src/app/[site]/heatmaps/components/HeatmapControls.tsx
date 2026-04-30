"use client";

import { Flame, Monitor, MousePointerClick, RotateCcw, Smartphone, Tablet } from "lucide-react";
import { HeatmapMode, ViewportBreakpoint } from "../../../../api/analytics/endpoints/heatmap";
import { cn } from "../../../../lib/utils";

export interface HeatmapIntensity {
  radius: number;
  blur: number;
  maxOpacity: number;
}

export const DEFAULT_INTENSITY: HeatmapIntensity = {
  radius: 25,
  blur: 15,
  maxOpacity: 0.8,
};

interface HeatmapControlsProps {
  mode: HeatmapMode;
  onModeChange: (mode: HeatmapMode) => void;
  viewportBreakpoint: ViewportBreakpoint;
  onViewportChange: (breakpoint: ViewportBreakpoint) => void;
  intensity: HeatmapIntensity;
  onIntensityChange: (intensity: HeatmapIntensity) => void;
}

const VIEWPORT_OPTIONS: { value: ViewportBreakpoint; label: string; icon: React.ReactNode }[] = [
  { value: "all", label: "All", icon: null },
  { value: "desktop", label: "Desktop", icon: <Monitor className="w-4 h-4" /> },
  { value: "tablet", label: "Tablet", icon: <Tablet className="w-4 h-4" /> },
  { value: "mobile", label: "Mobile", icon: <Smartphone className="w-4 h-4" /> },
];

const MODE_OPTIONS: { value: HeatmapMode; label: string; icon: React.ReactNode; tip: string }[] = [
  {
    value: "all",
    label: "All clicks",
    icon: <MousePointerClick className="w-4 h-4" />,
    tip: "Every recorded click",
  },
  {
    value: "rage",
    label: "Rage clicks",
    icon: <Flame className="w-4 h-4" />,
    tip: "3+ clicks within 50px in 1.5s — likely user frustration",
  },
];

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}

function Slider({ label, value, min, max, step, onChange, format }: SliderProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 h-1.5 accent-orange-500 cursor-pointer"
      />
      <span className="text-xs text-neutral-700 dark:text-neutral-300 w-8 tabular-nums">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

export function HeatmapControls({
  mode,
  onModeChange,
  viewportBreakpoint,
  onViewportChange,
  intensity,
  onIntensityChange,
}: HeatmapControlsProps) {
  const isDefault =
    intensity.radius === DEFAULT_INTENSITY.radius &&
    intensity.blur === DEFAULT_INTENSITY.blur &&
    intensity.maxOpacity === DEFAULT_INTENSITY.maxOpacity;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Mode toggle */}
      <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5">
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={mode === option.value}
            title={option.tip}
            onClick={() => onModeChange(option.value)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
              mode === option.value
                ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
            )}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>

      {/* Viewport toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-neutral-500 dark:text-neutral-400">Viewport:</span>
        <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5">
          {VIEWPORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={viewportBreakpoint === option.value}
              onClick={() => onViewportChange(option.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
                viewportBreakpoint === option.value
                  ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              )}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Intensity sliders */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
        <Slider
          label="Radius"
          min={10}
          max={60}
          step={1}
          value={intensity.radius}
          onChange={(v) => onIntensityChange({ ...intensity, radius: v })}
        />
        <Slider
          label="Blur"
          min={0}
          max={40}
          step={1}
          value={intensity.blur}
          onChange={(v) => onIntensityChange({ ...intensity, blur: v })}
        />
        <Slider
          label="Opacity"
          min={0.2}
          max={1}
          step={0.05}
          value={intensity.maxOpacity}
          format={(v) => v.toFixed(2)}
          onChange={(v) => onIntensityChange({ ...intensity, maxOpacity: v })}
        />
        {!isDefault && (
          <button
            type="button"
            aria-label="Reset intensity"
            onClick={() => onIntensityChange(DEFAULT_INTENSITY)}
            className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
