// what the mcp search tool returns: the site search's page with every row's absolute url, the search that found it,
// and the search page's url, under the same search rate limit the site's route counts against
import type { McpSearchPage } from "@carlnotes/contracts/mcpCards"
import { type SearchRequest, toSearchPath } from "@carlnotes/contracts/search"
import { appUrl } from "@carlnotes/server/appUrl"
import { countSearchRateLimitHit } from "../rateLimit"
import { searchSite } from "../search/search"
import type { ToolCaller } from "./toolCaller"

// what a visitor or a user past the search rate limit reads
export const SEARCH_RATE_LIMITED_TEXT = "That's a lot of searching for one minute. Try again in a minute."

// who is searching, the client address a visitor counts under, and the search
type SearchForToolOptions = { toolCaller: ToolCaller; clientAddress: string | null; searchRequest: SearchRequest }

/**
 * Runs the site search for an mcp caller, or returns the rate limit's text for a caller past it.
 */
export async function searchForTool({
	toolCaller,
	clientAddress,
	searchRequest,
}: SearchForToolOptions): Promise<McpSearchPage | { text: string }> {
	// count the search against the site's search limit under the caller's key
	const userId = toolCaller.kind === "user" ? toolCaller.userId : null
	if (!(await countSearchRateLimitHit({ userId, clientAddress }))) {
		return { text: SEARCH_RATE_LIMITED_TEXT }
	}

	// the site's search, with each row's absolute url and the search page's
	const searchPage = await searchSite({ userId, clientAddress, searchRequest })
	const siteUrl = appUrl()
	return {
		...searchPage,
		rows: searchPage.rows.map((searchRow) => ({
			...searchRow,
			url: searchRow.kind === "finding" ? searchRow.finding.url : `${siteUrl}${searchRow.path}`,
		})),
		searchRequest,
		searchUrl: `${siteUrl}${toSearchPath({ ...searchRequest, page: 1 })}`,
	}
}

/**
 * Returns a search page as lines a client without a card reads: each row's kind, name, and url, then where the page sits.
 */
export function toSearchText(mcpSearchPage: McpSearchPage): string {
	if (mcpSearchPage.rowCount === 0) {
		return `Nothing matches "${mcpSearchPage.searchRequest.q}".`
	}

	// a line per row, then the page's place and the search page that holds every result
	const rowLines = mcpSearchPage.rows.map(
		(mcpSearchRow) => `${mcpSearchRow.kind}: ${mcpSearchRow.name} — ${mcpSearchRow.url}`,
	)
	const pageLine = `Page ${mcpSearchPage.page} of ${mcpSearchPage.pageCount}, ${mcpSearchPage.rowCount} results. Every result: ${mcpSearchPage.searchUrl}`
	return [...rowLines, pageLine].join("\n")
}
