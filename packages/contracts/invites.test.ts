// invite contract tests: a topic invite badge and a sent invite row parse as the api writes them
import { expect, test } from "bun:test"
import { type InviteRow, inviteRow, type TopicInviteBadge, topicInviteBadge } from "./invites"

// one invitation waiting for the user's answer
const topicInviteBadgeFixture: TopicInviteBadge = {
	inviteId: "invite-rust",
	topicId: "topic-rust",
	topicName: "Rust in production",
	inviterUsername: "carlos",
}

// one username invite that resolved to an account and was accepted
const inviteRowFixture: InviteRow = {
	inviteId: "invite-1",
	topicId: "topic-1",
	name: "Rust in production",
	inviteeEmail: null,
	invitee: { userId: "user-3", username: "lin", avatarSource: "oauth", avatarVersion: "1" },
	invitedAt: "2026-10-03T00:00:00.000Z",
	subscribedAt: "2026-10-04T00:00:00.000Z",
}

// each shape parses unchanged
test("a topic invite badge parses", () => {
	expect(topicInviteBadge.parse(topicInviteBadgeFixture)).toEqual(topicInviteBadgeFixture)
})
test("a sent invite row parses its invitee", () => {
	expect(inviteRow.parse(inviteRowFixture)).toEqual(inviteRowFixture)
})
