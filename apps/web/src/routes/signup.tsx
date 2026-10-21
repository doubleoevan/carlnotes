import { toNoindexHeadTags } from "@carlnotes/core/lib/pageHead"
import { createFileRoute } from "@tanstack/react-router"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { SignupPage } from "@/pages/SignupPage"

// the signup page, outside the Layout shell, with its own loading fallback
export const Route = createFileRoute("/signup")({
	ssr: false,
	head: () => toNoindexHeadTags("Sign up"),
	component: SignupPage,
	pendingComponent: CoffeeLoading,
})
