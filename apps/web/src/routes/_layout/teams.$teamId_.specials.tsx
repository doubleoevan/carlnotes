import { toHeadTags } from "@carlnotes/core/lib/pageHead"
import { createFileRoute } from "@tanstack/react-router"
import { loadDashboardRoute } from "@/lib/dashboardRoute"
import { DashboardPage } from "@/pages/DashboardPage"

// a team's Team Dashboard: the visitors to its topics, findings, and Topic Posts, with the charts for its members
export const Route = createFileRoute("/_layout/teams/$teamId_/specials")({
	loader: ({ params }) => loadDashboardRoute("teamDashboard", params.teamId),
	head: ({ loaderData }) => toHeadTags(loaderData?.head),
	component: TeamDashboardRoute,
	notFoundComponent: TeamDashboardRoute,
})

// the page with the route's team and the server's starting read
function TeamDashboardRoute() {
	const { teamId } = Route.useParams()
	const initialDashboard = Route.useLoaderData({ select: (loaderData) => loaderData?.initialDashboard ?? null })
	return <DashboardPage dashboardKind="teamDashboard" subjectId={teamId} initialDashboard={initialDashboard} />
}
