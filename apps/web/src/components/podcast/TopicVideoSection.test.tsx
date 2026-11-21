// the topic video section's film poll in a live render: a topic that shows an older film beside the filming line reads
// the newer film's status, and the line clears once the poll's page read shows the film ready, without a reload of the
// page. a covered screen stops the poll
import { afterEach, expect, jest, mock, spyOn, test } from "bun:test"
import * as statusReadClient from "@carlnotes/client/statusReadClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { TopicVideoSection, type TopicVideoSectionElements } from "@carlnotes/core/components/TopicVideoSection"
import { TOPIC_VIDEO_RENDERING_POLL_MS } from "@carlnotes/core/hooks/useTopicVideoRenderingPoll"
import { TOPIC_VIDEO_RENDERING_LINE } from "@carlnotes/core/lib/podcastEpisodeCopy"
import { PODCAST_STORY_NEWER_VIDEO_RENDERING_TOPIC } from "@carlnotes/core/lib/podcastEpisodeStories"
import { advancePolls } from "@carlnotes/core/lib/pollTestFixtures"
import { focusManager } from "@tanstack/react-query"
import { act, useState } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

// plain elements that show the section's action and its film cards' ids
const PLAIN_ELEMENTS: TopicVideoSectionElements = {
	Section: ({ action, children }) => (
		<section>
			{action}
			{children}
		</section>
	),
	Grid: ({ children }) => <div>{children}</div>,
	Cell: ({ children }) => <div>{children}</div>,
	Pagination: () => null,
	FilmCard: ({ podcastEpisodeCard }) => <p>{podcastEpisodeCard.podcastEpisode.id}</p>,
	RenderingLine: ({ text }) => <p>{text}</p>,
}

// a topic that shows an older film while its newer film renders, and the same topic once the newer film is ready
const RENDERING_TOPIC = PODCAST_STORY_NEWER_VIDEO_RENDERING_TOPIC as TopicResponse
const READY_TOPIC = {
	...RENDERING_TOPIC,
	latestPodcastEpisode: { ...RENDERING_TOPIC.latestPodcastEpisode, isVideoRendering: false },
} as TopicResponse

// let the awaited reads and the renders settle
async function advancePoll(): Promise<void> {
	await act(async () => {
		await advancePolls({ pollMs: TOPIC_VIDEO_RENDERING_POLL_MS, pollCount: 1 })
	})
}

// put the real clock, the app's own focus, and the status read back after each test
afterEach(() => {
	jest.useRealTimers()
	focusManager.setFocused(undefined)
	mock.restore()
})

// render the section over a topic whose poll's page read shows the film ready, with a flag that covers the screen
async function renderTopicVideoSection() {
	return renderTestHook(
		() => ({ topicState: useState(RENDERING_TOPIC), screenState: useState(true) }),
		({ topicState: [topic, setTopic], screenState: [isScreenActive] }) => (
			<TopicVideoSection
				topic={topic}
				onVideoRenderingPoll={() => setTopic(READY_TOPIC)}
				isVideoRenderingPollEnabled={isScreenActive}
				elements={PLAIN_ELEMENTS}
			/>
		),
	)
}

test("an older film's filming line reads the newer film's status and clears without a reload once it is ready", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	const fetchStatus = spyOn(statusReadClient, "fetchTopicVideoStatus").mockResolvedValue({ status: "ready" })
	const hook = await renderTopicVideoSection()
	try {
		// the older film's card shows beside the filming line
		expect(hook.container.textContent).toContain(TOPIC_VIDEO_RENDERING_LINE.text)
		expect(RENDERING_TOPIC.topicPodcastEpisodeVideoCards?.length).toBeGreaterThan(0)

		// the poll reads the newer film's status, and its page read clears the line
		await advancePoll()
		expect(fetchStatus).toHaveBeenCalledWith({
			id: RENDERING_TOPIC.latestPodcastEpisode?.id,
			isPublic: RENDERING_TOPIC.visibility === "public",
		})
		expect(hook.container.textContent).not.toContain(TOPIC_VIDEO_RENDERING_LINE.text)

		// the poll stops with the line
		await advancePoll()
		expect(fetchStatus).toHaveBeenCalledTimes(1)
	} finally {
		jest.useRealTimers()
		await hook.close()
	}
})

test("a covered screen stops the poll", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	const fetchStatus = spyOn(statusReadClient, "fetchTopicVideoStatus").mockResolvedValue({ status: "rendering" })
	const hook = await renderTopicVideoSection()
	try {
		// the poll reads the status while the screen is active
		await advancePoll()
		expect(fetchStatus).toHaveBeenCalledTimes(1)

		// a covered screen reads no more, and the filming line stays
		const [, setIsScreenActive] = hook.read().screenState
		await act(async () => setIsScreenActive(false))
		await advancePoll()
		await advancePoll()
		expect(fetchStatus).toHaveBeenCalledTimes(1)
		expect(hook.container.textContent).toContain(TOPIC_VIDEO_RENDERING_LINE.text)
	} finally {
		jest.useRealTimers()
		await hook.close()
	}
})
