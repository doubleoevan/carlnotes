import { toNoindexHeadTags } from "@carlnotes/core/lib/pageHead"
import { createFileRoute } from "@tanstack/react-router"
import { TeamsPage } from "@/pages/TeamsPage"

// the teams page, the teams a user belongs to, behind sign-in like Activity. it is left out of search results
export const Route = createFileRoute("/_layout/_signedIn/teams/")({
	head: () => toNoindexHeadTags("Teams"),
	component: TeamsPage,
})
