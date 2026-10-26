import { useTopicFeedFilters } from "@carlnotes/core/hooks/useTopicFeedState"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { TopicHomeActions } from "@/components/topic/TopicHomeActions"
import { TopicPageActions } from "@/components/topic/TopicPageActions"
import { SearchBar } from "./SearchBar"

// the full web toolbar keeps the real filters and site search interactive
const meta = {
	title: "Search/SearchBar",
	component: SearchBarStory,
	parameters: { webReference: "apps/web/src/components/search/SearchBar.tsx at 375px" },
} satisfies Meta<typeof SearchBarStory>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

// keep selections within the story's own lifetime
function SearchBarStory() {
	const filters = useTopicFeedFilters()
	return (
		<View className="w-full pt-4">
			<SearchBar filters={filters} actions={<TopicPageActions onRefresh={() => undefined} />} />
			<TopicHomeActions filters={filters} knownTags={["coffee", "brewing", "technology"]} />
		</View>
	)
}
