import { candidateDisplay, UNKNOWN_CANDIDATE } from './candidate-display'

/** Same limit the API enforces (`CANDIDATE_MESSAGE_MAX`, backend/src/types/api.ts). */
export const INVITATION_MESSAGE_MAX = 2000

/**
 * The message the schedule form opens on. The recruiter may rewrite it; what
 * the box holds is what the candidate receives (SYN-009).
 *
 * It holds wording only. Role, date and time, duration and video link are
 * added by the server below it, so they can never be edited into something
 * false. Same wording as the server's fallback, `standardInvitationMessage()`
 * in backend/src/services/email/templates/interview-scheduled.ts.
 */
export function standardInvitationMessage(candidateName: string | null | undefined): string {
  const name = candidateDisplay({ name: candidateName }).name
  const firstName = name === UNKNOWN_CANDIDATE ? 'there' : name.split(/\s+/)[0]
  return `Hi ${firstName},

We look forward to meeting you! The details of your interview are below.

Please join a few minutes early so we can start on time. If you have any questions or need to reschedule, feel free to reach out.`
}
