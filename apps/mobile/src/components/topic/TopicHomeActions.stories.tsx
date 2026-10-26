import { useTopicFeedFilters } from "@carlnotes/core/hooks/useTopicFeedState"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { TopicHomeActions } from "./TopicHomeActions"

// the web's tag controls and New Topic call to action
const meta = {
	title: "Topic/TopicHomeActions",
	component: HomeActionsStory,
	parameters: { webReference: "apps/web/src/pages/HomePage.tsx at 375px" },
} satisfies Meta<typeof HomeActionsStory>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

// keep tag filtering interactive without an account write
function HomeActionsStory() {
	const filters = useTopicFeedFilters()
	return (
		<View className="w-full">
			<TopicHomeActions filters={filters} knownTags={["coffee", "brewing", "technology"]} />
		</View>
	)
}
