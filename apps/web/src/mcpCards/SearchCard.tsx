import type { McpSearchPage } from "@carlnotes/contracts/mcpCards"
import type { SearchRequest } from "@carlnotes/contracts/search"
import { toCountLabel } from "@carlnotes/core/lib/labels"
import { useState } from "react"
import { Button } from "@/components/primitives/button"
import { SearchResultsList } from "@/components/search/SearchResultsList"
import { toSearchPageWithFindingChange } from "@/components/search/searchFindingChanges"
import { TopicFeedSort } from "@/components/topic/TopicFeedSort"
import { CardPodcastPlayer } from "./CardPodcastPlayer"
import { CardSubscribeButton } from "./CardSubscribeButton"
import { toCardFindingHandlers } from "./cardFindingHandlers"
import { callCardTool, openHostLink, setCardData } from "./cardHost"

/**
 * The search card: the search tool's page in the search page's own list, under its count and the search bar's Sort
 * menu. Its pages and sorts call the search tool again, a topic row has Follow, a finding's note saves through its
 * tools, and See all opens the search page with the same search.
 */
export function SearchCard({ mcpSearchPage }: { mcpSearchPage: McpSearchPage }) {
	// the page the card shows, which a new page or sort replaces, whether a search is on its way, and the page on its way
	const [shownSearchPage, setShownSearchPage] = useState(mcpSearchPage)
	const [isSearching, setIsSearching] = useState(false)
	const [loadingPageNumber, setLoadingPageNumber] = useState<number>()
	const { searchRequest } = shownSearchPage

	// search again through the host, and show the page it returns with that page's card data
	const searchAgain = async (nextSearchRequest: SearchRequest): Promise<void> => {
		setIsSearching(true)
		setLoadingPageNumber(nextSearchRequest.page === searchRequest.page ? undefined : nextSearchRequest.page)
		try {
			const searchResult = await callCardTool("search", nextSearchRequest)
			if (!searchResult.isError && searchResult.structuredContent) {
				setCardData(searchResult._meta)
				setShownSearchPage(searchResult.structuredContent as McpSearchPage)
			}
		} finally {
			setIsSearching(false)
			setLoadingPageNumber(undefined)
		}
	}
	// a finding's note saves through its tool, and its row shows the change once it saves
	const topicFeedHandlers = toCardFindingHandlers((findingChange) =>
		setShownSearchPage((previousSearchPage) => toSearchPageWithFindingChange(previousSearchPage, findingChange)),
	)
	return (
		<div className={isSearching && !loadingPageNumber ? "opacity-60" : undefined}>
			{/* the result count, and the Sort menu the search bar shows */}
			<div className="mb-2 flex items-center justify-between gap-3">
				<p className="text-muted-foreground text-sm">
					{toCountLabel(shownSearchPage.rowCount, "search result")} for “{searchRequest.q}”
				</p>
				<TopicFeedSort
					searchSort={{
						sort: searchRequest.sort,
						onSort: (sort) => void searchAgain({ ...searchRequest, sort, page: 1 }),
					}}
				/>
			</div>
			<SearchResultsList
				searchPage={shownSearchPage}
				loadingPageNumber={loadingPageNumber}
				topicFeedHandlers={topicFeedHandlers}
				searchPagination={{ onOpenPage: (page) => void searchAgain({ ...searchRequest, page }) }}
				renderTopicAction={(topicSearchRow) => (
					<CardSubscribeButton topicId={topicSearchRow.id} isSubscribed={topicSearchRow.isSubscribed} />
				)}
			/>
			{/* every result on the search page, with the same search */}
			<div className="mt-3 flex justify-end">
				<Button size="sm" variant="outline" onClick={() => openHostLink(shownSearchPage.searchUrl)}>
					See all on CarlNotes
				</Button>
			</div>
			<CardPodcastPlayer />
		</div>
	)
}
