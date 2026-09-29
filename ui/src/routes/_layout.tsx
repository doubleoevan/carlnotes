import { createFileRoute } from "@tanstack/react-router"
import { Layout } from "@/components/layout/Layout"
import { hasSessionCookie } from "@/lib/sessionCookie"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { TopicFeedProvider } from "@/providers/TopicFeedProvider"

// every page but the auth pages and the join page shares one topic feed context and the Layout shell: header,
// search bar, footer. a path that only partly matches a page renders NotFoundPage inside the shell
export const Route = createFileRoute("/_layout")({
	// render on the server only for a request with no session cookie. the server reads the api without the
	// cookie, so a server render always shows a visitor's page
	ssr: async () => !(await hasSessionCookie()),
	component: LayoutRoute,
	notFoundComponent: NotFoundPage,
})

function LayoutRoute() {
	return (
		<TopicFeedProvider>
			<Layout />
		</TopicFeedProvider>
	)
}
