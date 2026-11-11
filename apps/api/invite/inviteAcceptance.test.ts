// invite-link tests for the rejection an invite url gets if its token is no longer valid, and for the Topic Post an
// accepted topic invite opens
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import type { invites } from "@carlnotes/db/schema/invites"
import { topics } from "@carlnotes/db/schema/topics"
import type { TopicPostRow } from "../topicPost/topicPosts"
import * as topicPosts from "../topicPost/topicPosts"
import { acceptTopicInvite, isAutomaticInvite, toInviteRejection, toInviteTopicPost } from "./inviteAcceptance"

afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// the moment each invite in this file is checked against
const now = new Date("2026-08-18T12:00:00.000Z")

// an invite with uses left and no expiry passed is still acceptable
function pendingInvite(
	overrides: Partial<Parameters<typeof toInviteRejection>[0]> = {},
): Parameters<typeof toInviteRejection>[0] {
	return { expiresAt: null, maxUses: 25, usedCount: 0, ...overrides }
}

// a good link is not rejected, which is the test case every other one is measured against
test("toInviteRejection passes a link with uses left and no expiry", () => {
	expect(toInviteRejection(pendingInvite(), now)).toBe(null)
	expect(toInviteRejection(pendingInvite({ expiresAt: new Date("2026-09-01T00:00:00.000Z") }), now)).toBe(null)
})

// an expiry that has passed closes the link, and the exact instant counts as passed
test("toInviteRejection reports an expired link", () => {
	expect(toInviteRejection(pendingInvite({ expiresAt: new Date("2026-08-18T11:59:59.000Z") }), now)).toBe("expired")
	expect(toInviteRejection(pendingInvite({ expiresAt: now }), now)).toBe("expired")
})

// a link is spent once its uses reach the limit, and the use before that is still acceptable
test("toInviteRejection reports an exhausted link", () => {
	expect(toInviteRejection(pendingInvite({ maxUses: 25, usedCount: 24 }), now)).toBe(null)
	expect(toInviteRejection(pendingInvite({ maxUses: 25, usedCount: 25 }), now)).toBe("exhausted")
	// an email invite is the one-use case, spent by the invitee who accepted it
	expect(toInviteRejection(pendingInvite({ maxUses: 1, usedCount: 1 }), now)).toBe("exhausted")
})

// a live invitation naming the person who is now accepting some other invitation
const USER_INVITE = { id: "named-invite", expiresAt: null, maxUses: 1, usedCount: 0 }

// anyone on the team can name someone, and the person they named is expected however they arrive
test("a live invitation naming the accepter admits them", () => {
	expect(isAutomaticInvite(USER_INVITE, "open-link-invite", now)).toBe(true)
})

// an open link naming nobody reads as no row here, so it writes the join request instead
test("no invitation naming the accepter admits nobody", () => {
	expect(isAutomaticInvite(undefined, "open-link-invite", now)).toBe(false)
})

// a dead invitation vouches for nobody, however it died
test("an expired or spent invitation admits nobody", () => {
	const expired = { ...USER_INVITE, expiresAt: new Date("2026-08-17T00:00:00.000Z") }
	expect(isAutomaticInvite(expired, "open-link-invite", now)).toBe(false)
	expect(isAutomaticInvite({ ...USER_INVITE, usedCount: 1 }, "open-link-invite", now)).toBe(false)
})

// accepting an invitation addressed to you already joins on the main path, so it must not also vouch
test("the invitation being accepted never vouches for itself", () => {
	expect(isAutomaticInvite(USER_INVITE, USER_INVITE.id, now)).toBe(false)
})

// a post on the invite topic, published or still a draft
function toTopicPostRow(publishedAt: Date | null): TopicPostRow {
	return {
		topicPost: { id: "post-1", topicId: "topic-1", title: "Light Roasts", publishedAt },
		topic: { id: "topic-1", name: "Home Espresso" },
	} as TopicPostRow
}

// a link invite to the topic that was shared from post-1
const TOPIC_POST_INVITE = {
	id: "invite-1",
	topicId: "topic-1",
	topicPostId: "post-1",
	token: "post-token",
	maxUses: 25,
	usedCount: 1,
} as typeof invites.$inferSelect

// stand in for the topic's lock, no legacy personal sources, and the accepter's active subscription
function stubSubscribedAccepter(): void {
	const topicRow = toTableRow(topics, { id: "topic-1", name: "Home Espresso", visibility: "invite" })

	// the topic's row, an active subscription, and no row for every other read
	stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [topicRow]
		}
		return text.includes('from "subscriptions"') ? [[true]] : []
	})
}

test("accepting an invite shared from a published Topic Post returns the post beside the topic", async () => {
	stubSubscribedAccepter()
	spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue(toTopicPostRow(new Date("2026-11-01T10:00:00Z")))
	expect(await acceptTopicInvite("accepter-1", TOPIC_POST_INVITE)).toEqual({
		status: "joined",
		topicId: "topic-1",
		topicName: "Home Espresso",
		topicPost: { id: "post-1", path: "/topics/topic-1/home-espresso/posts/post-1/light-roasts" },
	})
})

test("accepting falls back to the topic for a deleted Topic Post, a draft, and an invite that names no post", async () => {
	// a deleted post reads as no row, and a deleted post's invite as no post id
	stubSubscribedAccepter()
	const loadTopicPostRowSpy = spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue(null)
	const joinedTopic = {
		status: "joined" as const,
		topicId: "topic-1",
		topicName: "Home Espresso",
		topicPost: undefined,
	}
	expect(await acceptTopicInvite("accepter-1", TOPIC_POST_INVITE)).toEqual(joinedTopic)
	expect(await acceptTopicInvite("accepter-1", { ...TOPIC_POST_INVITE, topicPostId: null })).toEqual(joinedTopic)

	// a draft has no page to open
	loadTopicPostRowSpy.mockResolvedValue(toTopicPostRow(null))
	expect(await toInviteTopicPost("post-1")).toBeUndefined()
})
