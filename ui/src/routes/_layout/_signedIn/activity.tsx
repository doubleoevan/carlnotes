import { createFileRoute } from "@tanstack/react-router"
import { ActivityPage } from "@/pages/ActivityPage"

// the user's own activity page or another user's activity page for an admin
export const Route = createFileRoute("/_layout/_signedIn/activity")({
	component: ActivityPage,
})
