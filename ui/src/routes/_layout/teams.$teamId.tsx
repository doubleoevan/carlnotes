import { createFileRoute, notFound } from "@tanstack/react-router"
import { fetchTeamPageHead } from "@/clients/pageHeadClient"
import { fetchTeamPage } from "@/clients/teamClient"
import { loadPageOnServer } from "@/lib/loadOnServer"
import { toHeadTags, toNoindexHeadTags } from "@/lib/pageHead"
import { TeamPage } from "@/pages/TeamPage"

// one team's page by its id
export const Route = createFileRoute("/_layout/teams/$teamId")({
	loader: async ({ params }) => {
		// read the head and the team page on the server
		const [teamHead, teamResult] = await loadPageOnServer({
			fetchPageHead: () => fetchTeamPageHead(params.teamId),
			fetchPage: () => fetchTeamPage(params.teamId),
		})

		// respond 404 only if the api has neither a head nor a page for the team. a private team has no head
		// but still has a gated page
		if (teamHead === null && teamResult?.status === "missing") {
			throw notFound()
		}
		return { head: teamHead, teamResult }
	},

	// leave a private team's gated page out of search results
	head: ({ loaderData }) =>
		loaderData?.teamResult?.status === "gated" ? toNoindexHeadTags() : toHeadTags(loaderData?.head),
	component: TeamPage,
	notFoundComponent: TeamPage,
})
