import { fetchProfileNews } from "@carlnotes/client/newsClient"
import { fetchProfilePageHead } from "@carlnotes/client/pageHeadClient"
import { fetchProfile } from "@carlnotes/client/profileClient"
import { DEFAULT_NEWS_WINDOW } from "@carlnotes/contracts/news"
import { toHeadTags } from "@carlnotes/core/lib/pageHead"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { loadOnServer, loadPageOnServer, readWithDegradedFallback } from "@/lib/loadOnServer"
import { ProfilePage } from "@/pages/ProfilePage"

// a user's public profile page
export const Route = createFileRoute("/_layout/profiles/$userId")({
	loader: async ({ params }) => {
		// read the head, the profile, and the first page of the week's news on the server
		const [[profileHead, profile], newsPage] = await Promise.all([
			loadPageOnServer({
				fetchPageHead: () => fetchProfilePageHead(params.userId),
				fetchPage: () => fetchProfile(params.userId),
			}),
			loadOnServer(
				() =>
					readWithDegradedFallback(
						() => fetchProfileNews(params.userId, { window: DEFAULT_NEWS_WINDOW, page: 1 }),
						null,
					),
				null,
			),
		])

		// respond 404 for a user the api does not know
		if (profileHead === null) {
			throw notFound()
		}
		return { head: profileHead, profile, newsPage }
	},
	head: ({ loaderData }) => toHeadTags(loaderData?.head),
	component: ProfilePage,
	notFoundComponent: ProfilePage,
})
