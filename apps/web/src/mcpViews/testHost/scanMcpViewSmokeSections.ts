// the scan MCP view through the test host: a Scan's stages, polling, stop, and the recap with its Podcast Episode

import { expect, test } from "bun:test"
import type { McpScanStatus } from "@carlnotes/contracts/mcpScanStatus"
import {
	FINISHED_SCAN_STATUS,
	IDLE_SCAN_STATUS,
	REVIEWING_SCAN_STATUS,
	RUNNING_SCAN_STATUS,
	toRecapWithPodcastEpisode,
} from "@carlnotes/contracts/mcpScanStatusTestFixtures"
import { UPDATES_TITLE } from "@carlnotes/contracts/updates"
import { STOP_SCAN_LABEL } from "@carlnotes/core/lib/labels"
import type { FrameLocator } from "playwright-core"
import {
	FINDINGS_MCP_VIEW_DATA,
	PODCAST_EPISODE,
	toMcpViewToolResult,
	toScanToolResult,
	toUpdatesToolResult,
	UPDATES_RESULT,
	USER_MCP_VIEW_DATA,
} from "./mcpViewFixtures"
import { waitForRecord, withMcpView } from "./mcpViewTestHarness"
import type { ToolCallResponder } from "./mcpViewTestHost"
import { type OpenMcpViewOptions, TEST_SITE_URL } from "./mcpViewTestHost"

// how far a test moves the clock for the next Scan poll, the fast poll's delay and a little more
const SCAN_POLL_STEP_MS = 10_100

// how far a test moves the clock for a poll at the slowest rate
const SLOW_SCAN_POLL_MS = 31_000

// the most slow polls a test walks through before its next step reports a missing link
const MAX_SLOW_SCAN_POLLS = 100

// how long the test that walks the half-hour watch has, since each of its 58 polls is a tool call through the host
const PODCAST_EPISODE_WATCH_TEST_TIMEOUT_MS = 90_000

/**
 * Shows or hides a frame's page as a host does, for code that reads its visibility.
 */
async function setFrameVisibility(frame: FrameLocator, visibilityState: DocumentVisibilityState): Promise<void> {
	await frame.locator("html").evaluate((_html, nextVisibilityState) => {
		Object.defineProperty(document, "visibilityState", { value: nextVisibilityState, configurable: true })
		document.dispatchEvent(new Event("visibilitychange"))
	}, visibilityState)
}

/**
 * Returns the tool that a test's Scan polls, which returns each status in turn and then keeps the last one. Any other
 * tool returns the Topic's findings.
 */
function toScanStatusResponder(mcpScanStatuses: McpScanStatus[]): ToolCallResponder {
	const remainingStatuses = [...mcpScanStatuses]
	return (toolCall) => {
		if (toolCall.name !== "read_scan_status") {
			return toMcpViewToolResult({ mcpViewData: FINDINGS_MCP_VIEW_DATA })
		}
		// return each status in turn and keep the last one
		const nextStatus = remainingStatuses.length > 1 ? remainingStatuses.shift() : remainingStatuses[0]
		return toScanToolResult(nextStatus ?? IDLE_SCAN_STATUS)
	}
}

test.each([
	["updates", toUpdatesToolResult(), UPDATES_TITLE, UPDATES_RESULT.morePath],
	["scan", toScanToolResult(FINISHED_SCAN_STATUS), FINISHED_SCAN_STATUS.topicName, FINISHED_SCAN_STATUS.topicPath],
] as const)("the host's fullscreen names the %s MCP view's page", async (mcpView, toolResult, title, href) => {
	await withMcpView({ mcpView }, async ({ frame, links, sendHostContext, sendToolResult }) => {
		await sendToolResult(toolResult)
		await sendHostContext({ displayMode: "fullscreen" })
		await frame.getByText(title, { exact: true }).first().waitFor()
		// the page link opens through the host
		await frame.getByRole("link", { name: "Open on CarlNotes" }).click()
		await waitForRecord(links)
		expect(links).toEqual([`${TEST_SITE_URL}${href}`])
	})
})

test("a Topic with no Scan shows the empty state and polls nothing", async () => {
	await withMcpView({ mcpView: "scan" }, async ({ frame, page, toolCalls, sendToolResult }) => {
		await page.clock.install()
		await sendToolResult(toScanToolResult(IDLE_SCAN_STATUS))
		await frame.getByText(`Nothing has brewed on ${IDLE_SCAN_STATUS.topicName} yet.`).waitFor()
		// a poll step passes with no tool call
		await page.clock.fastForward(SCAN_POLL_STEP_MS)
		expect(toolCalls).toEqual([])
	})
})

test("a Scan moves through its stages, with each Source's counts once gathering ends", async () => {
	const options: OpenMcpViewOptions = {
		mcpView: "scan",
		respondToToolCall: toScanStatusResponder([
			{ ...RUNNING_SCAN_STATUS, stage: "gathering" },
			REVIEWING_SCAN_STATUS,
			FINISHED_SCAN_STATUS,
		]),
	}
	await withMcpView(options, async ({ frame, page, toolCalls, sendToolResult }) => {
		await page.clock.install()

		// the first status comes from the tool that opened the MCP view
		await sendToolResult(toScanToolResult(RUNNING_SCAN_STATUS))
		await frame.getByText("Carl is Brewing…").waitFor()
		expect(toolCalls).toEqual([])

		// a poll shows each Source's counts once gathering ends, and what the Scan has kept so far
		await page.clock.fastForward(SCAN_POLL_STEP_MS)
		await waitForRecord(toolCalls)
		await page.clock.fastForward(SCAN_POLL_STEP_MS)
		await frame.getByRole("button", { name: "Hacker News front page" }).waitFor()
		await frame.getByText("3 findings kept so far").waitFor()

		// the last poll shows the recap, and polling ends
		await page.clock.fastForward(SCAN_POLL_STEP_MS)
		await frame.getByText("Three releases are worth reading today.").waitFor()
		await frame.getByRole("link", { name: "See the findings" }).waitFor()
		await page.clock.fastForward(SCAN_POLL_STEP_MS)
		expect(toolCalls).toHaveLength(3)
		expect(toolCalls[0]).toEqual({ name: "read_scan_status", arguments: { topic_id: RUNNING_SCAN_STATUS.topicId } })
	})
})

test.each([
	["a rate limit", () => ({ content: [{ type: "text" as const, text: "Slow down." }], isError: true })],
	[
		"a failed call",
		() => {
			throw new Error("The host dropped the call")
		},
	],
])("%s keeps the last status and polls again on schedule", async (_label, respondToFailedPoll) => {
	let pollCount = 0
	const options: OpenMcpViewOptions = {
		mcpView: "scan",
		respondToToolCall: () => {
			pollCount += 1
			return pollCount === 1 ? respondToFailedPoll() : toScanToolResult(FINISHED_SCAN_STATUS)
		},
	}
	await withMcpView(options, async ({ frame, page, toolCalls, sendToolResult }) => {
		await page.clock.install()
		await sendToolResult(toScanToolResult(RUNNING_SCAN_STATUS))
		await frame.getByText("Carl is Brewing…").waitFor()
		await page.clock.fastForward(SCAN_POLL_STEP_MS)
		await waitForRecord(toolCalls)
		await frame.getByText("Carl is Brewing…").waitFor()

		// the next poll shows the recap
		await page.clock.fastForward(SCAN_POLL_STEP_MS)
		await frame.getByText("Three releases are worth reading today.").waitFor()
	})
})

test("a hidden frame sends no poll, and polling picks up once it shows again", async () => {
	const options: OpenMcpViewOptions = {
		mcpView: "scan",
		respondToToolCall: toScanStatusResponder([FINISHED_SCAN_STATUS]),
	}
	await withMcpView(options, async ({ frame, page, toolCalls, sendToolResult }) => {
		await page.clock.install()
		await sendToolResult(toScanToolResult(RUNNING_SCAN_STATUS))
		await frame.getByText("Carl is Brewing…").waitFor()

		// a frame the host hides reads as hidden
		await setFrameVisibility(frame, "hidden")
		await page.clock.fastForward(SCAN_POLL_STEP_MS)
		await page.clock.fastForward(SCAN_POLL_STEP_MS)
		expect(toolCalls).toEqual([])

		// a frame shown again reads right away
		await setFrameVisibility(frame, "visible")
		await frame.getByText("Three releases are worth reading today.").waitFor()
	})
})

test("the owner stops a Scan, polling ends, and the MCP view shows what it kept", async () => {
	const stopResult = {
		content: [{ type: "text" as const, text: "Stopped the brew. It kept 2, and its daily brew is back." }],
		structuredContent: { status: "stopped", keptCount: 2 },
	}
	const options: OpenMcpViewOptions = { mcpView: "scan", respondToToolCall: () => stopResult }
	await withMcpView(options, async ({ frame, page, toolCalls, sendToolResult }) => {
		await page.clock.install()
		await sendToolResult(toScanToolResult(REVIEWING_SCAN_STATUS))
		await frame.getByRole("button", { name: STOP_SCAN_LABEL }).click()
		await frame.getByText("Stopped the brew. It kept 2, and its daily brew is back.").waitFor()
		// the stop stays the only tool call after a poll step
		await page.clock.fastForward(SCAN_POLL_STEP_MS)
		expect(toolCalls).toEqual([{ name: "stop_scan", arguments: { topic_id: RUNNING_SCAN_STATUS.topicId } }])
	})
})

test("a failed stop shows the tool's words and keeps the Scan on screen", async () => {
	const stopResult = {
		content: [{ type: "text" as const, text: "The stop did not go through. Try again in a minute." }],
		isError: true,
	}
	const options: OpenMcpViewOptions = { mcpView: "scan", respondToToolCall: () => stopResult }
	await withMcpView(options, async ({ frame, sendToolResult }) => {
		await sendToolResult(toScanToolResult(RUNNING_SCAN_STATUS))
		await frame.getByRole("button", { name: STOP_SCAN_LABEL }).click()
		await frame.getByRole("alert").getByText("The stop did not go through. Try again in a minute.").waitFor()
		// the Scan and its stop button stay on screen
		await frame.getByText("Carl is Brewing…").waitFor()
		await frame.getByRole("button", { name: STOP_SCAN_LABEL }).waitFor()
	})
})

test("a reader who may not stop a Scan sees no stop control", async () => {
	await withMcpView({ mcpView: "scan" }, async ({ frame, sendToolResult }) => {
		await sendToolResult(toScanToolResult({ ...RUNNING_SCAN_STATUS, canStop: false }))
		await frame.getByText("Carl is Brewing…").waitFor()
		expect(await frame.getByRole("button", { name: STOP_SCAN_LABEL }).count()).toBe(0)
	})
})

test("a rejected start shows the tool's own words", async () => {
	await withMcpView({ mcpView: "scan" }, async ({ frame, sendToolResult }) => {
		await sendToolResult({ content: [{ type: "text", text: "This account reached its daily brew limit." }] })
		await frame.getByText("This account reached its daily brew limit.").waitFor()
	})
})

test("a recap moves one hop to its findings, and back returns to the latest recap with no tool call", async () => {
	const options: OpenMcpViewOptions = {
		mcpView: "scan",
		respondToToolCall: toScanStatusResponder([FINISHED_SCAN_STATUS]),
	}
	await withMcpView(options, async ({ frame, page, toolCalls, sendToolResult }) => {
		await page.clock.install()

		// the first status is the running one, and the poll finds the recap
		await sendToolResult(toScanToolResult(RUNNING_SCAN_STATUS))
		await page.clock.fastForward(SCAN_POLL_STEP_MS)
		await frame.getByRole("link", { name: "See the findings" }).click()
		await frame.getByText("Agents that read the docs").waitFor()
		expect(toolCalls.at(-1)).toEqual({ name: "read_topic_feed", arguments: { topic_id: RUNNING_SCAN_STATUS.topicId } })

		// back shows the recap the poll found, with no poll and no tool call
		await frame.getByRole("button", { name: "Back" }).click()
		await frame.getByText("Three releases are worth reading today.").waitFor()
		expect(toolCalls).toHaveLength(2)
	})
})

test("a failed Scan's recap shows the diary line, and a recap with no cost shows none", async () => {
	await withMcpView({ mcpView: "scan" }, async ({ frame, sendToolResult }) => {
		await sendToolResult(
			toScanToolResult({ ...FINISHED_SCAN_STATUS, status: "failed", scanSummary: null, sourceResults: null }),
		)
		await frame.getByText("This one didn't brew.").waitFor()
		expect(await frame.getByText("$", { exact: false }).count()).toBe(0)
	})
})

test("a recording Podcast Episode shows its recording card, keeps polling, and plays once it publishes", async () => {
	const publishedRecap = toRecapWithPodcastEpisode({
		state: "published",
		podcastEpisodeId: PODCAST_EPISODE.id,
		pagePath: "/topics/topic-1/episodes/1",
	})
	const options: OpenMcpViewOptions = {
		mcpView: "scan",
		respondToToolCall: () =>
			toScanToolResult(publishedRecap, { ...USER_MCP_VIEW_DATA, podcastEpisodes: [PODCAST_EPISODE] }),
	}
	await withMcpView(options, async ({ frame, page, toolCalls, sendToolResult }) => {
		await page.clock.install()
		await sendToolResult(toScanToolResult(toRecapWithPodcastEpisode({ state: "recording" })))
		await frame.getByText("Carl and Vienna are recording").waitFor()
		// one poll step returns the published recap. the Podcast Episode then plays
		await page.clock.fastForward(SCAN_POLL_STEP_MS)
		await frame.getByRole("button", { name: `Play episode ${PODCAST_EPISODE.episodeNumber}` }).click()
		await frame.getByRole("button", { name: "Pause" }).first().waitFor()
		expect(toolCalls).toHaveLength(1)
	})
})

test("a recap with no Podcast Episode shows no play control, and polling ends", async () => {
	await withMcpView({ mcpView: "scan" }, async ({ frame, page, toolCalls, sendToolResult }) => {
		await page.clock.install()
		await sendToolResult(toScanToolResult(FINISHED_SCAN_STATUS))
		await frame.getByText("Three releases are worth reading today.").waitFor()
		// a poll step passes with no tool call and no play button
		await page.clock.fastForward(SCAN_POLL_STEP_MS)
		expect(toolCalls).toEqual([])
		expect(await frame.getByRole("button", { name: /^Play episode/ }).count()).toBe(0)
	})
})

test("a recap's play sends a signed token, and a host that blocks the audio gets the page's link", async () => {
	const pagePath = "/topics/topic-1/episodes/1"
	const blockedPodcastEpisode = {
		...PODCAST_EPISODE,
		pagePath,
		audioUrl: `${TEST_SITE_URL}/api/episodes/${PODCAST_EPISODE.id}/audio.mp3?play=signed-token`,
	}
	const recap = toRecapWithPodcastEpisode({ state: "published", podcastEpisodeId: PODCAST_EPISODE.id, pagePath })
	const mcpViewData = { ...USER_MCP_VIEW_DATA, podcastEpisodes: [blockedPodcastEpisode] }
	await withMcpView({ mcpView: "scan" }, async ({ frame, requestUrls, sendToolResult }) => {
		await sendToolResult(toScanToolResult(recap, mcpViewData))
		await frame.getByRole("button", { name: `Play episode ${PODCAST_EPISODE.episodeNumber}` }).click()
		// the page's link shows and the blocked request has the signed token
		await frame.getByRole("link", { name: "Listen on CarlNotes" }).waitFor()
		expect(requestUrls.some((requestUrl) => requestUrl.endsWith("?play=signed-token"))).toBe(true)
	})
})

test("a played Podcast Episode with a film links to the film player on its page through the host", async () => {
	const pagePath = "/topics/topic-1/episodes/1"
	const filmPodcastEpisode = { ...PODCAST_EPISODE, pagePath, hasVideo: true }
	const recap = toRecapWithPodcastEpisode({ state: "published", podcastEpisodeId: PODCAST_EPISODE.id, pagePath })
	const mcpViewData = { ...USER_MCP_VIEW_DATA, podcastEpisodes: [filmPodcastEpisode] }
	await withMcpView({ mcpView: "scan" }, async ({ frame, links, sendToolResult }) => {
		// play the recap's podcast episode, and open its film through the host
		await sendToolResult(toScanToolResult(recap, mcpViewData))
		await frame.getByRole("button", { name: `Play episode ${PODCAST_EPISODE.episodeNumber}` }).click()
		await frame.getByRole("link", { name: "Watch on CarlNotes" }).click()
		await waitForRecord(links)
		expect(links).toEqual([`${TEST_SITE_URL}${pagePath}#film`])
	})
})

test(
	"a Podcast Episode still recording after 30 minutes ends the poll and links to the Topic's page",
	async () => {
		const recordingRecap = toRecapWithPodcastEpisode({ state: "recording" })
		const options: OpenMcpViewOptions = {
			mcpView: "scan",
			respondToToolCall: toScanStatusResponder([recordingRecap]),
		}
		await withMcpView(options, async ({ frame, page, toolCalls, links, sendToolResult }) => {
			await page.clock.install()
			await sendToolResult(toScanToolResult(recordingRecap))
			await frame.getByText("Carl and Vienna are recording").waitFor()

			// the slow poll rate walks the watch past its limit
			const watchOverLink = frame.getByRole("link", { name: "Listen on CarlNotes once it's ready" })
			for (let pollCount = 0; pollCount < MAX_SLOW_SCAN_POLLS && !(await watchOverLink.isVisible()); pollCount += 1) {
				await page.clock.fastForward(SLOW_SCAN_POLL_MS)
			}
			await watchOverLink.click()
			await waitForRecord(links)
			expect(links).toEqual([`${TEST_SITE_URL}${FINISHED_SCAN_STATUS.topicPath}`])

			// nothing polls after the limit
			const pollCount = toolCalls.length
			await page.clock.fastForward(SLOW_SCAN_POLL_MS)
			expect(toolCalls).toHaveLength(pollCount)
		})
	},
	PODCAST_EPISODE_WATCH_TEST_TIMEOUT_MS,
)
