import { createFileRoute } from "@tanstack/react-router"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { toNoindexHeadTags } from "@/lib/pageHead"
import { LoginPage } from "@/pages/LoginPage"

// the login page, outside of the Layout shell, with its own loading fallback
export const Route = createFileRoute("/login")({
	ssr: false,
	head: () => toNoindexHeadTags("Log in"),
	component: LoginPage,
	pendingComponent: CoffeeLoading,
})
