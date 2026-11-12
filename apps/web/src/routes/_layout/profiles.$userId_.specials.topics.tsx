import { toHeadTags } from "@carlnotes/core/lib/pageHead"
import { createFileRoute } from "@tanstack/react-router"
import { loadDashboardRoute } from "@/lib/dashboardRoute"
import { DashboardPage } from "@/pages/DashboardPage"

// a person's Topic Dashboard: the visitors to their topics, findings, and Topic Posts
export const Route = createFileRoute("/_layout/profiles/$userId_/specials/topics")({
	loader: ({ params }) => loadDashboardRoute("topicDashboard", params.userId),
	head: ({ loaderData }) => toHeadTags(loaderData?.head),
	component: TopicDashboardRoute,
	notFoundComponent: TopicDashboardRoute,
})

// the page with the route's person and the server's starting read
function TopicDashboardRoute() {
	const { userId } = Route.useParams()
	const initialDashboard = Route.useLoaderData({ select: (loaderData) => loaderData?.initialDashboard ?? null })
	return <DashboardPage dashboardKind="topicDashboard" subjectId={userId} initialDashboard={initialDashboard} />
}
