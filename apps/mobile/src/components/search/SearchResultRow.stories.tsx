import type { Meta, StoryObj } from "@storybook/react-native"
import { Coffee } from "lucide-react-native"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SearchResultRow } from "./SearchResultRow"
import { TopicSearchResultDetails } from "./TopicSearchResultDetails"

const meta = {
	title: "Search/SearchResultRow",
	component: SearchResultRowStory,
	args: { rank: 1 },
} satisfies Meta<typeof SearchResultRowStory>
export default meta
type Story = StoryObj<typeof meta>
export const Ranked: Story = {}
export const WithoutRank: Story = { args: { rank: undefined } }

// Build the native elements at render time so the component browser only serializes the rank.
function SearchResultRowStory({ rank }: { rank?: number }) {
	return (
		<SearchResultRow
			rank={rank}
			title={<Text className="text-sm font-semibold text-card-foreground">AI gone rogue</Text>}
			details={
				<>
					<Icon as={Coffee} className="size-4 text-muted-foreground" />
					<TopicSearchResultDetails viewerCount={11} subscriberCount={8} />
				</>
			}
		/>
	)
}
