import { fetchProfilePageHead } from "@carlnotes/client/pageHeadClient"
import { fetchProfile } from "@carlnotes/client/profileClient"
import { toHeadTags } from "@carlnotes/core/lib/pageHead"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { loadPageOnServer } from "@/lib/loadOnServer"
import { ProfilePage } from "@/pages/ProfilePage"

// a user's public profile page
export const Route = createFileRoute("/_layout/profiles/$userId")({
	loader: async ({ params }) => {
		// read the head and the profile on the server
		const [profileHead, profile] = await loadPageOnServer({
			fetchPageHead: () => fetchProfilePageHead(params.userId),
			fetchPage: () => fetchProfile(params.userId),
		})

		// respond 404 for a user the api does not know
		if (profileHead === null) {
			throw notFound()
		}
		return { head: profileHead, profile }
	},
	head: ({ loaderData }) => toHeadTags(loaderData?.head),
	component: ProfilePage,
	notFoundComponent: ProfilePage,
})
