import { SIGNUP_CTA_COOKIE_NAME, toCtaTag } from "@shared/contracts"
import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { authClient, passSignupGate } from "@/clients/authClient"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { Button } from "@/components/primitives/button"
import { SessionLayout } from "@/components/session/SessionLayout"
import { TurnstileWidget } from "@/components/session/TurnstileWidget"
import { usePageTitle } from "@/hooks/usePageTitle"
import { toSafeRedirectPath } from "@/lib/utils"

/**
 * The signup page. oauth is one click, no gate at all. the password path is revealed on request,
 * and is the only path that needs a passing Turnstile check with a token.
 * The token count is incremented when a token is spent to issue a new one.
 */
export function SignupPage() {
	usePageTitle("Sign up")
	// where to land once the account exists, so an invitee opening a topic link comes back to it
	const [searchParams] = useSearchParams()
	const redirectPath = toSafeRedirectPath(searchParams.get("next"))
	const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setSubmitting] = useState(false)
	const [spentTokenCount, setSpentTokenCount] = useState(0)
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

		// checking the token spends it, so the token count must be incremented to issue a new one
		const failAndRenewChallenge = (message: string): void => {
			setError(message)
			setTurnstileToken(null)
			setSpentTokenCount((previousTokenCount) => previousTokenCount + 1)
			setSubmitting(false)
		}

		// a dropped network call reads as a failed check instead of a Submit button that stays stuck
		try {
			// the gate proves a human asked for this, and only then does the account get created
			const gate = await passSignupGate(turnstileToken)
			if ("error" in gate) {
				failAndRenewChallenge(gate.error)
				return
			}
			const name = email.split("@")[0] ?? email
			const { error: signUpError } = await authClient.signUp.email({ email, password, name })
			if (signUpError) {
				failAndRenewChallenge(signUpError.message ?? "Sign up failed.")
				return
			}
			setVerifyingEmail(email)
		} catch (signupError) {
			console.error("signup failed", signupError)
			failAndRenewChallenge("Carl didn't catch that. Please try again.")
		}
	}

	// one click, straight to the provider redirect, with no gate for oauth
	const handleOAuthSignup = (provider: "google" | "github"): void => {
		void authClient.signIn.social({ provider, callbackURL: redirectPath })
	}

	// a password signup succeeded. show the non-blocking verification notice instead of the form
	if (verifyingEmail) {
		return <VerifyEmailNotice email={verifyingEmail} redirectPath={redirectPath} />
	}

	return (
		<SessionLayout
			submitLabel="Sign up"
			onSubmit={handlePasswordSignup}
			onOAuth={handleOAuthSignup}
			error={error}
			isSubmitting={isSubmitting}
			extraFields={<TurnstileWidget onVerify={setTurnstileToken} spentTokenCount={spentTokenCount} />}
			footerPrompt={"Already have an account? "}
			footerLinkLabel="Log in"
			footerHref="/login"
		/>
	)
}

// the post-signup notice. verification is not a wall, so it offers a way straight into the app
function VerifyEmailNotice({ email, redirectPath }: { email: string; redirectPath: string }) {
	return (
		<div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12 text-center">
			<CoffeeMug className="text-primary mx-auto size-10" />
			<h1 className="mt-4 text-2xl font-semibold">Check your email</h1>
			<p className="text-muted-foreground mt-2 text-sm">
				{`We sent a link to confirm ${email}. You don't have to click it now. You can start using CarlNotes right away.`}
			</p>
			{/* full navigation, not client-side. useSession otherwise keeps its cached signed-out state */}
			<Button onClick={() => (window.location.href = redirectPath)} className="mt-6">
				Continue to CarlNotes
			</Button>
		</div>
	)
}
