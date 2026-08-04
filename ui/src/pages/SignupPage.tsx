import { SIGNUP_CTA_COOKIE_NAME, toCtaTag } from "@shared/contracts"
import { useEffect, useState } from "react"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { Button } from "@/components/primitives/button"
import { SessionLayout } from "@/components/session/SessionLayout"
import { TurnstileWidget } from "@/components/session/TurnstileWidget"
import { authClient, passSignupGate } from "@/lib/authClient"

/**
 * The signup page. oauth is one click, no gate at all. the password path is a step down,
 * revealed on request, and is the only path that needs a passing Turnstile check
 */
export function SignupPage() {
	const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setSubmitting] = useState(false)
	// the address a succeeded password signup was sent to, which swaps the form for a non-blocking notice
	const [verifyingEmail, setVerifyingEmail] = useState<string | null>(null)

	// remember which button brought this visitor here, so signup_completed can track what converted
	useEffect(() => {
		const ctaTag = toCtaTag(new URLSearchParams(window.location.search).get("cta"))
		if (ctaTag) {
			// biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API it prefers is missing in Safari
			document.cookie = `${SIGNUP_CTA_COOKIE_NAME}=${ctaTag}; max-age=1800; path=/`
		}
	}, [])

	// validates the turnstile token, then creates the account with a password
	const handlePasswordSignup = async (email: string, password: string): Promise<void> => {
		if (!turnstileToken) {
			setError("Complete the challenge above first.")
			return
		}
		setSubmitting(true)
		setError(null)

		// the gate proves a human asked for this, and only then does the account get created
		const gate = await passSignupGate(turnstileToken)
		if ("error" in gate) {
			setError(gate.error)
			setSubmitting(false)
			return
		}
		const name = email.split("@")[0] ?? email
		const { error: signUpError } = await authClient.signUp.email({ email, password, name })
		if (signUpError) {
			setError(signUpError.message ?? "Sign up failed.")
			setSubmitting(false)
			return
		}
		setVerifyingEmail(email)
	}

	// one click, straight to the provider redirect, no gate
	const handleOAuthSignup = (provider: "google" | "github"): void => {
		void authClient.signIn.social({ provider, callbackURL: "/" })
	}

	// a password signup succeeded. show the non-blocking verification notice instead of the form
	if (verifyingEmail) {
		return <VerifyEmailNotice email={verifyingEmail} />
	}

	return (
		<SessionLayout
			submitLabel="Sign up"
			onSubmit={handlePasswordSignup}
			onOAuth={handleOAuthSignup}
			error={error}
			isSubmitting={isSubmitting}
			extraFields={<TurnstileWidget onVerify={setTurnstileToken} />}
			footerPrompt={"Already have an account? "}
			footerLinkLabel="Log in"
			footerHref="/login"
		/>
	)
}

// the post-signup notice. verification is not a wall, so it offers a way straight into the app
function VerifyEmailNotice({ email }: { email: string }) {
	return (
		<div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12 text-center">
			<CoffeeMug className="text-primary mx-auto size-10" />
			<h1 className="mt-4 text-2xl font-semibold">Check your email</h1>
			<p className="text-muted-foreground mt-2 text-sm">
				{`We sent a link to confirm ${email}. You don't have to click it now. You can start using CarlNotes right away.`}
			</p>
			{/* full navigation, not client-side: otherwise useSession keeps its cached signed-out state */}
			<Button onClick={() => (window.location.href = "/")} className="mt-6">
				Continue to CarlNotes
			</Button>
		</div>
	)
}
