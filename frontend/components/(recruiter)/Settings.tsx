"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";
import { Modal, Button, Card, Badge, Avatar, Input, Textarea, Toggle, useToast } from "@/components/ui";
import { INTERVIEW_ROUNDS } from "@/lib/data";

// Settings — Interview Rounds Configuration
const { useState: useS_st } = React;

function Settings() {
    const toast = useToast();
  
  const [section, setSection] = useS_st("rounds");
  const [rounds, setRounds] = useS_st(INTERVIEW_ROUNDS);
  const [editing, setEditing] = useS_st(null);
  const [draft, setDraft] = useS_st({ name: "", duration: 30, interviewer: "Recruiter", purpose: "", required: false });

  const openAdd = () => { setEditing("new"); setDraft({ name: "", duration: 30, interviewer: "Recruiter", purpose: "", required: false }); };
  const openEdit = (r) => { setEditing(r.id); setDraft({ ...r }); };
  const save = () => {
    if (editing === "new") {
      setRounds(r => [...r, { ...draft, id: "r" + Date.now(), num: r.length + 1 }]);
      toast({ message: "Interview round added." });
    } else {
      setRounds(arr => arr.map(r => r.id === editing ? { ...r, ...draft } : r));
      toast({ message: "Round updated." });
    }
    setEditing(null);
  };
  const remove = (id) => {
    setRounds(r => r.filter(x => x.id !== id));
    toast({ message: "Round removed.", variant: "error" });
  };
  const move = (id, dir) => {
    setRounds(arr => {
      const i = arr.findIndex(r => r.id === id);
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((r, k) => ({ ...r, num: k + 1 }));
    });
  };

  const sections = [
    { id: "profile",  label: "Profile",       icon: <Icon.Settings size={15}/> },
    { id: "team",     label: "Team members",  icon: <Icon.Users size={15}/> },
    { id: "rounds",   label: "Interview rounds", icon: <Icon.Calendar size={15}/> },
    { id: "email",    label: "Email templates", icon: <Icon.Mail size={15}/> },
    { id: "integ",    label: "Integrations",  icon: <Icon.LinkIcon size={15}/> },
    { id: "billing",  label: "Billing",       icon: <Icon.Award size={15}/> },
  ];

  return (
    <div className="tsPage tsSettings">
      <div className="tsSettings-layout">
        <aside className="tsSettings-nav">
          <div className="tsPage-headMain" style={{ padding: "0 8px 12px" }}>
            <div className="h2" style={{ fontSize: 18 }}>Settings</div>
          </div>
          {sections.map(s => (
            <button key={s.id} className={`tsNavItem ${section === s.id ? "tsNavItem-active" : ""}`} onClick={() => setSection(s.id)}>
              <span className="tsNavItem-icon">{s.icon}</span>
              <span className="tsNavItem-label">{s.label}</span>
            </button>
          ))}
        </aside>

        <div className="tsSettings-body">
          {section === "rounds" && (
            <>
              <div className="tsPage-head">
                <div>
                  <div className="h1">Interview rounds</div>
                  <div className="small" style={{ color: "var(--muted)" }}>Define the interview stages your team uses to evaluate candidates.</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="secondary" icon={<Icon.Copy size={14}/>}>Apply template</Button>
                  <Button variant="primary" icon={<Icon.Plus size={14}/>} onClick={openAdd}>Add round</Button>
                </div>
              </div>

              <div className="tsRounds">
                {rounds.map((r, i) => (
                  <div key={r.id} className="tsRound">
                    <div className="tsRound-num">{r.num}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                        <span style={{ fontWeight: 500, fontSize: 14.5 }}>{r.name}</span>
                        {r.required ? <Badge variant="success">Required</Badge> : <Badge variant="neutral">Optional</Badge>}
                      </div>
                      <div className="small" style={{ color: "var(--muted)" }}>{r.duration} min · {r.interviewer} · {r.purpose}</div>
                    </div>
                    <div className="tsRound-actions">
                      <button className="tsIconBtn" onClick={() => move(r.id, -1)} disabled={i === 0} title="Move up"><Icon.ArrowUp size={13}/></button>
                      <button className="tsIconBtn" onClick={() => move(r.id, 1)} disabled={i === rounds.length - 1} title="Move down"><Icon.ArrowDown size={13}/></button>
                      <button className="tsIconBtn" onClick={() => openEdit(r)} title="Edit"><Icon.Pencil size={13}/></button>
                      {!r.required && <button className="tsIconBtn" onClick={() => remove(r.id)} title="Delete" style={{ color: "var(--danger)" }}><Icon.Trash size={13}/></button>}
                    </div>
                  </div>
                ))}
                <button className="tsRound-add" onClick={openAdd}>
                  <Icon.Plus size={14}/> Add interview round
                </button>
              </div>

              {/* Templates */}
              <div style={{ marginTop: 32 }}>
                <div className="h3" style={{ marginBottom: 8 }}>Saved templates</div>
                <div className="small" style={{ color: "var(--muted)", marginBottom: 14 }}>Apply a pre-defined sequence to a new job in one click.</div>
                <div className="tsGrid tsGrid-3">
                  {[
                    { name: "Engineering — Standard", rounds: 4, used: 8 },
                    { name: "Sales — Quota carrier",    rounds: 3, used: 4 },
                    { name: "Design — Portfolio first", rounds: 5, used: 2 },
                  ].map(t => (
                    <Card key={t.name} hoverable>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <Icon.FileText size={20} style={{ color: "var(--muted)" }}/>
                        <button className="tsIconBtn"><Icon.MoreH size={14}/></button>
                      </div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>{t.name}</div>
                      <div className="small" style={{ color: "var(--muted)" }}>{t.rounds} rounds · used by {t.used} jobs</div>
                      <Button variant="ghost" size="sm" style={{ marginTop: 10, padding: 0 }}>Apply →</Button>
                    </Card>
                  ))}
                </div>

                <div style={{ marginTop: 18, display: "flex", gap: 8, alignItems: "center", padding: 14, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <Icon.Save size={16} style={{ color: "var(--muted)" }}/>
                  <Input placeholder="Engineering Team Standard…" style={{ flex: 1 }}/>
                  <Button variant="secondary" icon={<Icon.Save size={13}/>}>Save current as template</Button>
                </div>
              </div>
            </>
          )}

          {section !== "rounds" && <ComingSoonSection name={sections.find(s => s.id === section)?.label}/>}
        </div>
      </div>

      {editing && (
        <Modal open={true} onClose={() => setEditing(null)} width={500}
          title={editing === "new" ? "Add interview round" : "Edit interview round"}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="primary" disabled={!draft.name} onClick={save}>Save round</Button>
            </>
          }>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input label="Round name" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              placeholder="E.g., Design Portfolio Review"/>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Duration (min)" type="number" value={draft.duration} onChange={e => setDraft(d => ({ ...d, duration: +e.target.value }))}/>
              <label className="tsField">
                <span className="tsField-label">Interviewer role</span>
                <select className="tsSelect" value={draft.interviewer} onChange={e => setDraft(d => ({ ...d, interviewer: e.target.value }))} style={{ padding: "9px 12px", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                  {["Recruiter","Junior Engineer","Senior Engineer","Team Lead","Manager","Director","CEO/Founder","Other"].map(r => <option key={r}>{r}</option>)}
                </select>
              </label>
            </div>
            <Textarea label="Purpose / description" value={draft.purpose} onChange={e => setDraft(d => ({ ...d, purpose: e.target.value }))}
              placeholder="What's the goal of this interview round?" rows={3}/>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", background: "var(--surface-2)", borderRadius: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Required round</div>
                <div className="small" style={{ color: "var(--muted)" }}>Required rounds can't be skipped for any candidate.</div>
              </div>
              <Toggle checked={draft.required} onChange={v => setDraft(d => ({ ...d, required: v }))}/>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

const ComingSoonSection = ({ name }: any) => (
  <div style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>
    <Icon.Settings size={48} style={{ opacity: 0.3, marginBottom: 12 }}/>
    <div className="h3" style={{ marginBottom: 4 }}>{name}</div>
    <div className="small">Pretend this is configured. Switch to <b style={{ color: "var(--text)" }}>Interview rounds</b> to see the deep-dive.</div>
  </div>
);


export { Settings };
export default Settings;
