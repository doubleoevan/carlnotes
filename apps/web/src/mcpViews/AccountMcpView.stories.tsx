// the account MCP view: the account page's heading, the caller's avatar header, and its Budget section. a visitor's
// read_account returns the connect-an-account text and no view, so no story shows one. a story has no host
import { MCP_VIEW_META_KEY } from "@carlnotes/contracts/mcpViews"
import { ACCOUNT_BUDGET_STORY_BILLING } from "@carlnotes/core/lib/accountBudgetStoryFixtures"
import { SPEND_METER_STORY_ACTIVITY } from "@carlnotes/core/lib/spendMeterStoryFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { STORY_USER, toStoryProfile } from "../../.storybook/fixtures"
import { AccountMcpView } from "./AccountMcpView"
import { setMcpViewData } from "./mcpViewHost"

// how the MCP view differs from the account page, which a frame cannot match
const DIFFERENCES_FROM_THE_PAGE = [
	"The MCP view differs from the account page where a frame cannot do what the page does.",
	"The plan button opens the site's plans page and the payment notice's Update opens the site's account page, in place of the billing portal.",
	"The Settings section is gone.",
].join(" ")

const meta = {
	title: "MCP Apps/MCP views/AccountMcpView",
	component: AccountMcpView,
	args: { mcpViewAccount: { billing: ACCOUNT_BUDGET_STORY_BILLING, spendMeter: SPEND_METER_STORY_ACTIVITY } },
	parameters: { surface: "page", session: "user", docs: { description: { component: DIFFERENCES_FROM_THE_PAGE } } },
	beforeEach: () =>
		setMcpViewData({ [MCP_VIEW_META_KEY]: { session: toStoryProfile(STORY_USER), podcastEpisodes: [] } }),
} satisfies Meta<typeof AccountMcpView>

export default meta
type Story = StoryObj<typeof meta>

// a free user's budget, with the month's image regenerations and the link to the plans page
export const SignedIn: Story = {
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("heading", { level: 1, name: "Account" })).toBeVisible()
		await expect(canvas.getByText("1 of 2 used this month")).toBeVisible()
	},
}

// a subscriber whose last payment failed: the notice's Update and the plan link open the account page
export const PastDue: Story = {
	args: {
		mcpViewAccount: {
			billing: { ...ACCOUNT_BUDGET_STORY_BILLING, plan: "plus", status: "past_due", provider: "stripe" },
			spendMeter: SPEND_METER_STORY_ACTIVITY,
		},
	},
}
