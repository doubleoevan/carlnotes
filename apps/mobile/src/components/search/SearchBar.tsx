import { SEARCH_MAX_CHARS, SEARCH_MIN_CHARS } from "@carlnotes/contracts/search"
import { router } from "expo-router"
import { Search, X } from "lucide-react-native"
import type { ReactNode } from "react"
import { Keyboard, TextInput, View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { TopicFeedControls, type TopicFeedControlsProps } from "@/components/topic/TopicFeedControls"
import { useSearchBar } from "@/providers/SearchBarProvider"
import { toTypeRoleStyle } from "@/typeRoleStyles"

// the same search prompt on the toolbar and the editable search screen
const SEARCH_PLACEHOLDER = "Topics, podcasts, findings, teams, users..."
const SEARCH_LABEL = "Search topics, podcasts, findings, teams and users"

/**
 * Matches the web toolbar and keeps the active search visible while browsing Topics.
 */
export function SearchBar({
	filters,
	hasTeamBookmarks,
	actions,
	hasSort,
}: TopicFeedControlsProps & { actions?: ReactNode }) {
	// keep editing on the current screen and open results only on submission
	const { searchText, setSearchText, setSearchFilters } = useSearchBar()
	const handleSubmit = (): void => {
		if (searchText.trim().length < SEARCH_MIN_CHARS) {
			return
		}
		// carry the visible toolbar's filters into the search
		setSearchFilters(filters)
		Keyboard.dismiss()
		router.navigate("/search")
	}
	return (
		<View className="mx-4 -mt-3 mb-2 min-h-14 flex-row items-center rounded-lg border border-separator bg-card px-2 shadow-raised">
			{/* edit the same retained search on every reading screen */}
			<View className="min-w-0 flex-1 flex-row items-center gap-2 pl-1">
				<Icon as={Search} className="size-4 text-muted-foreground" />
				<TextInput
					accessibilityLabel={SEARCH_LABEL}
					placeholder={SEARCH_PLACEHOLDER}
					maxLength={SEARCH_MAX_CHARS}
					value={searchText}
					onChangeText={setSearchText}
					onSubmitEditing={handleSubmit}
					autoCorrect={false}
					returnKeyType="search"
					style={toTypeRoleStyle("body")}
					className="min-h-12 min-w-0 flex-1 text-foreground placeholder:text-muted-foreground"
				/>
				{searchText ? (
					<Button variant="ghost" size="icon" accessibilityLabel="Clear search" onPress={() => setSearchText("")}>
						<Icon as={X} className="size-4 text-muted-foreground" />
					</Button>
				) : null}
			</View>
			{/* the web's filter, sort, and page actions */}
			<View className="ml-1 border-l border-separator pl-1">
				<TopicFeedControls filters={filters} hasTeamBookmarks={hasTeamBookmarks} hasSort={hasSort} isCompact />
			</View>
			{actions}
		</View>
	)
}
