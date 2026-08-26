import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { authClient } from "@/clients/authClient"
import { AnchorLink } from "@/components/common/AnchorLink"
import { SessionLayout } from "@/components/session/SessionLayout"
import { usePageTitle } from "@/hooks/usePageTitle"
import { toSafeRedirectPath } from "@/lib/utils"

/**
 * The login page. oauth is one click, and email is a step, revealed on request
 */
export function LoginPage() {
	usePageTitle("Log in")
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setSubmitting] = useState(false)
	// where a link that sent the visitor here should return to
	const [searchParams] = useSearchParams()
	const redirectPath = toSafeRedirectPath(searchParams.get("next"))

	// logs in with the existing account's email and password
	const handleLogin = async (email: string, password: string): Promise<void> => {
		setSubmitting(true)
		setError(null)
		const { error: signInError } = await authClient.signIn.email({ email, password })
		if (signInError) {
			setError(signInError.message ?? "Log in failed.")
			setSubmitting(false)
			return
		}
		// full navigation, not client-side. the session client's cache otherwise still shows signed-out
		window.location.href = redirectPath
	}

	// hands off to the provider's oauth redirect
	const handleOAuthLogin = (provider: "google" | "github"): void => {
		void authClient.signIn.social({ provider, callbackURL: redirectPath })
	}

	return (
		<SessionLayout
			submitLabel="Log in"
			onSubmit={handleLogin}
			onOAuth={handleOAuthLogin}
			error={error}
			isSubmitting={isSubmitting}
			// the reset password link at the bottom of the login form
			extraFields={
				<AnchorLink
					href="/reset-password"
					className="text-muted-foreground hover:text-foreground block text-right text-sm underline underline-offset-4"
				>
					Forgot password?
				</AnchorLink>
			}
			footerPrompt={"Don't have an account? "}
			footerLinkLabel="Sign up"
			footerHref="/signup?cta=login"
		/>
	)
}
