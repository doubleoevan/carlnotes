// the dashboard MCP view: the Dashboard page's header, the links to the caller's three Dashboard pages, and the shared
// Dashboard, from the read the tool returned. a story has no host
import { MCP_VIEW_META_KEY } from "@carlnotes/contracts/mcpViews"
import {
	STORY_DASHBOARD_USER,
	STORY_PODCAST_DASHBOARD,
	STORY_TOPIC_DASHBOARD,
} from "@carlnotes/core/lib/dashboardStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { DashboardMcpView } from "./DashboardMcpView"
import { setMcpViewData } from "./mcpViewHost"

// how the MCP view differs from the Dashboard page, which a frame cannot match
const DIFFERENCES_FROM_THE_PAGE = [
	"The MCP view differs from the Dashboard page where a frame cannot do what the page does.",
	"The places chart draws the outline map, since Google Maps cannot load in the host's sandboxed frame.",
	"A bar, a slice, a pinned day's line, a place, or a link opens its page on the site through the host.",
].join(" ")

const meta = {
	title: "MCP Apps/MCP views/DashboardMcpView",
	component: DashboardMcpView,
	args: {
		mcpViewDashboard: {
			dashboardKind: "topicDashboard",
			subjectId: STORY_DASHBOARD_USER.userId,
			hasFullAccess: true,
			dashboard: STORY_TOPIC_DASHBOARD,
		},
	},
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: { session: STORY_DASHBOARD_USER, podcastEpisodes: [] } }),
	parameters: { session: "user", surface: "page", docs: { description: { component: DIFFERENCES_FROM_THE_PAGE } } },
} satisfies Meta<typeof DashboardMcpView>

export default meta
type Story = StoryObj<typeof meta>

/** The caller's Topic Dashboard with links to all three Dashboard pages, the one in view marked. */
export const TopicDashboard: Story = {
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("heading", { name: "Topic Daily Specials" })).toBeVisible()
		const dashboardPageLinks = canvas.getByRole("navigation", { name: "Specials" })
		await expect(dashboardPageLinks).toBeVisible()
		await expect(canvas.getByRole("link", { name: "Topic Specials" })).toHaveAttribute("aria-current", "page")
		await expect(canvas.getByRole("link", { name: "Team Specials" })).toBeVisible()
	},
}

/** The caller's Podcast Dashboard. */
export const PodcastDashboard: Story = {
	args: {
		mcpViewDashboard: {
			dashboardKind: "podcastDashboard",
			subjectId: STORY_DASHBOARD_USER.userId,
			hasFullAccess: true,
			dashboard: STORY_PODCAST_DASHBOARD,
		},
	},
}
