"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Card, Button, Badge, Avatar } from "@/components/ui";
import { useInterviews } from "@/hooks/queries/useInterviews";

// Interviewer Portal (minimalist)
const { useState: useS_iv } = React;

function Interviewer() {
  const router = useRouter();
  const [tab, setTab] = useS_iv("today");

  const { data: interviewsData, isLoading } = useInterviews();
  const allInterviews = interviewsData?.items ?? [];
  const todayStr = new Date().toISOString().split('T')[0];
  const todayInterviews = allInterviews.filter(iv => iv.scheduled_at.startsWith(todayStr));
  const upcoming = allInterviews.filter(iv => iv.scheduled_at > new Date().toISOString() && iv.status === 'scheduled');
  const pendingFeedback = allInterviews.filter(iv => iv.status === 'scheduled' && iv.scheduled_at < new Date().toISOString());
  const past = allInterviews.filter(iv => iv.status === 'completed');

  const stats = [
    { label: "Today", val: todayInterviews.length, sub: "interviews" },
    { label: "This week", val: upcoming.length, sub: "interviews" },
    { label: "Completed", val: past.length, sub: "this month" },
    { label: "Pending", val: pendingFeedback.length, sub: "feedbacks" },
  ];

  return (
    <div className="tsIvr">
      <div className="tsIvr-head">
        <div>
          <div className="h1">Your interviews</div>
          <div className="small" style={{ color: "var(--muted)" }}>Good afternoon, John. You have <b style={{ color: "var(--text)" }}>3 interviews</b> today and <b style={{ color: "var(--text)" }}>2 pending</b> feedbacks.</div>
        </div>
        <div className="tsIvr-cal">
          <Icon.Calendar size={14}/>
          <span>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
        </div>
      </div>

      <div className="tsIvr-stats">
        {stats.map((s, i) => (
          <div key={s.label} className="tsIvr-stat">
            <div className="mono" style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em" }}>{s.val}</div>
            <div className="small" style={{ color: "var(--muted)" }}>{s.label} <span style={{ opacity: 0.6 }}>· {s.sub}</span></div>
          </div>
        ))}
      </div>

      <div className="tsIvr-tabs">
        <div className="tsTabs">
          <button className={`tsTab ${tab === "today" ? "tsTab-active" : ""}`} onClick={() => setTab("today")}>Today <span className="tsTab-count">{todayInterviews.length}</span></button>
          <button className={`tsTab ${tab === "upcoming" ? "tsTab-active" : ""}`} onClick={() => setTab("upcoming")}>Upcoming <span className="tsTab-count">{upcoming.length}</span></button>
          <button className={`tsTab ${tab === "pending" ? "tsTab-active" : ""}`} onClick={() => setTab("pending")}>Pending feedback <span className="tsTab-count">{pendingFeedback.length}</span></button>
          <button className={`tsTab ${tab === "past" ? "tsTab-active" : ""}`} onClick={() => setTab("past")}>Past</button>
        </div>
      </div>

      {isLoading && <div style={{padding:32,color:'var(--muted)'}}>Loading interviews...</div>}

      {tab === "today" && (
        <div className="tsIvr-list">
          {todayInterviews.map((iv, i) => (
            <Card key={iv.id} className="tsIvr-card tsIvr-cardLarge" style={{ animationDelay: `${i * 60}ms` }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <Avatar name={iv.candidate_id} size={56}/>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span className="h3" style={{ fontWeight: 500 }}>{iv.candidate_id}</span>
                    <Badge variant="warning"><Icon.Clock size={11}/> {new Date(iv.scheduled_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</Badge>
                  </div>
                  <div className="small" style={{ color: "var(--muted)", marginBottom: 12 }}>{iv.status}</div>
                  <div className="tsIvr-meta">
                    <span><Icon.Calendar size={12}/> {new Date(iv.scheduled_at).toLocaleString()}</span>
                    <span><Icon.Clock size={12}/> {iv.duration_minutes} min</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
                  {iv.video_link && <Button variant="primary" icon={<Icon.Video size={14}/>} onClick={() => window.open(iv.video_link!, '_blank')}>Join interview</Button>}
                  <Button variant="secondary" icon={<Icon.FileText size={14}/>} onClick={() => router.push(`/interviews/${iv.id}`)}>Prep & conduct</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {tab === "upcoming" && (
        <div className="tsIvr-list">
          {upcoming.map(iv => (
            <Card key={iv.id} className="tsIvr-card">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Avatar name={iv.candidate_id} size={44}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 2 }}>{iv.candidate_id}</div>
                  <div className="small" style={{ color: "var(--muted)" }}>{iv.status}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ fontSize: 13 }}>{new Date(iv.scheduled_at).toLocaleString()}</div>
                  <div className="small" style={{ color: "var(--muted)" }}>{iv.duration_minutes} min</div>
                </div>
                <Button variant="secondary" icon={<Icon.Eye size={13}/>} onClick={() => router.push(`/interviews/${iv.id}`)}>View</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {tab === "pending" && (
        <div className="tsIvr-list">
          {pendingFeedback.map(iv => (
            <Card key={iv.id} className="tsIvr-card">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Avatar name={iv.candidate_id} size={44}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 2 }}>{iv.candidate_id}</div>
                  <div className="small" style={{ color: "var(--muted)" }}>{new Date(iv.scheduled_at).toLocaleString()} · awaiting feedback</div>
                </div>
                <Badge variant="warning"><Icon.Clock size={11}/> Awaiting feedback</Badge>
                <Button variant="primary" icon={<Icon.Pencil size={13}/>} onClick={() => router.push(`/interviews/${iv.id}`)}>Complete feedback</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {tab === "past" && (
        <div className="tsIvr-list">
          {past.map(iv => (
            <Card key={iv.id} className="tsIvr-card">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Avatar name={iv.candidate_id} size={44}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 2 }}>{iv.candidate_id}</div>
                  <div className="small" style={{ color: "var(--muted)" }}>{new Date(iv.scheduled_at).toLocaleString()}</div>
                </div>
                <Badge variant="success"><Icon.Check size={11} stroke={3}/> Completed</Badge>
                <Button variant="ghost" onClick={() => router.push(`/interviews/${iv.id}`)}>View feedback</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};



export { Interviewer as InterviewerHome };
export default Interviewer;
