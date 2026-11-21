// the discussion card's poll in a live render: a card the MCP view draws, with no status read passed, shows the
// recording on its way and polls nothing, and a page's card reads the status and reads the post once it leaves
// recording
import { afterEach, expect, jest, mock, spyOn, test } from "bun:test"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import {
	TopicPostDiscussionCard,
	type TopicPostDiscussionCardElements,
	type TopicPostDiscussionCardProps,
} from "@carlnotes/core/components/TopicPostDiscussionCard"
import { advancePolls } from "@carlnotes/core/lib/pollTestFixtures"
import * as statusPoll from "@carlnotes/core/lib/statusPoll"
import { TOPIC_POST_DISCUSSION_LABELS, TOPIC_POST_DISCUSSION_POLL_MS } from "@carlnotes/core/lib/topicPostDiscussions"
import { TOPIC_POST_DISCUSSION_STORY } from "@carlnotes/core/lib/topicPostStories"
import { focusManager } from "@tanstack/react-query"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

// plain elements that show the card's name and its line
const PLAIN_ELEMENTS: TopicPostDiscussionCardElements = {
	Card: ({ children }) => <section>{children}</section>,
	Row: ({ children }) => <div>{children}</div>,
	PlayButton: () => null,
	Details: ({ title, detailsText }) => <p>{`${title} ${detailsText ?? ""}`}</p>,
	Action: () => null,
	Form: () => null,
	Transcript: ({ children }) => <div>{children}</div>,
	transcriptTurnElements: {
		Text: ({ children }) => <span>{children}</span>,
		Strong: ({ children }) => <b>{children}</b>,
	},
}

// a published post whose discussion is recording again
const RECORDING_TOPIC_POST: TopicPostResponse = {
	...TOPIC_POST_DISCUSSION_STORY,
	discussion: {
		...(TOPIC_POST_DISCUSSION_STORY.discussion as NonNullable<TopicPostResponse["discussion"]>),
		isRecording: true,
	},
}

// let the poll's reads and the renders settle after one poll interval
async function advancePoll(): Promise<void> {
	await act(async () => {
		await advancePolls({ pollMs: TOPIC_POST_DISCUSSION_POLL_MS, pollCount: 1 })
	})
}

// put the real clock, the app's own focus, and the spies back after each test
afterEach(() => {
	jest.useRealTimers()
	focusManager.setFocused(undefined)
	mock.restore()
})

// render the card over the recording post with the given reads
async function renderDiscussionCard(cardProps: Omit<TopicPostDiscussionCardProps, "topicPost">) {
	return renderTestHook(
		() => null,
		() => <TopicPostDiscussionCard topicPost={RECORDING_TOPIC_POST} {...cardProps} elements={PLAIN_ELEMENTS} />,
	)
}

test("a card with no status read, as the MCP view draws it, shows the recording on its way and starts no poll", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	const startStatusPollSpy = spyOn(statusPoll, "startStatusPoll")
	let topicPostReadCount = 0
	const hook = await renderDiscussionCard({ onChanged: () => (topicPostReadCount += 1) })
	try {
		// the card says the recording is on its way, and three intervals read nothing
		expect(hook.container.textContent).toContain(TOPIC_POST_DISCUSSION_LABELS.recordingAgain)
		await advancePoll()
		await advancePoll()
		await advancePoll()
		expect(startStatusPollSpy).not.toHaveBeenCalled()
		expect(topicPostReadCount).toBe(0)
	} finally {
		jest.useRealTimers()
		await hook.close()
	}
})

test("a page's card reads the discussion's status, and reads the post once it leaves recording", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	const discussionStatuses = [{ status: "recording" as const }, { status: "published" as const }]
	let statusReadCount = 0
	let topicPostReadCount = 0
	const hook = await renderDiscussionCard({
		onChanged: () => (topicPostReadCount += 1),
		readDiscussionStatus: async () => discussionStatuses[statusReadCount++] ?? null,
	})
	try {
		// a recording status reads no post, and a published one reads it
		await advancePoll()
		expect(topicPostReadCount).toBe(0)
		await advancePoll()
		expect(statusReadCount).toBe(2)
		expect(topicPostReadCount).toBe(1)
	} finally {
		jest.useRealTimers()
		await hook.close()
	}
})
