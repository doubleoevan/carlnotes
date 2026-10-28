import { useTopicFeedFilters } from "@carlnotes/core/hooks/useTopicFeedState"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicFeedControls } from "./TopicFeedControls"
import { FEED_WEB_REFERENCES } from "./topicFeedStories"

// the stories exercise the real selection hook without a query or account
const meta = {
	title: "Topic/TopicFeedControls",
	component: ControlledChoices,
	parameters: { webReference: FEED_WEB_REFERENCES.controls },
} satisfies Meta<typeof ControlledChoices>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Team: Story = { args: { hasTeamBookmarks: true } }
export const Compact: Story = { args: { isCompact: true } }
export const Visitor: Story = { args: { isSignedIn: false } }

// keep every sort and bookmark choice interactive
function ControlledChoices({
	hasTeamBookmarks,
	isCompact,
	isSignedIn = true,
}: {
	hasTeamBookmarks?: boolean
	isCompact?: boolean
	isSignedIn?: boolean
}) {
	const filters = useTopicFeedFilters()
	return (
		<TopicFeedControls
			filters={filters}
			hasTeamBookmarks={hasTeamBookmarks}
			isCompact={isCompact}
			isSignedIn={isSignedIn}
		/>
	)
}
