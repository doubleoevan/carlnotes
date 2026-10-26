import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { SearchBarProvider, useSearchBar } from "@/providers/SearchBarProvider"
import { SearchBar } from "./SearchBar"
import { SearchResults } from "./SearchResults"

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
