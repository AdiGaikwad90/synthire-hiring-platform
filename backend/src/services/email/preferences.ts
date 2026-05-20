import type { D1Database } from '@cloudflare/workers-types'
import type { EmailType } from '../../types/email'
import { getUserEmailPreferences } from '../../db/queries/email'

export async function shouldSendEmail(
  db: D1Database,
  userId: string | null,
  emailType: EmailType
): Promise<boolean> {
  // External candidates don't have user accounts — always send
  if (userId === null) {
    return true
  }

  const prefs = await getUserEmailPreferences(db, userId)

  // Default to sending if no preferences found
  if (!prefs) {
    return true
  }

  // Globally unsubscribed
  if (prefs.unsubscribed_at) {
    return false
  }

  // Map emailType to preference column
  switch (emailType) {
    case 'resume_uploaded':
      return Boolean(prefs.resume_notifications)
    case 'interview_scheduled':
    case 'magic_link':
      return Boolean(prefs.interview_notifications)
    case 'feedback_reminder':
      return Boolean(prefs.feedback_notifications)
    case 'interview_reminder':
      return Boolean(prefs.reminder_notifications)
    default:
      return true
  }
}
