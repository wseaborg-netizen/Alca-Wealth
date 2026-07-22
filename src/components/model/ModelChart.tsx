"use client";
import React, { useMemo } from "react";
import { ui, mono } from "../tokens";
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { fmtMoneyAxis, fmtMoneyFull, type ModelResult } from "../../lib/model";
import { PATH_COLORS } from "./shared";

// ── Model chart system ────────────────────────────────────────────────────────
// One dark analytical panel used by every Model workflow. Lines only — no
// shaded probability-looking bands. Colors stay consistent per series, event
// markers annotate stress timing, axes use $10K / $2.5M abbreviations.

export interface ChartSeries {
  label: string;
  points: { month: number; value: number }[];
  color: string;
  dash?: string;        // e.g. "6 4" for assumption paths
  width?: number;
}

export interface ChartMarker { month: number; label: string }

export function ModelChart({ series, markers, height = 300, ariaLabel, real, extraByMonth }: {
  series: ChartSeries[];
  markers?: ChartMarker[];
  height?: number;
  ariaLabel: string;
  /** True when plotted values are inflation-adjusted. */
  real?: boolean;
  /** Optional per-month tooltip extras (inflation-adjusted base, contributions to date). */
  extraByMonth?: Map<number, { real?: number; contributed?: number }>;
}) {
  // Merge into one data array keyed by month.
  const data = useMemo(() => {
    const byMonth = new Map<number, Record<string, number>>();
    const touch = (m: number) => { if (!byMonth.has(m)) byMonth.set(m, { month: m }); return byMonth.get(m)!; };
    series.forEach((s) => s.points.forEach((p) => { touch(p.month)[s.label] = p.value; }));
    return [...byMonth.values()].sort((a, b) => a.month - b.month);
  }, [series]);

  const colorOf = new Map(series.map((s) => [s.label, s.color]));

  return (
    <div role="img" aria-label={ariaLabel}
      style={{ background: "linear-gradient(150deg, #101216 0%, #15171C 100%)", border: "1px solid #26262B",
        borderRadius: 14, padding: "16px 12px 6px 4px", boxShadow: "var(--elev-2), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 18, left: 14, bottom: 2 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={(m) => `${Math.round(m / 12)}y`}
            ticks={data.length ? Array.from({ length: 9 }, (_, i) => Math.round(((data.length - 1) / 8) * i)).map((i) => data[i]?.month as number) : undefined}
            stroke="rgba(244,245,247,0.3)" tick={{ fontSize: 10.5, fill: "rgba(244,245,247,0.55)" }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v) => fmtMoneyAxis(v)} width={62}
            stroke="rgba(244,245,247,0.3)" tick={{ fontSize: 10.5, fill: "rgba(244,245,247,0.55)" }} tickLine={false} axisLine={false} />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const m = Number(label);
            const extra = extraByMonth?.get(m);
            return (
              <div style={{ background: "#16181E", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 8, padding: "8px 11px" }}>
                <div style={{ fontSize: 10, color: "rgba(244,245,247,0.55)", ...mono, marginBottom: 4 }}>
                  Year {(m / 12).toFixed(1)}{real ? " · inflation-adjusted" : ""}
                </div>
                {payload.map((p) => (
                  <div key={String(p.dataKey)} style={{ fontSize: 11.5, color: "#F4F5F7", ...mono, lineHeight: 1.6 }}>
                    <span style={{ color: colorOf.get(String(p.dataKey)) ?? (p.stroke as string) }}>■</span>{" "}
                    {String(p.dataKey)}: {fmtMoneyFull(Number(p.value))}
                  </div>
                ))}
                {extra?.real != null && !real && (
                  <div style={{ fontSize: 10.5, color: "rgba(244,245,247,0.6)", ...mono, marginTop: 3 }}>
                    Base, inflation-adjusted: {fmtMoneyFull(extra.real)}
                  </div>
                )}
                {extra?.contributed != null && extra.contributed > 0 && (
                  <div style={{ fontSize: 10.5, color: "rgba(244,245,247,0.6)", ...mono }}>
                    Contributions to date: {fmtMoneyFull(extra.contributed)}
                  </div>
                )}
              </div>
            );
          }} />
          {markers?.map((mk) => (
            <ReferenceLine key={`${mk.month}-${mk.label}`} x={mk.month} stroke="rgba(220,38,38,0.55)" strokeDasharray="4 4"
              label={{ value: mk.label, position: "insideTopLeft", fill: "rgba(244,245,247,0.65)", fontSize: 10, fontFamily: "'Geist', sans-serif" }} />
          ))}
          {series.map((s) => (
            <Line key={s.label} dataKey={s.label} stroke={s.color} strokeWidth={s.width ?? 1.7}
              strokeDasharray={s.dash || undefined} dot={false} isAnimationActive={false} connectNulls />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: "6px 12px 8px", alignItems: "center" }}>
        {series.map((s) => (
          <span key={s.label} style={{ fontSize: 10.5, color: "rgba(244,245,247,0.68)", ...ui, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 0, borderTop: `2.5px ${s.dash ? "dashed" : "solid"} ${s.color}` }} />
            {s.label}
          </span>
        ))}
        {markers && markers.length > 0 && (
          <span style={{ fontSize: 10.5, color: "rgba(244,245,247,0.5)", ...ui, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 0, borderTop: "2px dashed rgba(220,38,38,0.65)" }} />
            stress event
          </span>
        )}
      </div>
    </div>
  );
}

// ── Helpers to turn engine results into chart series ─────────────────────────

export const pathLine = (r: ModelResult, key: "down" | "base" | "up" | "baseReal") =>
  r.points.map((p) => ({ month: p.month, value: p[key] }));

/** Standard Downside/Base/Upside triple for one result, with consistent styling. */
export function tripleSeries(r: ModelResult, prefix = "", real = false): ChartSeries[] {
  const p = prefix ? `${prefix} ` : "";
  if (real) return [{ label: `${p}Base Path (inflation-adjusted)`, points: pathLine(r, "baseReal"), color: PATH_COLORS.base, width: 2.2 }];
  return [
    { label: `${p}Upside Path`, points: pathLine(r, "up"), color: PATH_COLORS.up, dash: "6 4" },
    { label: `${p}Base Path`, points: pathLine(r, "base"), color: PATH_COLORS.base, width: 2.4 },
    { label: `${p}Downside Path`, points: pathLine(r, "down"), color: PATH_COLORS.down, dash: "6 4" },
  ];
}

/** Tooltip extras (real base value + contributions) from a result. */
export function extrasFrom(r: ModelResult): Map<number, { real?: number; contributed?: number }> {
  return new Map(r.points.map((p) => [p.month, { real: p.baseReal, contributed: p.contributed }]));
}
