"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";
import { Card, Button, Badge, AIPill } from "@/components/ui";
import { FUNNEL, TIME_TRENDS, SOURCES, ROUND_PERF } from "@/lib/data";
import { FunnelChart, LineChart } from "./Dashboard";

// Analytics Dashboard
const { useState: useS_an } = React;

function Analytics() {
      const [range, setRange] = useS_an("30d");

  const kpis = [
    { label: "Total candidates", val: "1,247", delta: "+15%", deltaColor: "success", icon: <Icon.Users size={15}/>, sub: "vs. previous period" },
    { label: "Interviews scheduled", val: "186", delta: "+8%", deltaColor: "success", icon: <Icon.Calendar size={15}/>, sub: "5.2 per role on avg" },
    { label: "Offers made", val: "12", delta: "+33%", deltaColor: "success", icon: <Icon.Award size={15}/>, sub: "9 accepted, 1 declined, 2 pending" },
    { label: "Time-to-hire", val: "26 days", delta: "-5%", deltaColor: "success", icon: <Icon.Clock size={15}/>, sub: "industry avg: 42 days" },
  ];

  return (
    <div className="tsPage">
      <div className="tsPage-head">
        <div className="tsPage-headMain">
          <div className="h1">Analytics</div>
          <div className="small" style={{ color: "var(--muted)" }}>Hiring performance across all roles</div>
        </div>
        <div className="tsPage-actions">
          <div className="tsTabs tsTabs-pill">
            <button className={`tsTab ${range === "7d" ? "tsTab-active" : ""}`} onClick={() => setRange("7d")}>7d</button>
            <button className={`tsTab ${range === "30d" ? "tsTab-active" : ""}`} onClick={() => setRange("30d")}>30d</button>
            <button className={`tsTab ${range === "90d" ? "tsTab-active" : ""}`} onClick={() => setRange("90d")}>90d</button>
            <button className={`tsTab ${range === "ytd" ? "tsTab-active" : ""}`} onClick={() => setRange("ytd")}>YTD</button>
          </div>
          <Button variant="secondary" icon={<Icon.Calendar size={14}/>}>May 1 – 22, 2026</Button>
          <Button variant="secondary" icon={<Icon.Download size={14}/>}>Export</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="tsGrid tsGrid-4" style={{ marginBottom: 20 }}>
        {kpis.map(k => (
          <Card key={k.label} padded={false}>
            <div style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div className="tsStatCard-icon">{k.icon}</div>
                <span className="tsStatCard-delta" style={{ color: k.deltaColor === "success" ? "var(--success)" : "var(--danger)" }}>
                  {k.delta.startsWith("+") ? <Icon.ArrowUp size={11}/> : <Icon.ArrowDown size={11}/>}{k.delta.replace(/[+\-]/, "")}
                </span>
              </div>
              <div className="mono" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}>{k.val}</div>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-2)", marginTop: 8 }}>{k.label}</div>
              <div className="small" style={{ color: "var(--muted)", marginTop: 2 }}>{k.sub}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="tsAnGrid">
        <Card padded={false}>
          <div className="tsCardHead">
            <div>
              <div className="h3">Hiring funnel</div>
              <div className="small" style={{ color: "var(--muted)" }}>Conversion at each stage</div>
            </div>
            <Badge variant="success"><Icon.ArrowUp size={10}/> +12% conversion</Badge>
          </div>
          <div style={{ padding: "0 24px 24px" }}>
            <FunnelChart data={FUNNEL}/>
          </div>
        </Card>

        <Card padded={false}>
          <div className="tsCardHead">
            <div>
              <div className="h3">Time-to-hire trend</div>
              <div className="small" style={{ color: "var(--muted)" }}>6 months · target: 28 days</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>26<span style={{ fontSize: 13, color: "var(--muted)" }}>d</span></div>
            </div>
          </div>
          <div style={{ padding: "0 24px 24px" }}>
            <LineChart data={TIME_TRENDS}/>
          </div>
        </Card>

        <Card padded={false}>
          <div className="tsCardHead">
            <div>
              <div className="h3">Source effectiveness</div>
              <div className="small" style={{ color: "var(--muted)" }}>By offers per source</div>
            </div>
          </div>
          <div style={{ padding: "0 24px 24px", display: "flex", gap: 24, alignItems: "center" }}>
            <DonutChart data={SOURCES}/>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              {SOURCES.map(s => (
                <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                  <span style={{ width: 9, height: 9, background: s.color, borderRadius: 2, flexShrink: 0 }}/>
                  <span style={{ flex: 1 }}>{s.name}</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{s.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card padded={false}>
          <div className="tsCardHead">
            <div>
              <div className="h3">Round pass rate</div>
              <div className="small" style={{ color: "var(--muted)" }}>% of candidates advancing</div>
            </div>
          </div>
          <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            {ROUND_PERF.map(r => (
              <div key={r.name}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                  <span className="mono">{r.rate}%</span>
                </div>
                <div style={{ height: 8, background: "var(--surface-3)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: `linear-gradient(90deg, var(--primary), var(--primary-2))`, width: `${r.rate}%`, borderRadius: 999, transition: "width 0.7s cubic-bezier(.2,.9,.3,1)" }}/>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* AI insights row */}
      <div style={{ marginTop: 20 }}>
        <Card padded={false} className="ai-border">
          <div style={{ padding: 22, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <AIPill>AI insights · This period</AIPill>
              <span className="small" style={{ color: "var(--muted)" }}>3 actionable findings</span>
            </div>
            <div className="tsGrid tsGrid-3">
              {[
                { title: "Drop-off at Technical Round", body: "13% of candidates fail at the Technical Round — 2.4× the screening drop-off. Consider re-balancing your Phone Screen rubric.", action: "Adjust rubric →" },
                { title: "LinkedIn ROI is highest", body: "Despite 40% of applications, LinkedIn yields 67% of accepted offers. Consider increasing sourcing budget there.", action: "View source breakdown →" },
                { title: "Time-to-hire improving", body: "26 days is your best quarter ever (-23% YoY). Engineering roles lead the improvement; design lags at 38 days.", action: "View by role →" },
              ].map(it => (
                <div key={it.title} className="tsAIInsight">
                  <div style={{ fontWeight: 500, fontSize: 13.5, marginBottom: 6 }}>{it.title}</div>
                  <div className="small" style={{ color: "var(--text-2)", lineHeight: 1.5, marginBottom: 10 }}>{it.body}</div>
                  <button className="tsBtn tsBtn-ghost tsBtn-sm" style={{ padding: 0 }}>{it.action}</button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ----- Donut chart -----
function DonutChart({ data, size = 140 }: any) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} stroke="var(--surface-3)" strokeWidth="14" fill="none"/>
      {data.map((d, i) => {
        const len = (d.value / total) * c;
        const dash = `${len} ${c - len}`;
        const el = (
          <circle key={i} cx={size/2} cy={size/2} r={r}
            stroke={d.color} strokeWidth="14" fill="none"
            strokeDasharray={dash}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size/2} ${size/2})`}
            style={{ transition: "stroke-dasharray 0.6s" }}/>
        );
        offset += len;
        return el;
      })}
      <text x={size/2} y={size/2 - 2} textAnchor="middle" fill="var(--text)" fontFamily="var(--font-mono)" fontSize="22" fontWeight="600">{total}</text>
      <text x={size/2} y={size/2 + 14} textAnchor="middle" fill="var(--muted)" fontSize="9" letterSpacing="0.06em">SOURCES</text>
    </svg>
  );
};


export { Analytics };
export default Analytics;
