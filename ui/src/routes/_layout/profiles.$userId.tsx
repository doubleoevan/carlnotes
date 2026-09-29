import { createFileRoute, notFound } from "@tanstack/react-router"
import { fetchProfilePageHead } from "@/clients/pageHeadClient"
import { fetchProfile } from "@/clients/profileClient"
import { loadPageOnServer } from "@/lib/loadOnServer"
import { toHeadTags } from "@/lib/pageHead"
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
