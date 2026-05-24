"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Card, Button, Input, Textarea, Select, useToast } from "@/components/ui";
import { useJob, useUpdateJob } from "@/hooks/queries/useJobs";

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
];

const EXPERIENCE_LEVELS = [
  { value: "entry", label: "Entry" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "principal", label: "Principal" },
];

const JOB_STATUSES = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "closed", label: "Closed" },
];

const EDUCATION_REQUIREMENTS = [
  { value: "none", label: "None" },
  { value: "bachelors", label: "Bachelor's" },
  { value: "masters", label: "Master's" },
  { value: "phd", label: "PhD" },
];

export function JobEditForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { data: job, isLoading } = useJob(jobId);
  const updateJob = useUpdateJob();

  const [form, setForm] = React.useState<any>(null);
  const [skillInput, setSkillInput] = React.useState("");
  const [niceInput, setNiceInput] = React.useState("");

  React.useEffect(() => {
    if (job && !form) {
      setForm({
        title: job.title ?? "",
        department: job.department ?? "",
        location: job.location ?? "",
        employment_type: job.employment_type ?? "",
        experience_level: job.experience_level ?? "",
        salary_range: job.salary_range ?? "",
        description: job.description ?? "",
        required_skills: job.required_skills ?? [],
        nice_to_have_skills: job.nice_to_have_skills ?? [],
        min_years_experience: job.min_years_experience ?? "",
        education_requirement: job.education_requirement ?? "",
        status: job.status ?? "active",
      });
    }
  }, [job]);

  if (isLoading) return <div className="tsPage"><div style={{ padding: 32, color: "var(--muted)" }}>Loading...</div></div>;
  if (!job || !form) return <div className="tsPage"><div style={{ padding: 32, color: "var(--muted)" }}>Job not found.</div></div>;

  const set = (key: string, val: any) => setForm((f: any) => ({ ...f, [key]: val }));

  const addSkill = (type: "required_skills" | "nice_to_have_skills", val: string) => {
    if (!val.trim()) return;
    set(type, [...form[type], val.trim()]);
    if (type === "required_skills") setSkillInput("");
    else setNiceInput("");
  };

  const removeSkill = (type: "required_skills" | "nice_to_have_skills", skill: string) => {
    set(type, form[type].filter((s: string) => s !== skill));
  };

  const handleSave = () => {
    const data: Record<string, any> = { ...form };
    if (form.min_years_experience !== "" && form.min_years_experience !== null) {
      data.min_years_experience = Number(form.min_years_experience);
    } else {
      delete data.min_years_experience;
    }
    if (!form.education_requirement) {
      delete data.education_requirement;
    }
    updateJob.mutate({ id: jobId, data }, {
      onSuccess: () => {
        toast({ message: "Job updated." });
        router.push(`/jobs/${jobId}`);
      },
      onError: () => toast({ message: "Failed to update job.", variant: "error" }),
    });
  };

  return (
    <div className="tsPage">
      <div className="tsPage-head">
        <button className="tsBackBtn" onClick={() => router.push(`/jobs/${jobId}`)}>
          <Icon.ArrowLeft size={14} /> Back to job
        </button>
      </div>

      <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 20 }}>
        <Card padded>
          <div className="h3" style={{ marginBottom: 16 }}>Edit job</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input label="Job title" value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Senior Backend Engineer" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Department" value={form.department} onChange={e => set("department", e.target.value)} placeholder="Engineering" />
              <Input label="Location" value={form.location} onChange={e => set("location", e.target.value)} placeholder="Remote / San Francisco" />
            </div>
            <Select
              label="Job status"
              value={form.status}
              onChange={e => set("status", e.target.value)}
              options={JOB_STATUSES}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Select
                label="Employment type"
                value={form.employment_type}
                onChange={e => set("employment_type", e.target.value)}
                options={[{ value: "", label: "Select…" }, ...EMPLOYMENT_TYPES]}
              />
              <Select
                label="Experience level"
                value={form.experience_level}
                onChange={e => set("experience_level", e.target.value)}
                options={[{ value: "", label: "Select…" }, ...EXPERIENCE_LEVELS]}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Salary range" value={form.salary_range} onChange={e => set("salary_range", e.target.value)} placeholder="$120k – $160k" />
              <Input label="Min. years experience" type="number" value={form.min_years_experience} onChange={e => set("min_years_experience", e.target.value)} placeholder="3" />
            </div>
            <Select
              label="Education requirement"
              value={form.education_requirement}
              onChange={e => set("education_requirement", e.target.value)}
              options={[{ value: "", label: "Select…" }, ...EDUCATION_REQUIREMENTS]}
            />
            <Textarea label="Description" value={form.description} onChange={e => set("description", e.target.value)} rows={6} placeholder="Describe the role…" />
          </div>
        </Card>

        <Card padded>
          <div className="h4" style={{ marginBottom: 12 }}>Required skills</div>
          <div className="tsChips" style={{ marginBottom: 10 }}>
            {form.required_skills.map((s: string) => (
              <span key={s} className="tsChip tsChip-required" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon.Check size={10} stroke={3} />{s}
                <button onClick={() => removeSkill("required_skills", s)}><Icon.X size={10} /></button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              value={skillInput}
              onChange={e => setSkillInput(e.target.value)}
              placeholder="Add skill…"
              onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && addSkill("required_skills", skillInput)}
            />
            <Button variant="secondary" size="sm" onClick={() => addSkill("required_skills", skillInput)}>Add</Button>
          </div>
        </Card>

        <Card padded>
          <div className="h4" style={{ marginBottom: 12 }}>Nice-to-have skills</div>
          <div className="tsChips" style={{ marginBottom: 10 }}>
            {form.nice_to_have_skills.map((s: string) => (
              <span key={s} className="tsChip" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {s}
                <button onClick={() => removeSkill("nice_to_have_skills", s)}><Icon.X size={10} /></button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              value={niceInput}
              onChange={e => setNiceInput(e.target.value)}
              placeholder="Add skill…"
              onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && addSkill("nice_to_have_skills", niceInput)}
            />
            <Button variant="secondary" size="sm" onClick={() => addSkill("nice_to_have_skills", niceInput)}>Add</Button>
          </div>
        </Card>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button variant="ghost" onClick={() => router.push(`/jobs/${jobId}`)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={updateJob.isPending}>
            {updateJob.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
