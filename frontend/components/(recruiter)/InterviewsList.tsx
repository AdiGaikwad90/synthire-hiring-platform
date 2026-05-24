"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Card, Button, Badge } from "@/components/ui";
import { useInterviews } from "@/hooks/queries/useInterviews";

export default function InterviewsList() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useInterviews();
  const [tab, setTab] = React.useState<'all' | 'today' | 'upcoming' | 'completed'>('all');

  const allInterviews = data?.items ?? [];
  const todayStr = new Date().toISOString().split('T')[0];
  const now = new Date();

  const filtered = allInterviews.filter(iv => {
    const ivDate = new Date(iv.scheduled_at);
    if (tab === 'today') return iv.scheduled_at.startsWith(todayStr);
    if (tab === 'upcoming') return ivDate > now && !iv.scheduled_at.startsWith(todayStr);
    if (tab === 'completed') return iv.status === 'completed';
    return true;
  });

  if (isLoading) return <div className="tsPage"><div style={{padding:32,color:'var(--muted)'}}>Loading interviews...</div></div>;
  if (isError) return (
    <div className="tsPage" style={{padding:32}}>
      <p style={{color:'var(--danger)'}}>Failed to load: {(error as Error)?.message}</p>
      <Button variant="secondary" onClick={() => refetch()}>Retry</Button>
    </div>
  );

  return (
    <div className="tsPage">
      <div className="tsPage-head">
        <div className="tsPage-headMain">
          <div className="h1">Interviews</div>
          <div className="small" style={{ color: "var(--muted)" }}>{allInterviews.length} total</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="tsFilterBar">
        <div className="tsTabs tsTabs-pill">
          {(['all','today','upcoming','completed'] as const).map(t => {
            const count = t === 'all' ? allInterviews.length
              : t === 'today' ? allInterviews.filter(iv => iv.scheduled_at.startsWith(todayStr)).length
              : t === 'upcoming' ? allInterviews.filter(iv => new Date(iv.scheduled_at) > now && !iv.scheduled_at.startsWith(todayStr)).length
              : allInterviews.filter(iv => iv.status === 'completed').length;
            return (
              <button key={t} className={`tsTab ${tab === t ? 'tsTab-active' : ''}`} onClick={() => setTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)} <span className="tsTab-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 && (
        <div style={{padding:48,textAlign:'center',color:'var(--muted)',fontSize:14}}>
          <p>No interviews in this category.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <Card padded={false}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--border)'}}>
                {['Candidate','Job','Interviewer','Scheduled','Status',''].map(h => (
                  <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,fontWeight:600,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(iv => (
                <tr key={iv.id} style={{borderBottom:'1px solid var(--border)',cursor:'pointer'}}
                    onClick={() => router.push(`/interviews/${iv.id}`)}>
                  <td style={{padding:'12px 16px',fontWeight:500}}>{iv.candidate_name ?? 'Unknown'}</td>
                  <td style={{padding:'12px 16px',color:'var(--text-2)',fontSize:13}}>{iv.job_id}</td>
                  <td style={{padding:'12px 16px',color:'var(--text-2)',fontSize:13}}>{iv.interviewer_id}</td>
                  <td style={{padding:'12px 16px',fontSize:13}}>
                    <div>{new Date(iv.scheduled_at).toLocaleDateString()}</div>
                    <div style={{color:'var(--muted)',fontSize:12}}>{new Date(iv.scheduled_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
                  </td>
                  <td style={{padding:'12px 16px'}}>
                    <Badge variant={iv.status === 'completed' ? 'success' : iv.status === 'cancelled' ? 'danger' : 'warning'} dot>
                      {iv.status}
                    </Badge>
                  </td>
                  <td style={{padding:'12px 16px',textAlign:'right'}}>
                    <button className="tsIconBtn" onClick={e => { e.stopPropagation(); router.push(`/interviews/${iv.id}`); }}>
                      <Icon.ArrowRight size={14}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
