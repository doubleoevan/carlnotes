import { type SubmitEvent, useEffect, useRef, useState } from "react"
import { AnchorLink } from "@/components/AnchorLink"
import { GithubIcon, GoogleIcon } from "@/components/AuthIcons"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Label } from "@/components/primitives/label"
import { TurnstileWidget } from "@/components/TurnstileWidget"
import { authClient, passSignupGate } from "@/lib/authClient"

/**
 * The signup page. oauth is one click, no gate at all. the password path is a step down,
 * revealed on request, and is the only path that needs a passing Turnstile check
 */
export function SignupPage() {
	const [isEmailFormOpen, setEmailFormOpen] = useState(false)
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setSubmitting] = useState(false)
	// true once a password signup succeeds, swapping the form for a non-blocking "check your email" notice
	const [hasSignedUpWithPassword, setSignedUpWithPassword] = useState(false)
	const emailInputRef = useRef<HTMLInputElement>(null)

	// moves focus to the email field the moment it's revealed
	useEffect(() => {
		if (isEmailFormOpen) {
			emailInputRef.current?.focus()
		}
	}, [isEmailFormOpen])

	// validates the turnstile token, then creates the account with a password
	const handlePasswordSignup = async (event: SubmitEvent) => {
		event.preventDefault()
		if (!turnstileToken) {
			setError("Complete the challenge above first.")
			return
		}
		setSubmitting(true)
		setError(null)
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
		setSignedUpWithPassword(true)
	}

	// one click, straight to the provider redirect, no gate
	const handleOAuthSignup = (provider: "google" | "github") => {
		void authClient.signIn.social({ provider, callbackURL: "/" })
	}

	// a password signup succeeded. show the non-blocking verification notice instead of the form
	if (hasSignedUpWithPassword) {
		return (
			<div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-12 text-center">
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

	return (
		<div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-12">
			{/* brand mark */}
			<AnchorLink href="/" className="mx-auto mb-8 flex items-center gap-2">
				{/* nudged up to optically center the cup with the text. the offset scales with the icon size */}
				<CoffeeMug className="text-primary -translate-y-[3px] size-10" />
				<span className="font-display text-xl">CarlNotes</span>
			</AnchorLink>

			<div className="space-y-2">
				<Button
					onClick={() => handleOAuthSignup("google")}
					className="bg-hero text-hero-foreground hover:bg-[color-mix(in_oklab,var(--hero)_88%,white)] hover:ring-2 hover:ring-ring w-full gap-2"
				>
					<GoogleIcon />
					Continue with Google
				</Button>
				<Button
					onClick={() => handleOAuthSignup("github")}
					className="bg-hero text-hero-foreground hover:bg-[color-mix(in_oklab,var(--hero)_88%,white)] hover:ring-2 hover:ring-ring w-full gap-2"
				>
					<GithubIcon />
					Continue with GitHub
				</Button>
			</div>

			{!isEmailFormOpen ? (
				<button
					type="button"
					onClick={() => setEmailFormOpen(true)}
					className="text-muted-foreground hover:text-foreground mt-4 text-center text-sm underline underline-offset-4"
				>
					Continue with email
				</button>
			) : (
				<form onSubmit={handlePasswordSignup} className="mt-6 space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							className="bg-card dark:bg-card"
							ref={emailInputRef}
							required
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							className="bg-card dark:bg-card"
							required
						/>
					</div>
					<TurnstileWidget onVerify={setTurnstileToken} />
					{error && <p className="text-destructive text-sm">{error}</p>}
					<Button type="submit" disabled={isSubmitting} className="w-full">
						Sign up
					</Button>
				</form>
			)}

			<p className="text-muted-foreground mt-6 text-center text-sm">
				{"Already have an account? "}
				<AnchorLink href="/login" className="text-link underline">
					Log in
				</AnchorLink>
			</p>
		</div>
	)
}
