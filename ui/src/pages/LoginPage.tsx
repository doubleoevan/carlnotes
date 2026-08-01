import { useState } from "react"
import { SessionLayout } from "@/components/session/SessionLayout"
import { authClient } from "@/lib/authClient"

/**
 * The login page. oauth is one click, and email is a step, revealed on request
 */
export function LoginPage() {
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setSubmitting] = useState(false)

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
		// full navigation, not client-side: the session client's cache otherwise still shows signed-out
		window.location.href = "/"
	}

	// hands off to the provider's oauth redirect
	const handleOAuthLogin = (provider: "google" | "github"): void => {
		void authClient.signIn.social({ provider, callbackURL: "/" })
	}

	return (
		<SessionLayout
			submitLabel="Log in"
			onSubmit={handleLogin}
			onOAuth={handleOAuthLogin}
			error={error}
			isSubmitting={isSubmitting}
			footerPrompt={"Don't have an account? "}
			footerLinkLabel="Sign up"
			footerHref="/signup?cta=login"
		/>
	)
}
