"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";
import { Card, Button, AIPill } from "@/components/ui";
import { useFunnel, useTimeToHire, useAnalyticsSummary } from "@/hooks/queries/useAnalytics";
import { FunnelChart, LineChart } from "./Dashboard";

const { useState: useS_an } = React;

function Analytics() {
  const [range, setRange] = useS_an("30d");

  const { data: funnelData } = useFunnel();
  const { data: trendData } = useTimeToHire();
  const { data: summary } = useAnalyticsSummary();

  const totalCandidates = summary?.total_candidates ?? 0;
  const totalInterviews = summary?.total_interviews ?? 0;
  const totalHired = summary?.total_hired ?? 0;
  const avgDays = summary?.avg_time_to_hire_days ? Math.round(summary.avg_time_to_hire_days) : null;

  const kpis = [
    {
      label: "Total candidates",
      val: totalCandidates > 0 ? totalCandidates : '—',
      icon: <Icon.Users size={15}/>,
      sub: "across all jobs",
    },
    {
      label: "Interviews scheduled",
      val: totalInterviews > 0 ? totalInterviews : '—',
      icon: <Icon.Calendar size={15}/>,
      sub: totalInterviews > 0 ? `${totalInterviews} total` : "no interviews yet",
    },
    {
      label: "Offers made",
      val: totalHired > 0 ? totalHired : '—',
      icon: <Icon.Award size={15}/>,
      sub: totalHired > 0 ? `${totalHired} hired` : "no offers yet",
    },
    {
      label: "Time-to-hire",
      val: avgDays ? `${avgDays} days` : '—',
      icon: <Icon.Clock size={15}/>,
      sub: avgDays ? "avg. days to hire" : "no completed hires yet",
    },
  ];

  const funnelStages = (funnelData ?? []).map(f => ({ stage: f.status, count: f.count, color: 'var(--primary)' }));
  const hasFunnelData = funnelStages.some(f => f.count > 0);

  const trendPoints = (trendData ?? []).map(t => ({ month: t.month, days: t.avg_days }));
  const latestTrendDays = trendPoints.length > 0 ? trendPoints[trendPoints.length - 1].days : null;

  return (
    <div className="tsPage">
      <div className="tsPage-head">
        <div className="tsPage-headMain">
          <div className="h1">Analytics</div>
          <div className="small" style={{ color: "var(--muted)" }}>Hiring performance across all roles</div>
        </div>
        <div className="tsPage-actions">
          <div className="tsTabs tsTabs-pill">
            {(["7d","30d","90d","ytd"] as const).map(r => (
              <button key={r} className={`tsTab ${range === r ? "tsTab-active" : ""}`} onClick={() => setRange(r)}>
                {r.toUpperCase()}
              </button>
            ))}
          </div>
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
          </div>
          <div style={{ padding: "0 24px 24px" }}>
            {hasFunnelData
              ? <FunnelChart data={funnelStages}/>
              : <div style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No pipeline data yet.</div>
            }
          </div>
        </Card>

        <Card padded={false}>
          <div className="tsCardHead">
            <div>
              <div className="h3">Time-to-hire trend</div>
              <div className="small" style={{ color: "var(--muted)" }}>6 months average</div>
            </div>
            {latestTrendDays && (
              <div style={{ textAlign: "right" }}>
                <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
                  {latestTrendDays}<span style={{ fontSize: 13, color: "var(--muted)" }}>d</span>
                </div>
              </div>
            )}
          </div>
          <div style={{ padding: "0 24px 24px" }}>
            {trendPoints.length > 0
              ? <LineChart data={trendPoints}/>
              : <div style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No trend data yet.</div>
            }
          </div>
        </Card>

        <Card padded={false}>
          <div className="tsCardHead">
            <div>
              <div className="h3">Source effectiveness</div>
              <div className="small" style={{ color: "var(--muted)" }}>By candidate source</div>
            </div>
          </div>
          <div style={{ padding: "32px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
              <Icon.PieChart size={18}/>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-2)" }}>Source tracking coming soon</div>
            <div className="small" style={{ color: "var(--muted)" }}>We'll track which channels bring your best candidates.</div>
          </div>
        </Card>

        <Card padded={false}>
          <div className="tsCardHead">
            <div>
              <div className="h3">Round pass rate</div>
              <div className="small" style={{ color: "var(--muted)" }}>% of candidates advancing</div>
            </div>
          </div>
          <div style={{ padding: "32px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
              <Icon.Target size={18}/>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-2)" }}>No round data yet</div>
            <div className="small" style={{ color: "var(--muted)" }}>Schedule interviews and submit feedback to see pass rates.</div>
          </div>
        </Card>
      </div>

      {/* AI insights row — only show when there's real data to draw insights from */}
      {totalCandidates > 0 && (
        <div style={{ marginTop: 20 }}>
          <Card padded={false} className="ai-border">
            <div style={{ padding: 22 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <AIPill>AI insights · This period</AIPill>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                AI-generated insights will appear here once you have enough hiring activity — interviews completed, stages advanced, and offers made.
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export { Analytics };
export default Analytics;
