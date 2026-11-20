import { describe, it, expect } from 'vitest'
import { INVITATION_MESSAGE_MAX, standardInvitationMessage } from '@/lib/invitation'

/**
 * SYN-009 — the schedule form opens on this message and sends what the box
 * holds. It used to build a whole email locally that was never sent.
 */
describe('standardInvitationMessage — happy path', () => {
  it('greets the candidate by first name', () => {
    expect(standardInvitationMessage('Dana Cho').startsWith('Hi Dana,\n\n')).toBe(true)
  })

  it('carries no facts — time, link and role are added by the server', () => {
    expect(standardInvitationMessage('Dana Cho')).not.toMatch(/\d|https?:/)
  })
})

describe('standardInvitationMessage — positive variants', () => {
  it('uses a single name as it is', () => {
    expect(standardInvitationMessage('Dana')).toMatch(/^Hi Dana,/)
  })

  it('ignores surrounding and repeated spaces', () => {
    expect(standardInvitationMessage('  Dana   Cho ')).toMatch(/^Hi Dana,/)
  })
})

describe('standardInvitationMessage — empty and invalid names', () => {
  it('says "Hi there" when the resume gave no name', () => {
    for (const name of [null, undefined, '', '   ', 'Unknown Candidate', 'unknown candidate', 'Not Provided', 'Processing...']) {
      expect(standardInvitationMessage(name), `"${name}" is not a name`).toMatch(/^Hi there,/)
    }
  })
})

describe('INVITATION_MESSAGE_MAX — boundary', () => {
  it('matches the API limit and leaves room for the standard message', () => {
    expect(INVITATION_MESSAGE_MAX).toBe(2000)
    expect(standardInvitationMessage('A'.repeat(200)).length).toBeLessThan(INVITATION_MESSAGE_MAX)
  })
})
