import { createFileRoute } from "@tanstack/react-router"
import { AccountPage } from "@/pages/AccountPage"

// the account page, the user's own or another user's for an admin
export const Route = createFileRoute("/_layout/_signedIn/account")({
	component: AccountPage,
})
