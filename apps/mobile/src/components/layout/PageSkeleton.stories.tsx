import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { TOPIC_POST_PAGE_ELEMENTS } from "@/components/topicPost/TopicPostScreen"
import { PageSkeleton, TableSkeleton } from "./PageSkeleton"

// compare the same page kinds and partial table state as the web component browser
const meta: Meta<typeof PageSkeleton> = {
	title: "Layout/PageSkeleton",
	component: PageSkeleton,
	parameters: { webReference: "apps/web/src/components/layout/PageSkeleton.stories.tsx" },
	args: { kind: "profile" },
	decorators: [
		(Story) => (
			<ScrollView className="w-full flex-1">
				<Story />
			</ScrollView>
		),
	],
}
export default meta
// the page kinds take different props, so a story is typed by the component
type Story = StoryObj<typeof PageSkeleton>
export const Profile: Story = {}
export const Teams: Story = { args: { kind: "teams" } }
export const Activity: Story = { args: { kind: "activity" } }
// the budget of a user, which lists its monthly budget cutoffs, and of an admin, which lists none
export const Account: Story = { args: { kind: "account", hasMonthlyBudgetCutoffs: true } }
export const AccountWithoutCutoffs: Story = { args: { kind: "account", hasMonthlyBudgetCutoffs: false } }
// a team's four card sections, Featured Films right before Featured Podcasts, over its three tables
export const Team: Story = { args: { kind: "team" } }
// a Topic Post's loading state in the loaded screen's own header and discussion card
export const TopicPost: Story = { args: { kind: "topicPost", pageElements: TOPIC_POST_PAGE_ELEMENTS } }
export const TopicsLoading: Story = { render: () => <TableSkeleton /> }
