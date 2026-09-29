import { createFileRoute } from "@tanstack/react-router"
import { toNoindexHeadTags } from "@/lib/pageHead"
import { TeamsPage } from "@/pages/TeamsPage"

// the teams page, the teams a user belongs to. a visitor has none, so the page is left out of search results
export const Route = createFileRoute("/_layout/teams/")({
	head: () => toNoindexHeadTags("Teams"),
	component: TeamsPage,
})
