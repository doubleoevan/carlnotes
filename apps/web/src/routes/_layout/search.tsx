import { searchSite } from "@carlnotes/client/searchClient"
import { toNoindexHeadTags } from "@carlnotes/core/lib/pageHead"
import { createFileRoute } from "@tanstack/react-router"
import { toRouteSearchRequest, toValidatedRouteSearch } from "@/components/search/searchRouteSearch"
import { loadOnServer, readWithDegradedFallback } from "@/lib/loadOnServer"
import { SearchPage } from "@/pages/SearchPage"

// the search page, whose search lives in its url. a visitor's search reads on the server, and the page is never indexed
export const Route = createFileRoute("/_layout/search")({
	// every key is named, so a rejected url value is cleared instead of kept from the raw url
	validateSearch: toValidatedRouteSearch,
	loaderDeps: ({ search: searchRouteSearch }) => searchRouteSearch,
	loader: async ({ deps }) => ({
		searchPage: await loadOnServer(
			() => readWithDegradedFallback(() => searchSite(toRouteSearchRequest(deps)), null),
			null,
		),
	}),
	head: () => toNoindexHeadTags("Search"),
	component: SearchPage,
})
