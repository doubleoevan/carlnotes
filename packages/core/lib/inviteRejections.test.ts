// join page tests: every way a token can fail has a response for the person with the invite link, and an accepted
// invite opens its topic, its Topic Post, or its team
import { expect, test } from "bun:test"
import { inviteRejections } from "@carlnotes/contracts/invites"
import { INVITE_REJECTIONS, toInviteDestination } from "./inviteRejections"

// a rejection the api can answer with, but the page has no copy for would render an empty screen
test("every join rejection has its own message", () => {
	for (const rejection of inviteRejections) {
		expect(INVITE_REJECTIONS[rejection]).toBeTruthy()
	}

	// each rejection message is distinct, so the user can tell an expired link from a withdrawn one
	const rejectionMessages = inviteRejections.map((rejection) => INVITE_REJECTIONS[rejection])
	expect(new Set(rejectionMessages).size).toBe(inviteRejections.length)
})

// an invite shared from a Topic Post follows the topic and opens the post, and any other topic invite opens the topic
test("an accepted topic invite opens the Topic Post it names, or the topic", () => {
	const joinedTopic = { status: "joined" as const, topicId: "topic-1", topicName: "Coffee" }
	const topicPostPath = "/topics/topic-1/coffee/posts/post-1/light-roasts"
	expect(toInviteDestination({ ...joinedTopic, topicPost: { id: "post-1", path: topicPostPath } })).toEqual({
		kind: "topicPost",
		topicId: "topic-1",
		topicPostId: "post-1",
		path: topicPostPath,
	})

	// a deleted or unpublished post is absent from the response, which leaves the topic
	expect(toInviteDestination(joinedTopic)).toEqual({ kind: "topic", topicId: "topic-1" })
})

// a team invite opens its team, and a failed token shows its rejection
test("an accepted team invite opens the team, and a failed token shows its rejection", () => {
	expect(toInviteDestination({ status: "joinedTeam", teamId: "team-1", teamName: "Crew" })).toEqual({
		kind: "team",
		teamId: "team-1",
	})
	expect(toInviteDestination({ status: "expired" })).toEqual({ kind: "rejection", rejection: "expired" })
})
