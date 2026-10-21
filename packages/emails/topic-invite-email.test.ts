// topic invite email tests: the invitation's subject and body say follow, the client-facing word, never subscribe
import { expect, test } from "bun:test"
import { renderTopicInviteEmail, type TopicInviteEmailProps, toTopicInviteSubject } from "./topic-invite-email"

// an invitation to one topic
const topicInviteEmailProps: TopicInviteEmailProps = {
	inviterUsername: "doubleoevan",
	topicName: "Raccoons in the News",
	inviteeEmail: "friend@example.com",
	inviteUrl: "https://carlnotes.com/invite/token-1",
	appUrl: "https://carlnotes.com",
}

// the subject, the lead, and the note under the link each say follow
test("the invitation's subject and body say follow, never subscribe", async () => {
	expect(toTopicInviteSubject(topicInviteEmailProps)).toBe(
		"doubleoevan invited you to follow Raccoons in the News on CarlNotes",
	)
	const html = await renderTopicInviteEmail(topicInviteEmailProps)
	expect(html).toContain("invited you to follow ")
	expect(html).toContain("Following is your call once you")
	expect(html).not.toMatch(/subscrib/i)
})
