// the note badge store's rules. the two numbers stay apart on a note and sum on a page, and opening a note clears it

import { expect, test } from "bun:test"
import type { NoteBadge } from "@shared/contracts"
import {
	markNoteOpened,
	setNoteBadges,
	toAllNoteCount,
	toAllTeamNoteCount,
	toNoteBadge,
	toPageNoteBadges,
	toTopicNoteCount,
} from "./noteBadgeStore"

// two notes on one topic and one on a team, each with something waiting
const TOPIC_EDIT: NoteBadge = {
	noteId: "n1",
	topicId: "topic-a",
	teamId: null,
	teamIds: ["team-a"],
	noteName: "Roast log",
	pageName: "Ethiopian naturals",
	unreadEdits: 1,
	unreadComments: 0,
}
const TOPIC_COMMENTS: NoteBadge = {
	noteId: "n2",
	topicId: "topic-a",
	teamId: null,
	teamIds: ["team-a"],
	noteName: "Cupping sheet",
	pageName: "Ethiopian naturals",
	unreadEdits: 0,
	unreadComments: 2,
}
const TEAM_NOTE: NoteBadge = {
	noteId: "n3",
	topicId: null,
	teamId: "team-a",
	teamIds: ["team-a"],
	noteName: "Team notes",
	pageName: "Agent Infra Crew",
	unreadEdits: 1,
	unreadComments: 3,
}

// a topic's badge sums the edits and comments of every note on it
test("a topic sums its notes' two numbers", () => {
	setNoteBadges([TOPIC_EDIT, TOPIC_COMMENTS, TEAM_NOTE])
	expect(toTopicNoteCount("topic-a")).toBe(3)
	expect(toAllTeamNoteCount()).toBe(4)
	expect(toAllNoteCount()).toBe(7)
})

// a team badge covers its own notes and the notes on the topics it holds
test("a team's badge includes the notes on its topics", () => {
	setNoteBadges([TOPIC_EDIT, TOPIC_COMMENTS, TEAM_NOTE])
	expect(toPageNoteBadges(null, "team-a").map((badge) => badge.noteId)).toEqual(["n1", "n2", "n3"])
	expect(toPageNoteBadges(null, "team-b")).toEqual([])
})

// the note's own row keeps them apart, which is what the page counts sum
test("a note keeps its two numbers separate", () => {
	setNoteBadges([TOPIC_COMMENTS])
	expect(toNoteBadge("n2")).toEqual({ unreadEdits: 0, unreadComments: 2 })
	// a note with nothing waiting reads as zeroes, never undefined
	expect(toNoteBadge("nothing-here")).toEqual({ unreadEdits: 0, unreadComments: 0 })
})

// opening a note clears it everywhere at once, without waiting for the next poll
test("opening a note clears it from the note and its page alike", () => {
	setNoteBadges([TOPIC_EDIT, TOPIC_COMMENTS])
	markNoteOpened("n2")
	expect(toNoteBadge("n2")).toEqual({ unreadEdits: 0, unreadComments: 0 })
	expect(toTopicNoteCount("topic-a")).toBe(1)
})

// the server agreeing drops the local mark, so the note can badge again later
test("a poll that no longer counts a note releases its opened mark", () => {
	setNoteBadges([TOPIC_EDIT])
	markNoteOpened("n1")
	expect(toAllNoteCount()).toBe(0)

	// the server has caught up and stopped counting it
	setNoteBadges([])
	expect(toAllNoteCount()).toBe(0)

	// the same note changing again badges once more
	setNoteBadges([TOPIC_EDIT])
	expect(toAllNoteCount()).toBe(1)
})
