// update count tests: the sum, the labels a screen reader hears, and the groups in their order

import { expect, test } from "bun:test"
import type { ChatMention } from "@carlnotes/contracts/chat"
import type { TopicInviteBadge } from "@carlnotes/contracts/invites"
import type { NoteBadge } from "@carlnotes/contracts/notes"
import {
	toMenuTriggerLabel,
	toUpdateAccessibleLabel,
	toUpdateCount,
	toUpdateLabel,
	toUpdateSections,
} from "./updateCounts"

// one chat mention, two note changes on one note, and one invitation
const CHAT_MENTIONS: ChatMention[] = [
	{ teamId: "team-1", chatMessageId: 7, authorUsername: "carlos", isReply: true, excerpt: "try the eval runner" },
]
const NOTE_BADGES: NoteBadge[] = [
	{
		noteId: "note-1",
		topicId: "topic-1",
		teamId: null,
		teamIds: [],
		noteName: "Reading list",
		pageName: "LLM tooling",
		unreadEdits: 1,
		unreadComments: 1,
	},
]
const INVITES: TopicInviteBadge[] = [
	{ inviteId: "invite-1", topicId: "topic-2", topicName: "Robotaxi", inviterUsername: "Silky-Brew" },
]
const UPDATE_BADGES = { chatMentions: CHAT_MENTIONS, noteBadges: NOTE_BADGES, invites: INVITES }

// the count sums a note's two numbers with the chats and the invitations
test("the update count sums every group", () => {
	expect(toUpdateCount(UPDATE_BADGES)).toBe(4)
	expect(toUpdateCount({ chatMentions: [], noteBadges: [], invites: [] })).toBe(0)
})

// the labels name each waiting group, and skip an empty one
test("the labels name the waiting groups in order", () => {
	expect(toUpdateLabel(UPDATE_BADGES)).toBe("1 chat for you, 2 unread note changes, 1 topic invitation")
	expect(toUpdateLabel({ ...UPDATE_BADGES, noteBadges: [] })).toBe("1 chat for you, 1 topic invitation")
	expect(toUpdateAccessibleLabel(UPDATE_BADGES)).toBe(
		" updates, 1 chat for you, 2 unread note changes, 1 topic invitation",
	)
	expect(toMenuTriggerLabel("Menu", { chatMentions: [], noteBadges: [], invites: [] })).toBe("Menu")
})

// the sections list chats, then notes, then invitations, each line naming its things as labels
test("the sections list each group under its heading", () => {
	const sections = toUpdateSections(UPDATE_BADGES)
	expect(sections.map((section) => section.heading)).toEqual([
		"1 chat for you",
		"2 unread note changes",
		"1 topic invitation",
	])
	expect(sections[0]?.lines[0]?.parts.map((part) => part.text).join("")).toBe(
		"carlos replied to you: try the eval runner",
	)
	expect(sections[1]?.lines[0]?.parts.filter((part) => part.isLabel).map((part) => part.text)).toEqual([
		"Reading list",
		"LLM tooling",
	])
	expect(toUpdateSections({ chatMentions: [], noteBadges: [], invites: INVITES })).toHaveLength(1)
})
