import { createFileRoute } from "@tanstack/react-router"
import { AdminPage } from "@/pages/AdminPage"

// the admin console page
export const Route = createFileRoute("/_layout/_signedIn/admin")({
	component: AdminPage,
})
