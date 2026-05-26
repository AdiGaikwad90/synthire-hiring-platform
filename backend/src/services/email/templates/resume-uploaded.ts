import type { ResumeUploadedTemplateData } from '../../../types/email'
import { escapeHtml, safeHref } from '../../../utils/html'

function scoreBar(label: string, score: number): string {
  const clampedScore = Math.min(100, Math.max(0, score))
  const color = clampedScore >= 70 ? '#10B981' : clampedScore >= 40 ? '#F59E0B' : '#EF4444'
  return `
    <div style="margin: 8px 0;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="color: #374151; font-size: 13px;">${escapeHtml(label)}</span>
        <span style="color: #374151; font-size: 13px; font-weight: 600;">${escapeHtml(clampedScore)}%</span>
      </div>
      <div style="background: #E5E7EB; border-radius: 4px; height: 8px; width: 100%;">
        <div style="background: ${escapeHtml(color)}; border-radius: 4px; height: 8px; width: ${escapeHtml(clampedScore)}%;"></div>
      </div>
    </div>`
}

export function renderResumeUploaded(data: ResumeUploadedTemplateData): { subject: string; html: string } {
  const subject = `New Candidate: ${data.candidateName} — ${data.overallScore}%`
  const candidateUrl = `${safeHref(data.frontendUrl)}/candidates/${encodeURIComponent(data.candidateId)}`
  const unsubscribeUrl = `${safeHref(data.frontendUrl)}/unsubscribe`

  const scoreColor = data.overallScore >= 70 ? '#10B981' : data.overallScore >= 40 ? '#F59E0B' : '#EF4444'

  const locationSection = data.location
    ? `<p style="color: #374151; margin: 8px 0;"><strong>Location:</strong> ${escapeHtml(data.location)}</p>`
    : ''

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
  <div style="background: linear-gradient(135deg, #6366F1, #3B82F6); padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Synthire</h1>
    <p style="color: #C7D2FE; margin: 4px 0 0; font-size: 14px;">Interview Management Platform</p>
  </div>
  <div style="padding: 32px;">
    <h2 style="color: #111827; font-size: 22px; margin: 0 0 8px;">New Candidate Submitted</h2>
    <p style="color: #6B7280; font-size: 14px; margin: 0 0 24px;">A new resume has been uploaded and scored for your review.</p>

    <div style="border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px; margin: 16px 0;">
      <p style="color: #374151; margin: 8px 0;"><strong>Candidate:</strong> ${escapeHtml(data.candidateName)}</p>
      <p style="color: #374151; margin: 8px 0;"><strong>Role:</strong> ${escapeHtml(data.jobTitle)}</p>
      ${locationSection}
    </div>

    <div style="background: #F9FAFB; border-radius: 8px; padding: 20px; margin: 16px 0;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="display: inline-block; width: 72px; height: 72px; border-radius: 50%; background: ${escapeHtml(scoreColor)}; line-height: 72px; text-align: center;">
          <span style="color: #ffffff; font-size: 20px; font-weight: 700;">${escapeHtml(data.overallScore)}%</span>
        </div>
        <p style="color: #374151; font-weight: 600; margin: 8px 0 0;">Overall Score</p>
      </div>
      ${scoreBar('Skills', data.skillsScore)}
      ${scoreBar('Experience', data.experienceScore)}
      ${scoreBar('Education', data.educationScore)}
      ${scoreBar('Achievements', data.achievementsScore)}
    </div>

    <a href="${candidateUrl}" style="display: inline-block; background: #6366F1; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0;">View Candidate</a>
  </div>
  <div style="padding: 16px 32px; background: #F9FAFB; border-radius: 0 0 8px 8px; text-align: center;">
    <p style="color: #6B7280; font-size: 12px; margin: 0;">
      &copy; 2025 Synthire &middot; <a href="${unsubscribeUrl}" style="color: #6B7280;">Unsubscribe</a>
    </p>
  </div>
</div>`.trim()

  return { subject, html }
}
