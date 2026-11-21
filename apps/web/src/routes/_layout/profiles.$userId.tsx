import { fetchProfilePageRead } from "@carlnotes/client/pageReadClient"
import { TOPIC_POSTS_PAGE_SEARCH_KEY, toTopicPostsPageOptions } from "@carlnotes/core/lib/cardSections"
import { toHeadTags } from "@carlnotes/core/lib/pageHead"
import { toProfileWithUserState } from "@carlnotes/core/lib/pageUserStates"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { loadPageReadOnServer } from "@/lib/loadOnServer"
import { toPageSearch } from "@/lib/pageSearch"
import { ProfilePage } from "@/pages/ProfilePage"

// a user's public profile page
export const Route = createFileRoute("/_layout/profiles/$userId")({
	// the page past the first of the person's Topic Posts, read from the url's search params
	validateSearch: (search: Record<string, unknown>) => toPageSearch(search, [TOPIC_POSTS_PAGE_SEARCH_KEY]),
	loaderDeps: ({ search }) => search,
	loader: async ({ params, deps }) => {
		// read the profile's page read on the server: the head, the profile with the page of its Topic Posts that the
		// url names, and the first page of the week's news
		const profilePageRead = await loadPageReadOnServer(() =>
			fetchProfilePageRead(params.userId, undefined, toTopicPostsPageOptions(deps.posts)),
		)

		// respond 404 for a user the api does not know
		if (profilePageRead === null) {
			throw notFound()
		}
		return {
			head: profilePageRead?.head,
			profile: toProfileWithUserState(profilePageRead),
			newsPage: profilePageRead?.news ?? null,
		}
	},
	head: ({ loaderData }) => toHeadTags(loaderData?.head),
	component: ProfilePage,
	notFoundComponent: ProfilePage,
})
