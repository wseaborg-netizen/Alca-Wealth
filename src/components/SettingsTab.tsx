"use client";
import React from "react";
import { T, ui, mono } from "./tokens";
import { Card, PageHeader } from "./ui";
import { UNIVERSE } from "@/lib/universe";

const UNIVERSE_COUNT = UNIVERSE.length;

export type Theme = "light" | "dark";

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      padding: "14px 0", borderBottom: `1px solid ${T.line}` }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, ...ui }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: T.dim, marginTop: 2, ...ui }}>{sub}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Segmented<T_ extends string>({ value, onChange, options }: {
  value: T_; onChange: (v: T_) => void; options: { id: T_; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div style={{ display: "inline-flex", gap: 3, background: T.panel2, border: `1px solid ${T.line}`,
      borderRadius: 9, padding: 3 }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6, cursor: "pointer",
            fontSize: 12.5, fontWeight: on ? 600 : 500, ...ui,
            color: on ? "#fff" : T.dim, background: on ? T.blue : "transparent",
            border: `1px solid ${on ? T.blue : "transparent"}`, transition: "all 0.15s",
          }}>
            {o.icon}{o.label}
          </button>
        );
      })}
    </div>
  );
}

const SunIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
      const r = (a * Math.PI) / 180;
      return <line key={a} x1={8 + Math.cos(r) * 5} y1={8 + Math.sin(r) * 5}
        x2={8 + Math.cos(r) * 6.7} y2={8 + Math.sin(r) * 6.7} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />;
    })}
  </svg>
);
const MoonIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

export default function SettingsTab({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeader title="Settings"
        subtitle="Personalize how ALCA looks and behaves on this device." />

      {/* Appearance */}
      <Card style={{ padding: "6px 22px 14px" }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.11em", textTransform: "uppercase",
          color: T.muted, ...ui, padding: "16px 0 4px" }}>Appearance</div>
        <Row label="Theme" sub="Switch between the light and dark interface.">
          <Segmented<Theme> value={theme} onChange={setTheme} options={[
            { id: "light", label: "Light", icon: SunIcon },
            { id: "dark", label: "Dark", icon: MoonIcon },
          ]} />
        </Row>
      </Card>

      {/* About */}
      <Card style={{ padding: "6px 22px 16px" }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.11em", textTransform: "uppercase",
          color: T.muted, ...ui, padding: "16px 0 4px" }}>About</div>
        <Row label="Application" sub="Internal research aid - verify in your firm's system before client use.">
          <span style={{ fontSize: 12, color: T.dim, ...ui, fontWeight: 600 }}>ALCA Wealth</span>
        </Row>
        <Row label="Fund universe" sub="Funds available to screen, compare and analyze.">
          <span style={{ fontSize: 14, fontWeight: 600, color: T.data, ...mono }}>{UNIVERSE_COUNT.toLocaleString()}</span>
        </Row>
        <Row label="Data sources" sub="Prices delayed and unofficial.">
          <span style={{ fontSize: 12, color: T.dim, ...ui }}>Yahoo Finance · FRED</span>
        </Row>
        <div style={{ paddingTop: 14, fontSize: 11.5, color: T.muted, ...ui, lineHeight: 1.55 }}>
          ALCA Wealth · Investment Intelligence for Financial Advisors. Research aid - verify before client use.
        </div>
      </Card>
    </div>
  );
}
