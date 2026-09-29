import { createFileRoute } from "@tanstack/react-router"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { toNoindexHeadTags } from "@/lib/pageHead"
import { ResetPasswordPage } from "@/pages/ResetPasswordPage"

// the password reset page, outside the Layout shell, with its own loading fallback
export const Route = createFileRoute("/reset-password")({
	ssr: false,
	head: () => toNoindexHeadTags("Reset password"),
	component: ResetPasswordPage,
	pendingComponent: CoffeeLoading,
})
