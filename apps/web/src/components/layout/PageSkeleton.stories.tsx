import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { TOPIC_POST_PAGE_ELEMENTS } from "@/pages/TopicPostPage"
import { PageSkeleton, TableSkeleton } from "./PageSkeleton"

// compare each initial loading layout in the same theme and viewport as its page
const meta = {
	title: "Layout/PageSkeleton",
	component: PageSkeleton,
	args: { kind: "profile" },
} satisfies Meta<typeof PageSkeleton>
export default meta
type Story = StoryObj<typeof meta>
export const Profile: Story = {}
export const Teams: Story = { args: { kind: "teams" } }
export const Activity: Story = { args: { kind: "activity" } }
// the budget of a user, which lists its monthly budget cutoffs, and of an admin, which lists none
export const Account: Story = { args: { kind: "account", hasMonthlyBudgetCutoffs: true } }
export const AccountWithoutCutoffs: Story = { args: { kind: "account", hasMonthlyBudgetCutoffs: false } }
// a team's four card sections, Featured Films right before Featured Podcasts, over its three tables
export const Team: Story = { args: { kind: "team" } }
// a Topic Post's loading state in the loaded page's own header and discussion card
export const TopicPost: Story = { args: { kind: "topicPost", pageElements: TOPIC_POST_PAGE_ELEMENTS } }
export const TopicsLoading: Story = { render: () => <TableSkeleton /> }
