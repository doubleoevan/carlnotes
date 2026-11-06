// the scan MCP view: a Topic's running Scan, its recap, and its Podcast Episode. its polls and its stop call their tools
// through the host. a story has no host, so each story keeps the status it opens with

import {
	FINISHED_SCAN_STATUS,
	IDLE_SCAN_STATUS,
	REVIEWING_SCAN_STATUS,
	RUNNING_SCAN_STATUS,
	toRecapWithPodcastEpisode,
} from "@carlnotes/contracts/mcpScanStatusTestFixtures"
import { MCP_VIEW_META_KEY } from "@carlnotes/contracts/mcpViews"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { setMcpViewData } from "./mcpViewHost"
import { ScanMcpView } from "./ScanMcpView"

// the page a recap's Podcast Episode links to, and the Podcast Episode the tool result can play
const PODCAST_EPISODE_PATH = "/topics/topic-llm-tooling/llm-tooling/episodes/2026/7"
const PODCAST_EPISODE = toPodcastEpisodeFixture({ pagePath: PODCAST_EPISODE_PATH })

const meta = {
	title: "MCP Apps/MCP views/ScanMcpView",
	component: ScanMcpView,
	args: { firstScanStatus: RUNNING_SCAN_STATUS },
	parameters: { session: "user", surface: "page" },
} satisfies Meta<typeof ScanMcpView>

export default meta
type Story = StoryObj<typeof meta>

// the owner's running Scan, with its stop control
export const Running: Story = {}

// gathering has ended, so each Source's counts show
export const Reviewing: Story = { args: { firstScanStatus: REVIEWING_SCAN_STATUS } }

// a visitor watching a public Topic's Scan has no stop control
export const Visitor: Story = {
	args: { firstScanStatus: { ...REVIEWING_SCAN_STATUS, canStop: false } },
	parameters: { session: "visitor" },
}

// a Topic with no Scan yet
export const Idle: Story = { args: { firstScanStatus: IDLE_SCAN_STATUS } }

// the recap with no Podcast Episode, and the move to the Topic's findings
export const Finished: Story = { args: { firstScanStatus: FINISHED_SCAN_STATUS } }

// a Scan that failed shows the diary's line
export const Failed: Story = {
	args: { firstScanStatus: { ...FINISHED_SCAN_STATUS, status: "failed", scanSummary: null, sourceResults: null } },
}

// the recap while its Podcast Episode records
export const PodcastEpisodeRecording: Story = {
	args: { firstScanStatus: toRecapWithPodcastEpisode({ state: "recording" }) },
}

// the recap with its Podcast Episode's play button
export const PodcastEpisodePublished: Story = {
	args: {
		firstScanStatus: toRecapWithPodcastEpisode({
			state: "published",
			podcastEpisodeId: PODCAST_EPISODE.id,
			pagePath: PODCAST_EPISODE_PATH,
		}),
	},
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: { session: null, podcastEpisodes: [PODCAST_EPISODE] } }),
}

// a published Podcast Episode the tool result has no player data for links to its page
export const PodcastEpisodeLink: Story = {
	args: {
		firstScanStatus: toRecapWithPodcastEpisode({
			state: "published",
			podcastEpisodeId: "podcast-episode-unknown",
			pagePath: PODCAST_EPISODE_PATH,
		}),
	},
}
