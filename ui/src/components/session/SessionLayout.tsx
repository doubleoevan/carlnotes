import { type SubmitEvent, useEffect, useRef, useState } from "react"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { AnchorLink } from "@/components/layout/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Label } from "@/components/primitives/label"
import { GithubIcon, GoogleIcon } from "@/components/session/OAuthProviderIcons"

// the oauth buttons carry the dark hero treatment rather than the default primary, so the email path below reads as the quieter option
const OAUTH_BUTTON_CLASS =
	"bg-hero text-hero-foreground hover:bg-[color-mix(in_oklab,var(--hero)_88%,white)] hover:ring-2 hover:ring-ring w-full gap-2"

/**
 * The page both the login and signup routes render inside: the brand mark, one-click OAuth, and an
 * email-and-password form revealed on request. Each route supplies its own submit, wording, and cross-link,
 * so the two stay identical everywhere they should be.
 */
export function SessionLayout({
	submitLabel,
	onSubmit,
	onOAuth,
	error,
	isSubmitting,
	extraFields,
	footerPrompt,
	footerLinkLabel,
	footerHref,
}: {
	submitLabel: string
	onSubmit: (email: string, password: string) => Promise<void>
	onOAuth: (provider: "google" | "github") => void
	error: string | null
	isSubmitting: boolean
	// anything the route needs between the password field and the submit button, like signup's bot check
	extraFields?: React.ReactNode
	footerPrompt: string
	footerLinkLabel: string
	footerHref: string
}) {
	const [isEmailFormOpen, setEmailFormOpen] = useState(false)
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const emailInputRef = useRef<HTMLInputElement>(null)

	// moves focus to the email field the moment it's revealed
	useEffect(() => {
		if (isEmailFormOpen) {
			emailInputRef.current?.focus()
		}
	}, [isEmailFormOpen])

	// hand the typed credentials to the route's own submit
	const handleSubmit = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault()
		await onSubmit(email, password)
	}

	return (
		<div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-12">
			{/* brand mark */}
			<AnchorLink href="/" className="mx-auto mb-8 flex items-center gap-2">
				{/* nudged up to optically center the cup on the wordmark. the offset scales with the icon size */}
				<CoffeeMug className="text-primary -translate-y-[3px] size-10" />
				<span className="font-display text-xl">CarlNotes</span>
			</AnchorLink>

			{/* the one-click paths, which never need the bot check */}
			<div className="space-y-2">
				<Button onClick={() => onOAuth("google")} className={OAUTH_BUTTON_CLASS}>
					<GoogleIcon />
					Continue with Google
				</Button>
				<Button onClick={() => onOAuth("github")} className={OAUTH_BUTTON_CLASS}>
					<GithubIcon />
					Continue with GitHub
				</Button>
			</div>

			{/* the email path stays folded away until asked for, so oauth reads as the default */}
			{!isEmailFormOpen ? (
				<button
					type="button"
					onClick={() => setEmailFormOpen(true)}
					className="text-muted-foreground hover:text-foreground mt-4 text-center text-sm underline underline-offset-4"
				>
					Continue with email
				</button>
			) : (
				<form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
					{extraFields}
					{error && <p className="text-destructive text-sm">{error}</p>}
					<Button type="submit" disabled={isSubmitting} className="w-full">
						{submitLabel}
					</Button>
				</form>
			)}

			{/* the link to the other auth route */}
			<p className="text-muted-foreground mt-6 text-center text-sm">
				{footerPrompt}
				<AnchorLink href={footerHref} className="text-link underline">
					{footerLinkLabel}
				</AnchorLink>
			</p>
		</div>
	)
}
