// the shell around every MCP view: the real router on its one history, with a story host that returns tool results,
// opens links, and changes the display mode. the stories share that history, so each opens its own route on the first
// entry and shows in its own frame on the docs page

import { FINISHED_SCAN_STATUS } from "@carlnotes/contracts/mcpScanStatusTestFixtures"
import { MCP_VIEW_META_KEY } from "@carlnotes/contracts/mcpViews"
import { SITE_URL } from "@carlnotes/contracts/site"
import { PODCAST_STORY_EPISODE } from "@carlnotes/core/lib/podcastEpisodeStories"
import { restorePodcastEpisode } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import type { App, McpUiDisplayMode } from "@modelcontextprotocol/ext-apps"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { RouterProvider } from "@tanstack/react-router"
import { expect } from "storybook/test"
import { LinkOpenerContext } from "@/components/common/AnchorLink"
import { MCP_SEARCH_PAGE, toFindingsMcpViewData, VISITOR_TOOL_RESULT } from "../../.storybook/fixtures/mcpViews"
import { UPDATES_STORY } from "../../.storybook/fixtures/updates"
import { toOwnFrameDocs } from "../../.storybook/parameters"
import { PHONE_VIEWPORT_GLOBALS } from "../../.storybook/viewports"
import { McpViewShell } from "./McpViewShell"
import { mcpViewHistory, replaceMcpViewToolCall } from "./mcpViewHistory"
import {
	type McpViewToolResult,
	openMcpViewLink,
	setMcpViewApp,
	setMcpViewData,
	setMcpViewDisplayModes,
} from "./mcpViewHost"
import { mcpViewRouter } from "./mcpViewRouter"

// the route a story opens on, the mode its host shows the MCP view in, and whether its host rejects links
type McpViewStoryRoute = {
	path: string
	toolResult: McpViewToolResult
	displayMode?: McpUiDisplayMode
	isLinkDeclined?: boolean
}

// the findings a tool call returns, and the routes the stories open on
const FINDINGS_TOOL_RESULT: McpViewToolResult = {
	content: [],
	_meta: { [MCP_VIEW_META_KEY]: toFindingsMcpViewData(true) },
}
const FINDINGS_ROUTE: McpViewStoryRoute = { path: "/findings/topic-llm-tooling", toolResult: FINDINGS_TOOL_RESULT }
const SEARCH_ROUTE: McpViewStoryRoute = {
	path: "/search",
	toolResult: { content: [], structuredContent: MCP_SEARCH_PAGE },
}
const SCAN_ROUTE: McpViewStoryRoute = {
	path: "/brew/topic-llm-tooling",
	toolResult: {
		content: [],
		_meta: { [MCP_VIEW_META_KEY]: { session: null, podcastEpisodes: [], scanStatus: FINISHED_SCAN_STATUS } },
	},
}
const UPDATES_ROUTE: McpViewStoryRoute = {
	path: "/updates",
	toolResult: {
		content: [],
		_meta: { [MCP_VIEW_META_KEY]: { session: null, podcastEpisodes: [], updates: UPDATES_STORY } },
	},
}

const meta = {
	title: "MCP Apps/MCP views/McpViewShell",
	component: McpViewShell,
	parameters: { session: "user", surface: "page", docs: toOwnFrameDocs(560) },
	beforeEach: ({ parameters }) => {
		// the story host, with every display mode listed, and the route on the history's first entry
		const {
			path,
			toolResult,
			displayMode = "inline",
			isLinkDeclined = false,
		}: McpViewStoryRoute = parameters.mcpViewRoute ?? SEARCH_ROUTE
		setMcpViewApp(toStoryHost(isLinkDeclined))
		setMcpViewDisplayModes({ displayMode, availableDisplayModes: ["inline", "fullscreen", "pip"] })
		mcpViewHistory.go(-mcpViewHistory.length)
		replaceMcpViewToolCall({ toolResult, toolArguments: null }, path)
		return async () => {
			// a link that opens clears a declined link's error, so the next story starts without it
			setMcpViewApp(toStoryHost(false))
			await openMcpViewLink(SITE_URL)
			setMcpViewApp(null)
			setMcpViewData(undefined)
			setMcpViewDisplayModes({ displayMode: "inline", availableDisplayModes: [] })
		}
	},
	render: () => (
		<LinkOpenerContext.Provider value={openMcpViewLink}>
			<RouterProvider router={mcpViewRouter} />
		</LinkOpenerContext.Provider>
	),
} satisfies Meta<typeof McpViewShell>

export default meta
type Story = StoryObj<typeof meta>

// a host that returns the findings, opens or rejects a link, and shows the display mode it is asked for
function toStoryHost(isLinkDeclined: boolean): App {
	return {
		callServerTool: async ({ name }: { name: string }) =>
			name === "read_topic_feed" ? FINDINGS_TOOL_RESULT : { content: [], isError: true },
		openLink: async () => ({ isError: isLinkDeclined }),
		requestDisplayMode: async ({ mode }: { mode: McpUiDisplayMode }) => ({ mode }),
	} as unknown as App
}

// load a podcast episode paused, with no audio source. this runs after the render. mounting the audio element clears
// the player
function showPodcastPlayer(): void {
	restorePodcastEpisode({ podcastEpisode: PODCAST_STORY_EPISODE, positionSeconds: 0, playbackRate: 1 })
}

// a table route offers fullscreen, and the route an MCP view opens on has no back
export const Inline: Story = {}

// a route with no display mode shows only the brand
export const BrandOnly: Story = { parameters: { mcpViewRoute: UPDATES_ROUTE } }

// a move to a Topic's findings adds back, which returns to the recap
export const AfterMove: Story = {
	parameters: { mcpViewRoute: SCAN_ROUTE },
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(await canvas.findByRole("link", { name: "See the findings" }))
		await expect(await canvas.findByRole("button", { name: "Back" })).toBeVisible()
	},
}

// fullscreen adds the route's title and its page on the site
export const Fullscreen: Story = { parameters: { mcpViewRoute: { ...FINDINGS_ROUTE, displayMode: "fullscreen" } } }

// a loaded podcast episode offers picture in picture
export const PlayerShown: Story = { play: showPodcastPlayer }

// picture in picture shows only the brand bar and the player
export const PictureInPicture: Story = {
	parameters: { mcpViewRoute: { ...SEARCH_ROUTE, displayMode: "pip" } },
	play: showPodcastPlayer,
}

// a call that returned only text shows the tool's words in place of the route
export const ToolText: Story = {
	parameters: { session: "visitor", mcpViewRoute: { path: "/search", toolResult: VISITOR_TOOL_RESULT } },
}

// a link the host rejected says what to do instead
export const LinkDeclined: Story = {
	parameters: { mcpViewRoute: { ...FINDINGS_ROUTE, isLinkDeclined: true } },
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(await canvas.findByRole("link", { name: "Open CarlNotes in a new tab" }))
		await expect(await canvas.findByRole("alert")).toBeVisible()
	},
}

// the shell at 375 pixels
export const Phone: Story = { globals: PHONE_VIEWPORT_GLOBALS }
