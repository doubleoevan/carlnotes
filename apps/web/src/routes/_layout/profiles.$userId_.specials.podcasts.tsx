import { toHeadTags } from "@carlnotes/core/lib/pageHead"
import { createFileRoute } from "@tanstack/react-router"
import { loadDashboardRoute } from "@/lib/dashboardRoute"
import { DashboardPage } from "@/pages/DashboardPage"

// a person's Podcast Dashboard: the plays of their podcast episodes and films
export const Route = createFileRoute("/_layout/profiles/$userId_/specials/podcasts")({
	loader: ({ params }) => loadDashboardRoute("podcastDashboard", params.userId),
	head: ({ loaderData }) => toHeadTags(loaderData?.head),
	component: PodcastDashboardRoute,
	notFoundComponent: PodcastDashboardRoute,
})

// the page with the route's person and the server's starting read
function PodcastDashboardRoute() {
	const { userId } = Route.useParams()
	const initialDashboard = Route.useLoaderData({ select: (loaderData) => loaderData?.initialDashboard ?? null })
	return <DashboardPage dashboardKind="podcastDashboard" subjectId={userId} initialDashboard={initialDashboard} />
}
