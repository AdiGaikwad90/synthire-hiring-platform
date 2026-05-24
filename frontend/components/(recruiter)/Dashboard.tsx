"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Card, Button, Badge, Avatar, AIPill, ScorePill } from "@/components/ui";
import { useFunnel, useTimeToHire, useAnalyticsSummary, useActivity } from "@/hooks/queries/useAnalytics";
import { useInterviews } from "@/hooks/queries/useInterviews";
import { useCandidates } from "@/hooks/queries/useCandidates";
import { ResumeBatchModal } from "./ResumeBatchModal";

// Dashboard screen
function Dashboard() {
  const router = useRouter();
  const [showUpload, setShowUpload] = React.useState(false);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const { data: summaryData } = useAnalyticsSummary();
  const { data: funnelData } = useFunnel();
  const { data: trendData } = useTimeToHire();
  const { data: activityData } = useActivity();
  const { data: interviewsData } = useInterviews();
  const { data: candidatesData } = useCandidates();

  const stats = [
    { label: "Active Jobs", value: summaryData?.active_jobs ?? '—', delta: "+12%", deltaColor: "success", icon: <Icon.Briefcase size={16}/>, sub: "vs last week", spark: [8, 9, 10, 9, 11, 12, 12] },
    { label: "Pending Review", value: summaryData?.total_candidates ?? '—', delta: "+8%", deltaColor: "success", icon: <Icon.Users size={16}/>, sub: "needs action", spark: [38, 40, 36, 42, 44, 45, 47] },
    { label: "Interviews Today", value: interviewsData?.pagination?.total ?? '—', delta: "0%", deltaColor: "neutral", icon: <Icon.Calendar size={16}/>, sub: "across 3 jobs", spark: [4, 6, 5, 7, 5, 6, 5] },
    { label: "Offers Out", value: summaryData?.total_hired ?? '—', delta: "+2%", deltaColor: "success", icon: <Icon.Award size={16}/>, sub: "awaiting response", spark: [1, 2, 2, 1, 3, 3, 3] },
  ];

  return (
    <div className="tsPage">
      <div className="tsPage-head">
        <div className="tsPage-headMain">
          <div className="h1">Welcome back, Sarah</div>
          <div className="small" style={{ color: "var(--muted)" }}>{today} · You have <b style={{ color: "var(--text)" }}>5 interviews</b> and <b style={{ color: "var(--text)" }}>23 new candidates</b> to review.</div>
        </div>
        <div className="tsPage-actions">
          <Button variant="secondary" icon={<Icon.Upload size={15}/>} onClick={() => setShowUpload(true)}>Upload resumes</Button>
          <Button variant="primary" icon={<Icon.Plus size={15}/>} onClick={() => router.push("/jobs/new")}>Create job</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="tsGrid tsGrid-4" style={{ marginBottom: 20 }}>
        {stats.map(s => <StatCard key={s.label} {...s}/>)}
      </div>

      {/* Two-column grid */}
      <div className="tsDashGrid">
        {/* Left col */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* AI Insights */}
          <AIInsightsCard/>

          {/* Hiring Funnel */}
          <Card padded={false}>
            <div className="tsCardHead">
              <div>
                <div className="h3">Hiring Funnel</div>
                <div className="small">Last 30 days · 1,247 applicants</div>
              </div>
              <div className="tsTabs tsTabs-pill" style={{ alignSelf: "flex-start" }}>
                <button className="tsTab tsTab-active">30 days</button>
                <button className="tsTab">90 days</button>
                <button className="tsTab">YTD</button>
              </div>
            </div>
            <div style={{ padding: "0 24px 24px" }}>
              <FunnelChart data={(funnelData ?? []).map(f => ({ stage: f.status, count: f.count, color: 'var(--primary)' }))}/>
            </div>
          </Card>

          {/* Recent activity */}
          <Card padded={false}>
            <div className="tsCardHead">
              <div className="h3">Recent activity</div>
              <button className="tsBtn tsBtn-ghost tsBtn-sm">View all <Icon.ArrowRight size={13}/></button>
            </div>
            <div className="tsTimeline">
              {(activityData ?? []).map(a => <ActivityRow key={a.candidateId} a={{ id: a.candidateId, who: a.candidateName, action: `moved to ${a.status}`, target: a.jobTitle, time: a.updatedAt, type: 'move' }}/>)}
            </div>
          </Card>
        </div>

        {/* Right col */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Time-to-hire */}
          <Card padded={false}>
            <div className="tsCardHead">
              <div>
                <div className="h3">Time-to-hire</div>
                <div className="small">Average days from application to offer</div>
              </div>
              <div>
                <div style={{ textAlign: "right" }}>
                  <span className="mono" style={{ fontSize: 22, fontWeight: 600 }}>26</span>
                  <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 4 }}>days</span>
                </div>
                <Badge variant="success" style={{ marginTop: 2 }}><Icon.ArrowDown size={10}/> 23% YoY</Badge>
              </div>
            </div>
            <div style={{ padding: "0 24px 24px" }}>
              <LineChart data={(trendData ?? []).map(t => ({ month: t.month, days: t.avg_days }))}/>
            </div>
          </Card>

          {/* Today's interviews */}
          <Card padded={false}>
            <div className="tsCardHead">
              <div className="h3">Today's interviews</div>
              <Badge variant="warning">5 scheduled</Badge>
            </div>
            <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              {(interviewsData?.items ?? []).slice(0,5).map(iv => (
                <div key={iv.id} style={{padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                  <div style={{fontWeight:500}}>{new Date(iv.scheduled_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
                  <div style={{fontSize:12,color:'var(--muted)'}}>{iv.status}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Top candidates */}
          <Card padded={false}>
            <div className="tsCardHead">
              <div className="h3">Top candidates this week</div>
              <button className="tsBtn tsBtn-ghost tsBtn-sm" onClick={() => router.push("/candidates")}>See all <Icon.ArrowRight size={13}/></button>
            </div>
            <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
              {(candidatesData?.items ?? []).slice(0, 5).map(c => (
                <div key={c.id} className="tsCandRow" onClick={() => router.push(`/candidates/${c.id}`)}>
                  <Avatar name={c.name} size={28}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13.5 }}>{c.name}</div>
                    <div className="small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.status}</div>
                  </div>
                  <ScorePill score={c.overall_score ?? 0}/>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      {showUpload && <ResumeBatchModal onClose={() => setShowUpload(false)}/>}
    </div>
  );
};
const StatCard = ({ label, value, delta, deltaColor, icon, sub, spark }: any) => {
  const max = Math.max(...spark);
  const min = Math.min(...spark);
  const pts = spark.map((v, i) => {
    const x = (i / (spark.length - 1)) * 100;
    const y = 30 - ((v - min) / (max - min || 1)) * 28 - 1;
    return `${x},${y}`;
  }).join(" ");
  const dColor = deltaColor === "success" ? "var(--success)" : deltaColor === "danger" ? "var(--danger)" : "var(--muted)";
  return (
    <div className="tsStatCard">
      <div className="tsStatCard-head">
        <div className="tsStatCard-icon">{icon}</div>
        <span className="tsStatCard-delta" style={{ color: dColor }}>
          {deltaColor === "success" && <Icon.ArrowUp size={11}/>}
          {deltaColor === "danger" && <Icon.ArrowDown size={11}/>}
          {delta}
        </span>
      </div>
      <div className="tsStatCard-value">{value}</div>
      <div className="tsStatCard-foot">
        <div>
          <div className="tsStatCard-label">{label}</div>
          <div className="small" style={{ color: "var(--muted)" }}>{sub}</div>
        </div>
        <svg className="tsStatCard-spark" viewBox="0 0 100 30" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`sp-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={dColor} stopOpacity="0.3"/>
              <stop offset="100%" stopColor={dColor} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <polygon points={`0,30 ${pts} 100,30`} fill={`url(#sp-${label})`}/>
          <polyline points={pts} fill="none" stroke={dColor} strokeWidth="1.5"/>
        </svg>
      </div>
    </div>
  );
};

// ----- AI Insights card -----
const AIInsightsCard = () => { const router = useRouter(); return (
  <div className="tsCard ai-border" style={{ position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(400px 200px at 0% 0%, rgba(168,85,247,0.18), transparent 60%), radial-gradient(400px 200px at 100% 100%, rgba(59,130,246,0.12), transparent 60%)", pointerEvents: "none" }}/>
    <div style={{ padding: 24, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <AIPill>AI Insights</AIPill>
        <span className="small" style={{ color: "var(--muted)" }}>Updated 4 min ago</span>
      </div>
      <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 4 }}>
        <span className="ai-text">3 high-potential candidates</span> match your <b>Senior Software Engineer</b> role above 85%.
      </div>
      <div className="small" style={{ color: "var(--text-2)", marginBottom: 18, maxWidth: 520 }}>
        Marcus Chen, Priya Sharma, and Diego Vargas all have strong React + Python + AWS overlap with the role's required stack. Diego additionally has prior Stripe payments experience.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button variant="ai" icon={<Icon.Sparkles size={14}/>} onClick={() => router.push("/candidates")}>Review candidates</Button>
        <Button variant="ghost" size="md">Dismiss</Button>
      </div>
    </div>
  </div>
); };

// ----- Funnel chart -----
const FunnelChart = ({ data }: any) => {
  if (!data || data.length === 0) return <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No funnel data yet</div>;
  const max = data[0].count;
  return (
    <div className="tsFunnel">
      {data.map((d, i) => {
        const w = (d.count / max) * 100;
        const conv = i === 0 ? 100 : Math.round((d.count / data[i-1].count) * 100);
        return (
          <div key={d.stage} className="tsFunnel-row">
            <div className="tsFunnel-label">
              <span>{d.stage}</span>
              <span className="mono small" style={{ color: "var(--muted)" }}>{d.count.toLocaleString()}</span>
            </div>
            <div className="tsFunnel-bar">
              <div className="tsFunnel-fill" style={{ width: `${w}%`, background: `linear-gradient(90deg, ${d.color}AA, ${d.color})` }}/>
              <span className="tsFunnel-pct mono" style={{ color: i === 0 ? "white" : "var(--text)" }}>
                {Math.round((d.count / max) * 100)}%
              </span>
            </div>
            <div className="tsFunnel-conv mono small">{i > 0 ? `${conv}%` : ""}</div>
          </div>
        );
      })}
    </div>
  );
};

// ----- Line chart -----
const LineChart = ({ data, color = "#6366F1" }: any) => {
  if (!data || data.length < 2) return <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No trend data yet</div>;
  const w = 480, h = 140;
  const xs = data.map((_, i) => (i / (data.length - 1)) * (w - 40) + 30);
  const max = Math.max(...data.map(d => d.days)) + 4;
  const min = Math.min(...data.map(d => d.days)) - 4;
  const ys = data.map(d => h - 30 - ((d.days - min) / (max - min)) * (h - 50));
  const pts = data.map((d, i) => `${xs[i]},${ys[i]}`).join(" ");
  const area = `${xs[0]},${h - 22} ${pts} ${xs[xs.length-1]},${h - 22}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="tsLine" preserveAspectRatio="none">
      <defs>
        <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {/* Grid */}
      {[0, 1, 2, 3].map(i => (
        <line key={i} x1="20" x2={w - 10} y1={(h - 30) - i * 25} y2={(h - 30) - i * 25} stroke="var(--border)" strokeDasharray="3 3" opacity="0.5"/>
      ))}
      <polygon points={area} fill="url(#lineFill)"/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={xs[i]} cy={ys[i]} r="4" fill="var(--bg-2)" stroke={color} strokeWidth="2"/>
          <text x={xs[i]} y={h - 8} textAnchor="middle" fill="var(--muted)" fontSize="10.5" fontFamily="var(--font-mono)">{d.month}</text>
        </g>
      ))}
      <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r="6" fill={color} opacity="0.3">
        <animate attributeName="r" values="6;10;6" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite"/>
      </circle>
      <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r="4" fill={color}/>
    </svg>
  );
};

// ----- Activity row -----
const ActivityRow = ({ a }: any) => {
  const icon = a.type === "ai" ? <Icon.Sparkles size={12}/>
    : a.type === "screen" ? <Icon.Filter size={12}/>
    : a.type === "interview" ? <Icon.Video size={12}/>
    : a.type === "move" ? <Icon.ArrowRight size={12}/>
    : a.type === "offer" ? <Icon.Award size={12}/>
    : <Icon.X size={12}/>;
  const tone = a.type === "ai" ? "ai" : a.type === "offer" ? "success" : a.type === "reject" ? "danger" : "neutral";
  return (
    <div className="tsTimeline-row">
      <div className={`tsTimeline-dot tsTimeline-dot-${tone}`}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13 }}>
          <b>{a.who}</b> <span style={{ color: "var(--text-2)" }}>{a.action}</span> {a.target && <Badge variant={tone === "ai" ? "ai" : "primary"}>{a.target}</Badge>}
        </div>
        <div className="small" style={{ color: "var(--muted)", marginTop: 1 }}>{a.time}</div>
      </div>
    </div>
  );
};




export { Dashboard, StatCard, AIInsightsCard, FunnelChart, LineChart, ActivityRow };
export default Dashboard;
