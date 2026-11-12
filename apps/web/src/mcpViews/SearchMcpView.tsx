import type { McpSearchPage } from "@carlnotes/contracts/mcpViews"
import type { SearchRequest } from "@carlnotes/contracts/search"
import { toCountLabel } from "@carlnotes/contracts/text"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { toSearchPageWithFindingChange } from "@/components/search/searchFindingChanges"
import { TopicFeedSort } from "@/components/topic/TopicFeedSort"
import { toMcpViewFindingHandlers } from "./mcpViewFindingHandlers"
import { callMcpViewTool, PAGE_FAILED_TEXT, setMcpViewData } from "./mcpViewHost"
import { SearchResultsTable } from "./SearchResultsTable"

/**
 * The search MCP view: the search tool's page as a table, under its count and the search bar's Sort menu. Its pages and
 * sorts call the search tool again, a topic row has Follow, a finding's controls save through its tools, and See all
 * opens the search page with the same search.
 */
export function SearchMcpView({ mcpSearchPage }: { mcpSearchPage: McpSearchPage }) {
	// the page the MCP view shows, which a new page or sort replaces, whether a search is on its way, whether its page
	// failed, and the page on its way
	const [shownSearchPage, setShownSearchPage] = useState(mcpSearchPage)
	const [isSearching, setIsSearching] = useState(false)
	const [hasPageFailed, setHasPageFailed] = useState(false)
	const [loadingPageNumber, setLoadingPageNumber] = useState<number>()
	const { searchRequest } = shownSearchPage

	// search again through the host, and show the page it returns with that page's MCP view data
	const searchAgain = async (nextSearchRequest: SearchRequest): Promise<void> => {
		setIsSearching(true)
		setHasPageFailed(false)
		setLoadingPageNumber(nextSearchRequest.page === searchRequest.page ? undefined : nextSearchRequest.page)
		const searchResult = await callMcpViewTool("search", nextSearchRequest).catch(() => null)
		setIsSearching(false)
		setLoadingPageNumber(undefined)

		// a failed call leaves the shown page in place
		if (!searchResult || searchResult.isError || !searchResult.structuredContent) {
			setHasPageFailed(true)
			return
		}

		// show the returned page
		setMcpViewData(searchResult._meta)
		setShownSearchPage(searchResult.structuredContent as McpSearchPage)
	}
	// a finding's note saves through its tool, and its row shows the change once it saves
	const topicFeedHandlers = toMcpViewFindingHandlers((findingChange) =>
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
			<SearchResultsTable
				searchPage={shownSearchPage}
				loadingPageNumber={loadingPageNumber}
				topicFeedHandlers={topicFeedHandlers}
				onOpenPage={(page) => void searchAgain({ ...searchRequest, page })}
			/>
			{hasPageFailed && (
				<p role="alert" className="text-destructive mt-2 text-right text-sm">
					{PAGE_FAILED_TEXT}
				</p>
			)}
			{/* every result on the search page, with the same search */}
			<div className="mt-3 flex justify-end">
				<Button asChild size="sm" variant="outline">
					<AnchorLink href={shownSearchPage.searchUrl}>See all on CarlNotes</AnchorLink>
				</Button>
			</div>
		</div>
	)
}
