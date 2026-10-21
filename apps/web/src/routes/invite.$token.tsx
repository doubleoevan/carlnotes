import { fetchInvitePageHead } from "@carlnotes/client/pageHeadClient"
import { toHeadTags, toNoindexHeadTags } from "@carlnotes/core/lib/pageHead"
import { createFileRoute } from "@tanstack/react-router"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { loadOnServer, readWithDegradedFallback } from "@/lib/loadOnServer"
import { InvitePage } from "@/pages/InvitePage"

// the join page for an invite url. the server renders only the invite's head and card,
// and the join page renders in the browser
export const Route = createFileRoute("/invite/$token")({
	ssr: "data-only",
	loader: ({ params }) =>
		loadOnServer(() => readWithDegradedFallback(() => fetchInvitePageHead(params.token), null), null),
	// an invite is never in search results, and neither is a token with no live invite
	head: ({ loaderData }) => (loaderData ? toHeadTags(loaderData) : toNoindexHeadTags()),
	component: InvitePage,
	pendingComponent: CoffeeLoading,
})
