import { useTopicFeedFilters } from "@carlnotes/core/hooks/useTopicFeedState"
import type { Meta, StoryObj } from "@storybook/react-native"
import { Coffee } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { Text } from "@/components/primitives/text"
import { TopicHomeActions } from "@/components/topic/TopicHomeActions"
import { PageActionMenu } from "./PageActionMenu"
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
	const [reheatCount, setReheatCount] = useState(0)
	return (
		<View className="w-full pt-4">
			<SearchBar
				filters={filters}
				actions={
					<PageActionMenu
						page="Home"
						hasNewTopicButton
						options={[{ label: "Reheat", icon: Coffee, onSelect: () => setReheatCount((count) => count + 1) }]}
					/>
				}
			/>
			<TopicHomeActions filters={filters} knownTags={["coffee", "brewing", "technology"]} />
			<Text className="px-4">Feed refreshed {reheatCount} times</Text>
		</View>
	)
}
