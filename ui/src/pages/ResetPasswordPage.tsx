import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { authClient, passSignupGate } from "@/clients/authClient"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Label } from "@/components/primitives/label"
import { PasswordInput } from "@/components/session/PasswordInput"
import { TurnstileWidget } from "@/components/session/TurnstileWidget"
import { usePageTitle } from "@/hooks/usePageTitle"

/**
 * Password reset and recovery, both on one route: without a token it asks for an email address to send the token to,
 * and with a token it takes a new password. The token count is incremented when a token is spent to issue a new one.
 */
export function ResetPasswordPage() {
	usePageTitle("Reset password")
	const [searchParams] = useSearchParams()
	const token = searchParams.get("token")
	return (
		<main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-safe py-10">
			<div className="mb-8 flex items-center justify-center gap-2">
				<CoffeeMug className="text-primary" />
				<span className="font-display text-2xl">CarlNotes</span>
			</div>
			{token ? <NewPasswordForm token={token} /> : <ResetRequestForm />}
		</main>
	)
}

// asks for an email address to send the link.
function ResetRequestForm() {
	const [email, setEmail] = useState("")
	const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
	const [isSubmitting, setSubmitting] = useState(false)
	const [isSent, setSent] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [spentTokenCount, setSpentTokenCount] = useState(0)

	// pass the turnstile gate, then ask for the link. the gate is what stands in for a rate limiter here
	const handleSubmit = async (event: React.FormEvent): Promise<void> => {
		event.preventDefault()
		if (!turnstileToken) {
			setError("Finish the check below first.")
			return
		}
		setSubmitting(true)
		setError(null)

		// checking the token spends it, so every path that leaves this form on screen needs a new one
		const failAndRenewChallenge = (message: string): void => {
			setError(message)
			setTurnstileToken(null)
			setSpentTokenCount((previousTokenCount) => previousTokenCount + 1)
		}

		// a dropped network call reads as a failed check instead of a submit button that stays stuck
		try {
			const gate = await passSignupGate(turnstileToken)
			if ("error" in gate) {
				failAndRenewChallenge("That check didn't pass. Try again.")
				return
			}
			// the reply is the same either way
			await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" })
			setSent(true)
		} catch (requestError) {
			console.error("password reset request failed", requestError)
			failAndRenewChallenge("That didn't reach Carl. Try again.")
		} finally {
			setSubmitting(false)
		}
	}

	// the call to action to check your email for a reset password link
	if (isSent) {
		return (
			<div className="space-y-4 text-center">
				<h1 className="font-display text-2xl">Check your email</h1>
				<p className="text-muted-foreground text-sm">
					A reset link is on its way. It only works once and expires in an hour.
				</p>
				<AnchorLink href="/login" className="text-link inline-block text-sm underline underline-offset-4">
					Back to log in
				</AnchorLink>
			</div>
		)
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<h1 className="font-display text-center text-2xl">Reset your password</h1>
			<div className="space-y-1.5">
				<Label htmlFor="email">Email</Label>
				<Input
					id="email"
					type="email"
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					className="bg-card dark:bg-card"
					required
				/>
			</div>
			<TurnstileWidget onVerify={setTurnstileToken} spentTokenCount={spentTokenCount} />
			{error && <p className="text-destructive text-sm">{error}</p>}
			<Button type="submit" disabled={isSubmitting} className="w-full">
				Send reset link
			</Button>
			<p className="text-center">
				<AnchorLink href="/login" className="text-muted-foreground text-sm underline underline-offset-4">
					Back to log in
				</AnchorLink>
			</p>
		</form>
	)
}

// takes the new password from a valid link. a used or expired token is refused by the api, not here
function NewPasswordForm({ token }: { token: string }) {
	const [password, setPassword] = useState("")
	const [isSubmitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// set the password, then return the user to where they were trying to get to instead of to the login form
	const handleSubmit = async (event: React.FormEvent): Promise<void> => {
		event.preventDefault()
		setSubmitting(true)
		setError(null)
		// a dropped network call reads as an error instead of a submit button that stays stuck
		try {
			const { error: resetError } = await authClient.resetPassword({ token, newPassword: password })
			if (resetError) {
				setError(resetError.message ?? "That link has expired or already been used.")
				return
			}
			// full navigation, not client-side. the session client's cache otherwise still shows signed-out
			window.location.href = "/"
		} catch (resetFailure) {
			console.error("password reset failed", resetFailure)
			setError("That didn't reach Carl. Try again.")
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<h1 className="font-display text-center text-2xl">Pick a new password</h1>
			<PasswordInput
				id="new-password"
				label="New password"
				value={password}
				onChange={setPassword}
				autoComplete="new-password"
			/>
			<p className="text-muted-foreground text-xs">Setting a new password signs you out everywhere else.</p>
			{error && <p className="text-destructive text-sm">{error}</p>}
			<Button type="submit" disabled={isSubmitting} className="w-full">
				Set password
			</Button>
		</form>
	)
}
