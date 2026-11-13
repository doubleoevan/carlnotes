// the activity MCP view: the Activity page's heading, the caller's avatar header, and its two sections. a visitor's
// read_activity returns the connect-an-account text and no view, so no story shows one. a story has no host
import { TEST_SUBSCRIPTIONS, TEST_TOPIC_INVITES } from "@carlnotes/contracts/activityTestFixtures"
import { MCP_VIEW_META_KEY } from "@carlnotes/contracts/mcpViews"
import { SPEND_METER_STORY_ACTIVITY } from "@carlnotes/core/lib/spendMeterStoryFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { STORY_USER, toStoryProfile } from "../../.storybook/fixtures"
import { ActivityMcpView } from "./ActivityMcpView"
import { setMcpViewData } from "./mcpViewHost"

// the signed-in caller the view heads with, and an activity's spend, which the view does not show
const STORY_CALLER = toStoryProfile(STORY_USER)
const STORY_ACTIVITY = { ...SPEND_METER_STORY_ACTIVITY, user: STORY_CALLER, topics: [] }

// how the MCP view differs from the Activity page, which a frame cannot match
const DIFFERENCES_FROM_THE_PAGE = [
	"The MCP view differs from the Activity page where no tool does what the page does.",
	"The followed topics have no Emails column and no delete, and a sent invite has no withdraw.",
	"The New Topic button and the waiting-invites badge are gone.",
].join(" ")

const meta = {
	title: "MCP Apps/MCP views/ActivityMcpView",
	component: ActivityMcpView,
	args: {
		mcpViewActivity: {
			activity: { ...STORY_ACTIVITY, subscriptions: TEST_SUBSCRIPTIONS, invites: TEST_TOPIC_INVITES },
		},
	},
	parameters: { surface: "page", session: "user", docs: { description: { component: DIFFERENCES_FROM_THE_PAGE } } },
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: { session: STORY_CALLER, podcastEpisodes: [] } }),
} satisfies Meta<typeof ActivityMcpView>

export default meta
type Story = StoryObj<typeof meta>

// a user's activity: the Active switches and a pending invite's delete, with no Emails column
export const SignedIn: Story = {
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible()
		await expect(canvas.getByText("Topics you follow")).toBeVisible()
		await expect(canvas.queryByText("Emails", { exact: true })).toBeNull()
	},
}

// a user who follows nothing and sent no invites sees each section's empty card
export const Empty: Story = {
	args: { mcpViewActivity: { activity: { ...STORY_ACTIVITY, subscriptions: [], invites: [] } } },
}
