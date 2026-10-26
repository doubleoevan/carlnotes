import { resourceKinds } from "@carlnotes/contracts/enums"
import { SEARCH_MIN_CHARS } from "@carlnotes/contracts/search"
import { type TopicFeedFilters, useTopicFeedFilters } from "@carlnotes/core/hooks/useTopicFeedState"
import { usePathname } from "expo-router"
import { createContext, type ReactNode, useContext, useState } from "react"
import { Keyboard } from "react-native"

// the account's search stays in memory while the user browses results
type SearchBarState = {
	searchText: string
	setSearchText: (text: string) => void
	filters: TopicFeedFilters
	setSearchFilters: (filters: TopicFeedFilters) => void
}
const SearchBarContext = createContext<SearchBarState | null>(null)

/**
 * Keeps one account's search text and filters across native navigation.
 */
export function SearchBarProvider({ children }: { children: ReactNode }) {
	// keep search selection independent of the feed's navigation resets
	const [searchText, setSearchText] = useState("")
	const filters = useTopicFeedFilters()
	const setSearchFilters = (selectedFilters: TopicFeedFilters): void => {
		// copy the toolbar's selection when opening search
		filters.resetFilters()
		filters.setSort(selectedFilters.sort)
		filters.setFindingFilter(selectedFilters.findingFilter)
		filters.setBookmarkScope(selectedFilters.bookmarkScope)
		filters.setTagFilters(selectedFilters.tagFilters)
		filters.setTagMatchMode(selectedFilters.tagMatchMode)
		for (const resourceKind of resourceKinds) {
			if (!selectedFilters.resourceKinds.has(resourceKind)) {
				filters.toggleResourceKind(resourceKind)
			}
		}
	}
	return (
		<SearchBarContext.Provider value={{ searchText, setSearchText, filters, setSearchFilters }}>
			{children}
		</SearchBarContext.Provider>
	)
}

/**
 * Returns the account's retained search and its controls.
 */
export function useSearchBar(): SearchBarState {
	const searchBar = useContext(SearchBarContext)
	if (!searchBar) {
		throw new Error("useSearchBar requires a SearchBarProvider")
	}
	return searchBar
}

/**
 * Returns to the retained search, or clears it when leaving the search screen for Home.
 */
export function useHomeLink(): { href: "/" | "/search"; onPress: () => void } {
	// match the web logo's two-step return to search and then home
	const pathname = usePathname()
	const { searchText, setSearchText, filters } = useSearchBar()
	const hasSearch = searchText.trim().length >= SEARCH_MIN_CHARS
	const href = pathname !== "/search" && hasSearch ? "/search" : "/"
	const handlePress = (): void => {
		Keyboard.dismiss()
		if (pathname === "/search") {
			// clear the search and its selection on the explicit home action
			setSearchText("")
			filters.resetFilters()
		}
	}
	return { href, onPress: handlePress }
}
