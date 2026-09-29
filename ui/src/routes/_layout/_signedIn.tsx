import { createFileRoute } from "@tanstack/react-router"
import { toNoindexHeadTags } from "@/lib/pageHead"
import { requireSession } from "@/lib/requireSession"

// the pages only a signed-in user opens, rendered in the browser and left out of search results. requireSession
// sends a visitor to log in
export const Route = createFileRoute("/_layout/_signedIn")({
	ssr: false,
	beforeLoad: requireSession,
	head: () => toNoindexHeadTags(),
})
