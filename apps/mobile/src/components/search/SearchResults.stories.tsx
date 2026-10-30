import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView, View } from "react-native"
import { STORY_TOPIC_FEED_HANDLERS } from "@/components/topic/topicFeedStories"
import { SearchBarProvider, useSearchBar } from "@/providers/SearchBarProvider"
import { SearchBar } from "./SearchBar"
import { SearchResults, SearchStatus } from "./SearchResults"
import { SearchResultsList } from "./SearchResultsList"
import { STORY_SEARCH_RESULTS_PAGE } from "./SearchResultsList.stories"

// the search screen reads the existing API with its own text and filter lifetime
const meta: Meta<typeof SearchResultsStory> = {
	title: "Search/SearchResults",
	component: SearchResultsStory,
	parameters: { webReference: "apps/web/src/pages/SearchPage.tsx" },
	decorators: [
		(Story) => (
			<SearchBarProvider>
				<Story />
			</SearchBarProvider>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
// a refetch that failed keeps the last results on screen below its error line
export const RefreshFailed: Story = { render: () => <RefreshFailedStory /> }

// the error line above the stale rows, as the screen lays them out after a failed refetch
function RefreshFailedStory() {
	return (
		<ScrollView className="w-full flex-1 pt-4">
			<View className="px-4">
				<SearchStatus isSearching={false} hasError hasQuery hasRows searchText="coffee" onRetry={() => {}} />
			</View>
			<SearchResultsList
				pages={[STORY_SEARCH_RESULTS_PAGE]}
				state={{ handlers: STORY_TOPIC_FEED_HANDLERS, pendingChanges: [] }}
			/>
		</ScrollView>
	)
}

// keep the editable toolbar above its scrolling results
function SearchResultsStory() {
	const { filters, searchText } = useSearchBar()
	return (
		<View className="w-full flex-1 pt-4">
			<SearchBar filters={filters} />
			<SearchResults filters={filters} searchText={searchText} />
		</View>
	)
}
