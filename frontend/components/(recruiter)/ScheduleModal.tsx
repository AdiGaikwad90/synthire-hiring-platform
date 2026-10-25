"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";
import { Modal, Button, Badge, Input, Textarea, useToast, Select } from "@/components/ui";
import { useInterviewTypes } from "@/hooks/queries/useSettings";
import { useScheduleInterview } from "@/hooks/queries/useInterviews";
import { useJob } from "@/hooks/queries/useJobs";
import { apiErrorMessage } from "@/lib/api";
import { browserTimeZone, formatInZone, preferredZone, sameZone, timeZoneOptions, wallTimeIn, zonedTimeToUtc } from "@/lib/timezones";

interface ScheduleModalProps {
  c?: { name: string; email: string | null; id?: string; job_id?: string };
  candidateId?: string;
  jobId?: string;
  onClose: () => void;
}

export function ScheduleModal({ c, candidateId, jobId, onClose }: ScheduleModalProps) {
  const toast = useToast();
  const { data: interviewTypes = [] } = useInterviewTypes();
  const { mutate: scheduleInterview, isPending: scheduling } = useScheduleInterview();

  const actualCandidateId = candidateId ?? c?.id ?? '';
  const actualJobId = jobId ?? c?.job_id ?? '';
  const { data: job } = useJob(actualJobId);
  const jobTitle = job?.title ?? '';

  // Resolve display name — skip placeholder values set when LLM can't extract name
  const displayName = (c?.name && c.name !== 'Unknown Candidate' && c.name !== 'Not Provided')
    ? c.name
    : 'the candidate';

  // Default to the viewer's own zone — it used to be hard-coded to Pacific.
  // preferredZone: Chrome reports India as "Asia/Calcutta"; match the listed "Asia/Kolkata".
  const viewerZone = React.useMemo(() => preferredZone(browserTimeZone()), []);
  // Default slot: 2 PM today, or tomorrow if today's 2 PM has already gone by,
  // so the form never opens on a time it would refuse.
  const defaultDay = React.useMemo(() => {
    const now = new Date();
    const today = wallTimeIn(now, viewerZone);
    const todayAt2 = zonedTimeToUtc({ ...today, hour: 14, minute: 0 }, viewerZone);
    return todayAt2.getTime() > now.getTime() ? today : wallTimeIn(new Date(now.getTime() + 24 * 60 * 60 * 1000), viewerZone);
  }, [viewerZone]);
  const [round, setRound] = React.useState('');
  const [interviewerEmail, setInterviewerEmail] = React.useState('');
  const [calYear, setCalYear] = React.useState(defaultDay.year);
  const [calMonth, setCalMonth] = React.useState(defaultDay.month); // 1-based
  const [date, setDate] = React.useState(defaultDay.day);
  const [hour, setHour] = React.useState(14);
  const [minute, setMinute] = React.useState(0);
  const [tz, setTz] = React.useState(viewerZone);
  const [link, setLink] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [showPreview, setShowPreview] = React.useState(false);
  const [candidateEmail, setCandidateEmail] = React.useState(c?.email ?? '');
  const [emailBody, setEmailBody] = React.useState('');
  const [previewTab, setPreviewTab] = React.useState<'candidate' | 'interviewer'>('candidate');

  const selRound = interviewTypes.find(r => r.id === round);
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const firstDow = new Date(calYear, calMonth - 1, 1).getDay();

  // SYN-002: the picked wall time is read IN THE PICKED ZONE. It used to be
  // `new Date(y, m, d, h, mi)`, i.e. the browser's zone, with the picker ignored.
  const instant = React.useMemo(() => {
    try { return zonedTimeToUtc({ year: calYear, month: calMonth, day: date, hour, minute }, tz); }
    catch { return null; }
  }, [calYear, calMonth, date, hour, minute, tz]);
  // SYN-027: no past days, and no time today that has already gone by — judged
  // in the picked zone, where "today" may differ from the viewer's.
  const todayInZone = wallTimeIn(new Date(), tz);
  const monthIndex = (y: number, m: number) => y * 12 + m;
  const viewingPastMonth = monthIndex(calYear, calMonth) < monthIndex(todayInZone.year, todayInZone.month);
  const viewingCurrentMonth = monthIndex(calYear, calMonth) === monthIndex(todayInZone.year, todayInZone.month);
  const disabledDays = new Set<number>(
    viewingPastMonth ? days : viewingCurrentMonth ? days.filter((d) => d < todayInZone.day) : [],
  );
  const isPast = !instant || instant.getTime() <= Date.now();
  const zoneOptions = React.useMemo(() => timeZoneOptions(viewerZone), [viewerZone]);

  const firstName = displayName === 'the candidate' ? 'there' : displayName.split(' ')[0];

  React.useEffect(() => {
    // Same format and zone as the email the backend sends (formatInterviewTime).
    const dateStr = instant ? formatInZone(instant, tz) : '—';
    const duration = selRound?.duration_minutes ?? 60;
    const roundName = selRound?.name ?? 'next round';
    const formatLine = `Video call${link ? ' — ' + link : ''}`;
    const notesSection = notes ? `Notes:\n${notes}\n\n` : '';

    setEmailBody(
`Hi ${firstName},

We're excited to invite you to interview for the ${jobTitle || roundName} position.`
+ (jobTitle && roundName !== 'next round' ? `\nInterview round: ${roundName}` : '') +
`

Interview Details:
• Date & Time: ${dateStr}
• Duration: ${duration} minutes
• Format: ${formatLine}

${notesSection}Please join a few minutes early to ensure everything is set up. If you have any questions or need to reschedule, reply to this email.

We look forward to speaking with you!

Best regards,
The Hiring Team`
    );
  }, [instant, tz, selRound, link, notes, firstName, jobTitle]);


  return (
    <Modal
      open
      onClose={onClose}
      side
      width={460}
      title="Schedule interview"
      subtitle={<>Round, interviewers, and time for <b style={{ color: "var(--text)" }}>{displayName}</b></>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" icon={<Icon.Save size={13} />}>Save template</Button>
          <Button
            variant="primary"
            icon={<Icon.Send size={13} />}
            disabled={isPast || scheduling}
            onClick={() => {
              // Re-check at click time: the form may have sat open past the slot.
              if (!instant || instant.getTime() <= Date.now()) {
                toast({ message: 'That time has already passed — pick a later one.', variant: 'error' });
                return;
              }
              scheduleInterview({
                candidate_id: actualCandidateId,
                job_id: actualJobId,
                interviewer_email: interviewerEmail || undefined,
                interview_type_id: round || undefined,
                scheduled_at: instant.toISOString(),
                timezone: tz,
                duration_minutes: selRound?.duration_minutes ?? 60,
                video_link: link || undefined,
                meeting_notes: notes || undefined,
                candidate_email_override: candidateEmail || undefined,
              }, {
                onSuccess: () => {
                  toast({ message: `Interview scheduled with ${displayName}.` });
                  onClose();
                },
                onError: (err) => {
                  toast({ message: apiErrorMessage(err, 'Failed to schedule interview'), variant: 'error' });
                },
              });
            }}
          >
            Schedule
          </Button>
        </>
      }
    >
      <div className="tsSched">
        <div className="tsSched-step">
          <div className="tsSched-stepHead">
            <span className="tsSched-stepNum">1</span>
            <span>Which round?</span>
          </div>
          <div className="tsSched-rounds">
            {interviewTypes.map((r) => (
              <button key={r.id} className={`tsSched-round ${round === r.id ? "active" : ""}`} onClick={() => setRound(r.id)}>
                <div className="tsSched-roundIcon">{r.position + 1}</div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{r.name}</div>
                  <div className="small" style={{ color: "var(--muted)" }}>{r.duration_minutes} min</div>
                </div>
                {r.required ? <Badge variant="primary">Required</Badge> : <Badge variant="neutral">Optional</Badge>}
              </button>
            ))}
          </div>
          {selRound && (
            <div className="small" style={{ marginTop: 10, color: "var(--text-2)", padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, borderLeft: "2px solid var(--primary)" }}>
              {selRound.description}
            </div>
          )}
        </div>

        <div className="tsSched-step">
          <div className="tsSched-stepHead">
            <span className="tsSched-stepNum">2</span>
            <span>Who will interview?</span>
            {interviewerEmail && <Badge variant="primary">1 selected</Badge>}
          </div>
          <Input
            label="Interviewer email"
            value={interviewerEmail}
            onChange={(e) => setInterviewerEmail(e.target.value)}
            placeholder="e.g. john.smith@company.com"
          />
          <div className="small" style={{ color: "var(--muted)", marginTop: 4 }}>
            Must be a registered Synthire user. They’ll receive a magic link to conduct the interview.
          </div>
        </div>

        <div className="tsSched-step">
          <div className="tsSched-stepHead">
            <span className="tsSched-stepNum">3</span>
            <span>Date & time</span>
          </div>

          <div className="tsCal">
            <div className="tsCal-head">
              <button className="tsIconBtn" aria-label="Previous month" disabled={viewingPastMonth || viewingCurrentMonth} onClick={() => {
                if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12); } else { setCalMonth(m => m - 1); }
                setDate(1);
              }}><Icon.ChevronLeft size={14} /></button>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {new Date(calYear, calMonth - 1, 1).toLocaleString('default', { month: 'long' })} {calYear}
              </div>
              <button className="tsIconBtn" aria-label="Next month" onClick={() => {
                if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1); } else { setCalMonth(m => m + 1); }
                setDate(1);
              }}><Icon.ChevronRight size={14} /></button>
            </div>
            <div className="tsCal-dow">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="tsCal-grid">
              {[...Array(firstDow).fill(null), ...days].map((d, i) =>
                d == null ? (
                  <div key={i} />
                ) : (
                  <button
                    key={i}
                    className={`tsCal-day ${date === d ? "active" : ""} ${disabledDays.has(d as number) ? "disabled" : "available"}`}
                    disabled={disabledDays.has(d as number)}
                    onClick={() => setDate(d as number)}
                  >
                    {d}
                  </button>
                )
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 8, marginTop: 12 }}>
            <Select
              value={String(hour)}
              onChange={e => setHour(+e.target.value)}
              options={Array.from({ length: 10 }, (_, i) => i + 9).map(h => ({
                value: String(h),
                label: `${h % 12 || 12}${h >= 12 ? ' PM' : ' AM'}`,
              }))}
            />
            <Select
              value={String(minute)}
              onChange={e => setMinute(+e.target.value)}
              options={[0, 15, 30, 45].map(m => ({
                value: String(m),
                label: `:${String(m).padStart(2, '0')}`,
              }))}
            />
            <Select
              value={tz}
              onChange={e => setTz(e.target.value)}
              aria-label="Time zone"
              options={zoneOptions}
            />
          </div>
          {isPast ? (
            <div className="small" role="alert" style={{ color: "var(--danger)", marginTop: 8 }}>
              That time has already passed{!sameZone(tz, viewerZone) ? ` in ${tz}` : ''}. Pick a later day or time.
            </div>
          ) : instant && (
            <div className="small" style={{ color: "var(--muted)", marginTop: 8, display: "grid", gap: 2 }}>
              <span>Interview: <b style={{ color: "var(--text-2)" }}>{formatInZone(instant, tz)}</b></span>
              {!sameZone(tz, viewerZone) && <span>Your time: {formatInZone(instant, viewerZone)}</span>}
            </div>
          )}
        </div>

        <div className="tsSched-step">
          <div className="tsSched-stepHead">
            <span className="tsSched-stepNum">4</span>
            <span>Meeting details</span>
          </div>
          <Input
            label="Video link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            icon={<Icon.LinkIcon size={14} />}
            hint="Zoom, Google Meet, or any video platform"
          />
          <div style={{ height: 12 }} />
          <Textarea
            label="Notes for interviewer"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="E.g., Focus on system design at scale. Ask about her gRPC migration."
            maxLength={500}
          />
        </div>

        <button className="tsSched-preview" onClick={() => setShowPreview((p) => !p)}>
          <Icon.Mail size={14} />
          <span>Review interview invitation email</span>
          <Icon.ChevronDown
            size={14}
            style={{ transform: showPreview ? "rotate(180deg)" : "", transition: "transform 0.18s", marginLeft: "auto" }}
          />
        </button>
        {showPreview && (
          <div className="tsEmailPreview">
            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              <button
                className={`tsTab ${previewTab === 'candidate' ? 'active' : ''}`}
                onClick={() => setPreviewTab('candidate')}
              >
                Candidate
              </button>
              <button
                className={`tsTab ${previewTab === 'interviewer' ? 'active' : ''}`}
                onClick={() => setPreviewTab('interviewer')}
              >
                Interviewer
              </button>
            </div>

            {previewTab === 'candidate' && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span className="small" style={{ color: "var(--text)", fontWeight: 600, whiteSpace: "nowrap" }}>To:</span>
                  <Input
                    value={candidateEmail}
                    onChange={(e) => setCandidateEmail(e.target.value)}
                    placeholder="candidate@email.com"
                  />
                </div>
                <div className="small" style={{ color: "var(--muted)", marginBottom: 12 }}>
                  <b style={{ color: "var(--text)" }}>Subject:</b> Interview Confirmed{jobTitle ? ` — ${jobTitle}` : ''}
                </div>
                <Textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={10}
                />
              </>
            )}

            {previewTab === 'interviewer' && (
              <>
                <div className="small" style={{ color: "var(--muted)", marginBottom: 8 }}>
                  <b style={{ color: "var(--text)" }}>To:</b>{" "}
                  <span style={{ color: interviewerEmail ? "var(--text-2)" : "var(--muted)" }}>
                    {interviewerEmail || '(not set)'}
                  </span>
                </div>
                <div className="small" style={{ color: "var(--muted)", marginBottom: 12 }}>
                  <b style={{ color: "var(--text)" }}>Subject:</b> Interview Assignment{jobTitle ? ` — ${jobTitle}` : ''}
                </div>
                <div className="small" style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                  They will receive a magic link to access the candidate’s profile and submit feedback after the interview.
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
