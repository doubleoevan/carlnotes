import { useQueryClient } from "@tanstack/react-query"
import { View } from "react-native"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import { Header } from "@/components/layout/Header"
import { SearchBar } from "@/components/search/SearchBar"
import { SearchResults } from "@/components/search/SearchResults"
import { TopicPageActions } from "@/components/topic/TopicPageActions"
import { useSearchBar } from "@/providers/SearchBarProvider"
import { useTopicFeed } from "@/providers/TopicFeedProvider"

/**
 * Keeps search results available while the user opens Topics and returns through Home.
 */
export default function SearchScreen() {
	// retain search controls while the page actions reload its current results
	const { filters, searchText } = useSearchBar()
	const { knownTags } = useTopicFeed()
	const queryClient = useQueryClient()
	const handleRefresh = (): void => {
		void queryClient.invalidateQueries({ queryKey: ["site-search"] })
	}
	return (
		<View className="flex-1 bg-background">
			<Header />
			<ClassNameSafeAreaView edges={["left", "right"]} className="w-full max-w-3xl flex-1 self-center">
				{/* edit the retained search above its scrolling results */}
				<SearchBar filters={filters} actions={<TopicPageActions title="Search actions" onRefresh={handleRefresh} />} />
				<SearchResults filters={filters} searchText={searchText} knownTags={knownTags} />
			</ClassNameSafeAreaView>
		</View>
	)
}
