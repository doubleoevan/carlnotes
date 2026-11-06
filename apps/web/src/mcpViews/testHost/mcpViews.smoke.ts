// each MCP view through the test host, in this machine's Chrome, from the built MCP view bundle. this file holds the tests
// about the host and the shell, and the imports below add each MCP view's own tests.
// bun run smoke:mcp-views builds the bundle, then runs this file
import { expect, test } from "bun:test"
import { FINISHED_SCAN_STATUS } from "@carlnotes/contracts/mcpScanStatusTestFixtures"
import { MCP_VIEWS } from "@carlnotes/contracts/mcpViews"
import { toTestTopicFinding } from "@carlnotes/contracts/topicFeedTestFixtures"
import { PODCAST_EPISODE_QUESTION_BUTTON_LABEL } from "@carlnotes/core/stores/podcastEpisodeQuestionRules"
import type { McpUiStyles } from "@modelcontextprotocol/ext-apps"
import { TOPIC_SUGGESTIONS_FIXTURE, TOPIC_SUGGESTIONS_INPUT } from "../topicSuggestionsFixtures"
import {
	FINDINGS_TOPIC,
	LONG_FINDINGS_MCP_VIEW_DATA,
	LONG_SEARCH_PAGE,
	PODCAST_EPISODE,
	PODCAST_EPISODE_SUMMARY,
	SEARCH_PAGE,
	SEND_CONFIRMATION,
	TOPIC_EDIT_PREVIEW,
	TOPIC_FINDINGS,
	toMcpViewToolResult,
	toScanToolResult,
	toUpdatesToolResult,
	USER_MCP_VIEW_DATA,
	VISITOR_FINDINGS_TOPIC,
	VISITOR_MCP_VIEW_DATA,
} from "./mcpViewFixtures"
import {
	NARROW_FRAME_WIDTH,
	openSmokeMcpView,
	toFrameStyle,
	waitForFrameStyle,
	waitForRecord,
	withMcpView,
} from "./mcpViewTestHarness"
import type { ToolCallResponder } from "./mcpViewTestHost"
import { type OpenMcpViewOptions, TEST_SITE_URL } from "./mcpViewTestHost"
import "./findingsMcpViewSmokeSections"
import "./scanMcpViewSmokeSections"
import "./searchMcpViewSmokeSections"
import "./topicMcpViewSmokeSections"
import "./updatesMcpViewSmokeSections"

test.each([...MCP_VIEWS])("the %s MCP view runs in a sandbox and waits for its result", async (mcpView) => {
	await withMcpView({ mcpView }, async ({ frame, page, sendToolInput }) => {
		// the tool's input alone leaves the loading state
		await sendToolInput({ q: "orbit" })
		await frame.getByText("Steeping…").waitFor()

		// the frame holds no origin of its own
		expect(await page.frames()[1]?.evaluate(() => window.origin)).toBe("null")
	})
})

test("the ui resource's policy blocks an image from a host it does not name", async () => {
	const mcpViewTestHost = await openSmokeMcpView({ mcpView: "search" })
	try {
		// add an image from a host the policy leaves out, and one from the site it names
		const allowedImageUrl = `${TEST_SITE_URL}/allowed.png`
		const allowedImageRequest = mcpViewTestHost.page.waitForRequest(allowedImageUrl)
		await mcpViewTestHost.page.frames()[1]?.evaluate(
			(imageUrls) => {
				for (const imageUrl of imageUrls) {
					document.body.append(Object.assign(document.createElement("img"), { src: imageUrl }))
				}
			},
			["https://blocked.test/image.png", allowedImageUrl],
		)

		// the browser blocks the first, and only the second reaches the network
		await allowedImageRequest
		await waitForRecord(mcpViewTestHost.contentSecurityViolations)
		expect(mcpViewTestHost.contentSecurityViolations[0]).toContain("blocked.test")
		expect(mcpViewTestHost.requestUrls.join(" ")).not.toContain("blocked.test")
	} finally {
		await mcpViewTestHost.close()
	}
})

test("an MCP view follows the host's theme, on load and on a change", async () => {
	await withMcpView({ mcpView: "search", theme: "dark" }, async ({ frame, sendHostContext }) => {
		// the Dark roast palette on load
		const toPageColor = (): Promise<string> =>
			frame.locator("html").evaluate((html) => getComputedStyle(html).getPropertyValue("--background"))
		await frame.locator("html.dark").waitFor({ state: "attached" })
		const darkPageColor = await toPageColor()

		// the Latte palette after the host changes
		await sendHostContext({ theme: "light" })
		await frame.locator("html:not(.dark)").waitFor({ state: "attached" })
		expect(await toPageColor()).not.toBe(darkPageColor)
	})
})

test("search shows its results to a user and a visitor, and opens See all through the host", async () => {
	await withMcpView({ mcpView: "search" }, async ({ frame, links, sendToolInput, sendToolResult }) => {
		await sendToolInput({ q: "orbit" })
		await sendToolResult(toMcpViewToolResult({ structuredContent: SEARCH_PAGE, mcpViewData: VISITOR_MCP_VIEW_DATA }))
		await frame.getByText("Orbit Club").first().waitFor()

		// See all opens the same search through the host
		await frame.getByRole("link", { name: "See all on CarlNotes" }).click()
		await waitForRecord(links)
		expect(links).toEqual([SEARCH_PAGE.searchUrl])
	})
})

test("the brand bar shows no back on the opening route, and the brand opens the site through the host", async () => {
	await withMcpView({ mcpView: "search" }, async ({ frame, links, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ structuredContent: SEARCH_PAGE, mcpViewData: USER_MCP_VIEW_DATA }))
		// the brand opens the site through the host. the opening route has no back button
		await frame.getByRole("link", { name: "Open CarlNotes in a new tab" }).click()
		await waitForRecord(links)
		expect(links).toEqual([`${TEST_SITE_URL}/`])
		expect(await frame.getByRole("button", { name: "Back" }).count()).toBe(0)
	})
})

test("a rejected tool call shows the tool's own words under the brand bar", async () => {
	await withMcpView({ mcpView: "findings" }, async ({ frame, sendToolResult }) => {
		await sendToolResult({ content: [{ type: "text", text: "This topic is private." }], isError: true })
		await frame.getByRole("alert").getByText("This topic is private.").waitFor()
		await frame.getByRole("link", { name: "Open CarlNotes in a new tab" }).waitFor()
	})
})

test("a visitor's podcast question opens signup on the site and leaves the route where it was", async () => {
	const mcpViewData = {
		...VISITOR_MCP_VIEW_DATA,
		topic: { ...VISITOR_FINDINGS_TOPIC, latestPodcastEpisode: PODCAST_EPISODE_SUMMARY },
		topicFindings: TOPIC_FINDINGS,
		podcastEpisodes: [PODCAST_EPISODE],
	}
	await withMcpView({ mcpView: "findings" }, async ({ frame, links, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ mcpViewData }))
		await frame.getByRole("button", { name: `Play episode ${PODCAST_EPISODE.episodeNumber}` }).click()
		await frame.getByRole("button", { name: PODCAST_EPISODE_QUESTION_BUTTON_LABEL }).first().click()
		// the question opens signup on the site. the findings route stays open
		await waitForRecord(links)
		expect(links[0]).toStartWith(`${TEST_SITE_URL}/signup?`)
		expect(links[0]).toContain("podcast-question")
		await frame.getByText("Agents that read the docs").waitFor()
	})
})

test("a sent checklist moves one hop to its Topic, and back returns to the confirmation with no tool call", async () => {
	// the send, the Topic's findings, and nothing else
	const respondToToolCall: ToolCallResponder = ({ name }) => {
		if (name === "send_to_topic") {
			return toMcpViewToolResult({ structuredContent: SEND_CONFIRMATION, mcpViewData: USER_MCP_VIEW_DATA })
		}
		const mcpViewData = { ...USER_MCP_VIEW_DATA, topic: FINDINGS_TOPIC, topicFindings: TOPIC_FINDINGS }
		return toMcpViewToolResult({ mcpViewData })
	}
	await withMcpView(
		{ mcpView: "suggest-topics", respondToToolCall },
		async ({ frame, links, sendToolInput, sendToolResult, toolCalls }) => {
			await sendToolInput(TOPIC_SUGGESTIONS_INPUT)
			await sendToolResult(
				toMcpViewToolResult({ structuredContent: TOPIC_SUGGESTIONS_FIXTURE, mcpViewData: USER_MCP_VIEW_DATA }),
			)
			await frame.getByRole("button", { name: /^Send/ }).click()

			// the confirmation's Topic moves to its findings through a tool call
			await frame.getByRole("link", { name: SEND_CONFIRMATION.topic.name }).click()
			await frame.getByText("Agents that read the docs").waitFor()
			expect(toolCalls.map((toolCall) => toolCall.name)).toEqual(["send_to_topic", "read_topic_feed"])
			expect(toolCalls.at(-1)?.arguments).toEqual({ topic_id: SEND_CONFIRMATION.topic.id })

			// a second hop opens on the site, and the MCP view stays
			await frame.getByRole("link", { name: FINDINGS_TOPIC.name }).first().click()
			await waitForRecord(links)
			expect(links[0]).toContain(`${TEST_SITE_URL}/topics/${FINDINGS_TOPIC.id}`)
			await frame.getByText("Agents that read the docs").waitFor()

			// back returns to the confirmation, which offers no second send, with no tool call
			await frame.getByRole("button", { name: "Back" }).click()
			await frame.getByRole("link", { name: SEND_CONFIRMATION.topic.name }).waitFor()
			expect(toolCalls).toHaveLength(2)
			expect(await frame.getByRole("button", { name: "Back" }).count()).toBe(0)
			expect(await frame.getByRole("button", { name: /^Send/ }).count()).toBe(0)
		},
	)
})

test("a host's colors and radii apply on load and on a change, and its fonts never do", async () => {
	const variables = {
		"--color-background-primary": "rgb(1, 2, 3)",
		"--color-text-primary": "rgb(4, 5, 6)",
		"--border-radius-md": "3px",
		"--font-sans": "monospace",
		"--font-weight-bold": "100",
	} as McpUiStyles
	await withMcpView({ mcpView: "search", styles: { variables } }, async ({ frame, sendHostContext }) => {
		// the colors and the radius replace Nightshift's, and the font variables never reach the document
		expect(await toFrameStyle(frame)).toEqual({
			backgroundColor: "rgb(1, 2, 3)",
			color: "rgb(4, 5, 6)",
			radius: "3px",
			isKarla: true,
			hostFontWeight: "",
		})

		// a later change applies too
		const changedVariables = { "--color-background-primary": "rgb(7, 8, 9)" } as McpUiStyles
		await sendHostContext({ styles: { variables: changedVariables } })
		await waitForFrameStyle(frame, "rgb(7, 8, 9)")
	})
})

test("a host with no variables keeps Nightshift's surfaces, radius, and fonts", async () => {
	await withMcpView({ mcpView: "search" }, async ({ frame }) => {
		const { backgroundColor, radius, isKarla } = await toFrameStyle(frame)
		expect(backgroundColor).not.toBe("rgba(0, 0, 0, 0)")
		expect(Number.parseFloat(radius)).toBe(0.625)
		expect(isKarla).toBe(true)
	})
})

test.each([
	["search", toMcpViewToolResult({ structuredContent: LONG_SEARCH_PAGE, mcpViewData: USER_MCP_VIEW_DATA })],
	["findings", toMcpViewToolResult({ mcpViewData: LONG_FINDINGS_MCP_VIEW_DATA })],
	[
		"suggest-topics",
		toMcpViewToolResult({ structuredContent: TOPIC_SUGGESTIONS_FIXTURE, mcpViewData: USER_MCP_VIEW_DATA }),
	],
	["topic", toMcpViewToolResult({ structuredContent: TOPIC_EDIT_PREVIEW, mcpViewData: USER_MCP_VIEW_DATA })],
	["updates", toUpdatesToolResult()],
	["scan", toScanToolResult(FINISHED_SCAN_STATUS)],
] as const)("the %s MCP view never scrolls sideways at 320 pixels", async (mcpView, toolResult) => {
	await withMcpView({ mcpView, width: NARROW_FRAME_WIDTH }, async ({ frame, sendToolInput, sendToolResult }) => {
		await sendToolInput(TOPIC_SUGGESTIONS_INPUT)
		await sendToolResult(toolResult)
		await frame.getByRole("link", { name: "Open CarlNotes in a new tab" }).waitFor()
		await frame.locator("#root").locator("a, button").nth(1).waitFor()
		// the page is no wider than the frame
		const { scrollWidth, clientWidth } = await frame
			.locator("html")
			.evaluate((html) => ({ scrollWidth: html.scrollWidth, clientWidth: html.clientWidth }))
		expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
	})
})

test("a table offers fullscreen where the host lists it, and the brand bar names its page", async () => {
	const mcpViewData = { ...USER_MCP_VIEW_DATA, topic: FINDINGS_TOPIC, topicFindings: TOPIC_FINDINGS }
	const options: OpenMcpViewOptions = { mcpView: "findings", availableDisplayModes: ["inline", "fullscreen"] }
	await withMcpView(options, async ({ displayModeRequests, frame, links, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ mcpViewData }))
		await frame.getByRole("button", { name: "Full screen" }).click()
		await waitForRecord(displayModeRequests)
		expect(displayModeRequests).toEqual(["fullscreen"])

		// the brand bar adds the Topic's name and its page on the site
		await frame.getByRole("link", { name: "Open on CarlNotes" }).click()
		await waitForRecord(links)
		expect(links[0]).toContain(`${TEST_SITE_URL}/topics/${FINDINGS_TOPIC.id}`)

		// leaving fullscreen returns to the brand alone
		await frame.getByRole("button", { name: "Exit full screen" }).click()
		await frame.getByRole("button", { name: "Full screen", exact: true }).waitFor()
		expect(await frame.getByRole("link", { name: "Open on CarlNotes" }).count()).toBe(0)
		expect(displayModeRequests).toEqual(["fullscreen", "inline"])
	})
})

test("the updates table offers fullscreen where the host lists it", async () => {
	const toolResult = toUpdatesToolResult()
	const options: OpenMcpViewOptions = { mcpView: "updates", availableDisplayModes: ["inline", "fullscreen"] }
	await withMcpView(options, async ({ displayModeRequests, frame, sendToolResult }) => {
		await sendToolResult(toolResult)

		// the button asks the host for fullscreen
		await frame.getByRole("button", { name: "Full screen" }).click()
		await waitForRecord(displayModeRequests)
		expect(displayModeRequests).toEqual(["fullscreen"])
	})
})

test("a host that lists only inline gets no display mode control, and one that declines keeps the MCP view inline", async () => {
	const mcpViewData = { ...USER_MCP_VIEW_DATA, topic: FINDINGS_TOPIC, topicFindings: TOPIC_FINDINGS }
	await withMcpView({ mcpView: "findings" }, async ({ frame, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ mcpViewData }))
		await frame.getByText("Agents that read the docs").waitFor()
		expect(await frame.getByRole("button", { name: "Full screen" }).count()).toBe(0)
	})

	// the host returns inline, so the brand bar never changes
	const options: OpenMcpViewOptions = {
		mcpView: "findings",
		availableDisplayModes: ["inline", "fullscreen"],
		isDisplayModeDeclined: true,
	}
	await withMcpView(options, async ({ displayModeRequests, frame, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ mcpViewData }))
		await frame.getByRole("button", { name: "Full screen" }).click()
		await waitForRecord(displayModeRequests)
		// the button still offers Full screen and the brand bar shows no page link
		await frame.getByRole("button", { name: "Full screen", exact: true }).waitFor()
		expect(await frame.getByRole("link", { name: "Open on CarlNotes" }).count()).toBe(0)
	})
})

test("the podcast player offers picture-in-picture where the host lists it, and shows only the player there", async () => {
	const mcpViewData = {
		...USER_MCP_VIEW_DATA,
		topic: { ...FINDINGS_TOPIC, latestPodcastEpisode: PODCAST_EPISODE_SUMMARY },
		topicFindings: TOPIC_FINDINGS,
		podcastEpisodes: [PODCAST_EPISODE],
	}
	const options: OpenMcpViewOptions = { mcpView: "findings", availableDisplayModes: ["inline", "pip"] }
	await withMcpView(options, async ({ displayModeRequests, frame, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ mcpViewData }))

		// no control until a podcast episode plays
		await frame.getByText("Agents that read the docs").waitFor()
		expect(await frame.getByRole("button", { name: "Picture in picture" }).count()).toBe(0)
		// play a podcast episode and ask the host for picture in picture
		await frame
			.getByRole("button", { name: `Play episode ${PODCAST_EPISODE.episodeNumber}` })
			.first()
			.click()
		await frame.getByRole("button", { name: "Picture in picture" }).click()
		await waitForRecord(displayModeRequests)
		expect(displayModeRequests).toEqual(["pip"])

		// the route stays mounted behind the player, and comes back on leaving
		await frame.getByRole("button", { name: "Exit picture in picture" }).waitFor()
		await frame.getByText("Agents that read the docs").waitFor({ state: "hidden" })
		await frame.getByRole("button", { name: "Exit picture in picture" }).click()
		await frame.getByText("Agents that read the docs").waitFor()
	})
})

test("a favicon and an avatar load from the connected site, never from the frame's own path", async () => {
	const faviconPath = "/api/favicons/example.png"
	const topicFindings = [toTestTopicFinding({ title: "Agents that read the docs", faviconPath })]
	const mcpViewData = { ...USER_MCP_VIEW_DATA, topic: FINDINGS_TOPIC, topicFindings }
	// a Finding's favicon in the findings table
	await withMcpView({ mcpView: "findings" }, async ({ frame, page, requestUrls, sendToolResult }) => {
		const faviconRequest = page.waitForRequest(`${TEST_SITE_URL}${faviconPath}`)
		await sendToolResult(toMcpViewToolResult({ mcpViewData }))
		await faviconRequest
		await frame.getByText("Agents that read the docs").waitFor()
		expect(requestUrls).toContain(`${TEST_SITE_URL}${faviconPath}`)
	})

	// a Team's avatar in a search result
	await withMcpView({ mcpView: "search" }, async ({ page, sendToolResult }) => {
		const avatarRequest = page.waitForRequest((request) => request.url().startsWith(`${TEST_SITE_URL}/api/`))
		const rows = SEARCH_PAGE.rows.map((row) =>
			row.kind === "team" ? { ...row, team: { ...row.team, avatarVersion: 2 } } : row,
		)
		await sendToolResult(
			toMcpViewToolResult({ structuredContent: { ...SEARCH_PAGE, rows }, mcpViewData: USER_MCP_VIEW_DATA }),
		)
		await avatarRequest
	})
})

test("a relative link resolves against the connected site, and a declined link shows what to do", async () => {
	await withMcpView({ mcpView: "search", isLinkDeclined: true }, async ({ frame, links, sendToolResult }) => {
		const searchUrl = "/search?q=orbit&kinds=teams"
		await sendToolResult(
			toMcpViewToolResult({ structuredContent: { ...SEARCH_PAGE, searchUrl }, mcpViewData: USER_MCP_VIEW_DATA }),
		)
		await frame.getByRole("link", { name: "See all on CarlNotes" }).click()
		await waitForRecord(links)
		expect(links).toEqual([`${TEST_SITE_URL}${searchUrl}`])
		await frame.getByRole("alert").getByText("Your app could not open this link").waitFor()
	})
})
