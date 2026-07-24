import { type SubmitEvent, useEffect, useRef, useState } from "react"
import { AnchorLink } from "@/components/AnchorLink"
import { GithubIcon, GoogleIcon } from "@/components/AuthIcons"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Label } from "@/components/primitives/label"
import { authClient } from "@/lib/authClient"

/**
 * The login page. oauth is one click, and email is a step, revealed on request
 */
export function LoginPage() {
	const [isEmailFormOpen, setEmailFormOpen] = useState(false)
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setSubmitting] = useState(false)
	const emailInputRef = useRef<HTMLInputElement>(null)

	// moves focus to the email field the moment it's revealed
	useEffect(() => {
		if (isEmailFormOpen) {
			emailInputRef.current?.focus()
		}
	}, [isEmailFormOpen])

	// logs in with the existing account's email and password
	const handleLogin = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault()
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
		<div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-12">
			{/* brand mark */}
			<AnchorLink href="/" className="mx-auto mb-8 flex items-center gap-2">
				{/* nudged up to optically center the cup on the wordmark. the offset scales with the icon size */}
				<CoffeeMug className="text-primary -translate-y-[3px] size-10" />
				<span className="font-display text-xl">CarlNotes</span>
			</AnchorLink>

			<div className="space-y-2">
				<Button
					onClick={() => handleOAuthLogin("google")}
					className="bg-hero text-hero-foreground hover:bg-[color-mix(in_oklab,var(--hero)_88%,white)] hover:ring-2 hover:ring-ring w-full gap-2"
				>
					<GoogleIcon />
					Continue with Google
				</Button>
				<Button
					onClick={() => handleOAuthLogin("github")}
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
				<form onSubmit={handleLogin} className="mt-6 space-y-4">
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
					{error && <p className="text-destructive text-sm">{error}</p>}
					<Button type="submit" disabled={isSubmitting} className="w-full">
						Log in
					</Button>
				</form>
			)}

			<p className="text-muted-foreground mt-6 text-center text-sm">
				{"Don't have an account? "}
				<AnchorLink href="/signup" className="text-link underline">
					Sign up
				</AnchorLink>
			</p>
		</div>
	)
}
