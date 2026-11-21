import { fetchTeamPage } from "@carlnotes/client/teamClient"
import { TOPIC_POSTS_PAGE_SEARCH_KEY, toTopicPostsPageOptions } from "@carlnotes/core/lib/cardSections"
import { toHeadTags, toNoindexHeadTags } from "@carlnotes/core/lib/pageHead"
import { toTeamPageResultWithUserState } from "@carlnotes/core/lib/pageUserStates"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { loadOnServer, readWithDegradedFallback } from "@/lib/loadOnServer"
import { toPageSearch } from "@/lib/pageSearch"
import { TeamPage } from "@/pages/TeamPage"

// one team's page by its id
export const Route = createFileRoute("/_layout/teams/$teamId")({
	// the page past the first of the team's Topic Posts, read from the url's search params
	validateSearch: (search: Record<string, unknown>) => toPageSearch(search, [TOPIC_POSTS_PAGE_SEARCH_KEY]),
	loaderDeps: ({ search }) => search,
	loader: async ({ params, deps }) => {
		// read the team page, which holds its head and the page of its Topic Posts that the url names, on the server
		const teamResult = await loadOnServer(
			() =>
				readWithDegradedFallback(
					async () =>
						toTeamPageResultWithUserState(
							await fetchTeamPage(params.teamId, {
								isUserStateAsked: true,
								...toTopicPostsPageOptions(deps.posts),
							}),
						),
					null,
				),
			null,
		)

		// respond 404 for a team the api does not have. a private team has no head but still has a gated page
		if (teamResult?.status === "missing") {
			throw notFound()
		}
		return { head: teamResult?.status === "visible" ? teamResult.team.head : undefined, teamResult }
	},

	// leave a private team's gated page out of search results
	head: ({ loaderData }) =>
		loaderData?.teamResult?.status === "gated" ? toNoindexHeadTags() : toHeadTags(loaderData?.head),
	component: TeamPage,
	notFoundComponent: TeamPage,
})
