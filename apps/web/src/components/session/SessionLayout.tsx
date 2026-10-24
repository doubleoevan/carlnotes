import { authClient } from "@carlnotes/client/authClient"
import { isInAppBrowser, toBrowserPlatform } from "@carlnotes/contracts/userAgent"
import { toChromeIntentUrl } from "@carlnotes/core/lib/chromeIntentUrl"
import { OAUTH_ERROR_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { type SubmitEvent, useEffect, useRef, useState } from "react"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button, buttonVariants } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Label } from "@/components/primitives/label"
import { SESSION_PAGE_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { AppleIcon, GithubIcon, GoogleIcon } from "./OAuthProviderIcons"
import { PasswordInput } from "./PasswordInput"

// the providers that a user can sign in with
type OAuthProviderId = "google" | "github" | "apple"

// the oauth buttons' dark hero background, which leaves the email path reading as the quieter option
const OAUTH_BUTTON_CLASS =
	"bg-hero text-hero-foreground hover:bg-[color-mix(in_oklab,var(--hero)_88%,white)] hover:ring-2 hover:ring-ring w-full gap-2"

/**
 * The page both the login and signup routes render inside, each supplying its own submit, wording, and footer link.
 */
export function SessionLayout({
	submitLabel,
	onSubmit,
	redirectPath,
	error,
	isSubmitting,
	extraFields,
	passwordMinLength,
	footerPrompt,
	footerLinkLabel,
	footerHref,
}: {
	submitLabel: string
	onSubmit: (email: string, password: string) => Promise<void>
	// the path that a provider's sign-in returns to
	redirectPath: string
	error: string | null
	isSubmitting: boolean
	// anything the route needs between the password field and the submit button, like signup's bot check
	extraFields?: React.ReactNode
	// the shortest password the route accepts. signup sets it, login takes any
	passwordMinLength?: number
	footerPrompt: string
	footerLinkLabel: string
	footerHref: string
}) {
	// an embedded webview rejects Google's oauth
	const [isBrowserInApp] = useState(() => isInAppBrowser(navigator.userAgent))
	const [oauthError, setOauthError] = useState<string | null>(null)

	// open the provider's sign-in in one click. if the sign-in does not open, say so under the buttons
	const handleOAuth = async (provider: OAuthProviderId): Promise<void> => {
		setOauthError(null)
		try {
			const { error: signInError } = await authClient().signIn.social({ provider, callbackURL: redirectPath })
			if (!signInError) {
				return
			}
			console.error(`the ${provider} sign-in did not open`, signInError)
		} catch (networkError) {
			console.error(`the ${provider} sign-in request failed`, networkError)
		}
		setOauthError(OAUTH_ERROR_TEXT)
	}

	// both blocks, ordered below by whether the browser is embedded
	const oauthButtons = <OauthButtons isBrowserInApp={isBrowserInApp} onOAuth={handleOAuth} error={oauthError} />
	const emailForm = (
		<EmailForm
			isBrowserInApp={isBrowserInApp}
			onSubmit={onSubmit}
			submitLabel={submitLabel}
			isSubmitting={isSubmitting}
			error={error}
			extraFields={extraFields}
			passwordMinLength={passwordMinLength}
		/>
	)

	return (
		<div className={SESSION_PAGE_CLASS}>
			{/* brand mark */}
			<AnchorLink href="/" className="mx-auto mb-8 flex items-center gap-2">
				{/* nudged up to optically center the cup on the logo's text. the offset scales with the icon size */}
				<CoffeeMug className="text-primary -translate-y-[3px] size-10" />
				<span className="font-display text-xl">CarlNotes</span>
			</AnchorLink>

			{/* an embedded webview shows the email form first with a notice */}
			{isBrowserInApp ? (
				<>
					<EmbeddedWebviewNotice />
					{emailForm}
					{oauthButtons}
				</>
			) : (
				<>
					{oauthButtons}
					{emailForm}
				</>
			)}

			{/* the link to the other auth route */}
			<p className="text-muted-foreground mt-6 text-center text-sm">
				{footerPrompt}
				<AnchorLink href={footerHref} className="sentence-link">
					{footerLinkLabel}
				</AnchorLink>
			</p>
		</div>
	)
}

// explains why google sign-in needs your own browser to work
function EmbeddedWebviewNotice() {
	const platform = toBrowserPlatform(navigator.userAgent)
	return (
		<p className="text-muted-foreground mb-4 text-center text-sm whitespace-pre-line">
			{`Google won't sign you in from inside another app's browser. Email works fine here.\n`}
			{platform === "android" ? (
				<AnchorLink href={toChromeIntentUrl(window.location.href)} className="sentence-link">
					Or open this page in Chrome.
				</AnchorLink>
			) : (
				<span>Or open this page in your browser from this app's own menu above.</span>
			)}
		</p>
	)
}

// the Google, GitHub, and Apple sign-in buttons. Apple's form works inside an embedded webview.
// the Apple button stays on there
function OauthButtons({
	isBrowserInApp,
	onOAuth,
	error,
}: {
	isBrowserInApp: boolean
	onOAuth: (provider: OAuthProviderId) => void
	error: string | null
}) {
	return (
		<div className={isBrowserInApp ? "mt-6 space-y-2" : "space-y-2"}>
			<GoogleOauthButton isBrowserInApp={isBrowserInApp} onOAuth={onOAuth} />
			<Button onClick={() => onOAuth("github")} className={OAUTH_BUTTON_CLASS}>
				<GithubIcon />
				Continue with GitHub
			</Button>
			<Button onClick={() => onOAuth("apple")} className={OAUTH_BUTTON_CLASS}>
				<AppleIcon />
				Continue with Apple
			</Button>
			{/* a sign-in that did not open */}
			{error && (
				<p role="alert" className="text-destructive text-center text-sm">
					{error}
				</p>
			)}
		</div>
	)
}

// only show the normal Google sign-in button if the user is in a standalone browser otherwise disable the button
function GoogleOauthButton({
	isBrowserInApp,
	onOAuth,
}: {
	isBrowserInApp: boolean
	onOAuth: (provider: OAuthProviderId) => void
}) {
	if (isBrowserInApp && toBrowserPlatform(navigator.userAgent) === "android") {
		return (
			<AnchorLink href={toChromeIntentUrl(window.location.href)} className={cn(buttonVariants(), OAUTH_BUTTON_CLASS)}>
				<GoogleIcon />
				Continue with Google in Chrome
			</AnchorLink>
		)
	}

	if (isBrowserInApp) {
		return (
			<Button disabled className={OAUTH_BUTTON_CLASS}>
				<GoogleIcon />
				Google sign-in needs your own browser
			</Button>
		)
	}

	return (
		<Button onClick={() => onOAuth("google")} className={OAUTH_BUTTON_CLASS}>
			<GoogleIcon />
			Continue with Google
		</Button>
	)
}

// the email form for login or signup
function EmailForm({
	isBrowserInApp,
	onSubmit,
	submitLabel,
	isSubmitting,
	error,
	extraFields,
	passwordMinLength,
}: {
	isBrowserInApp: boolean
	onSubmit: (email: string, password: string) => Promise<void>
	submitLabel: string
	isSubmitting: boolean
	error: string | null
	extraFields?: React.ReactNode
	passwordMinLength?: number
}) {
	const [isOpen, setIsOpen] = useState(isBrowserInApp)
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const emailInputRef = useRef<HTMLInputElement>(null)

	// moves focus to the email field the moment it's revealed
	useEffect(() => {
		if (isOpen && !isBrowserInApp) {
			emailInputRef.current?.focus()
		}
	}, [isOpen, isBrowserInApp])

	// hand the typed credentials to the route's own submit callback
	const handleSubmit = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault()
		await onSubmit(email, password)
	}

	if (!isOpen) {
		return (
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				className="text-muted-foreground hover:text-foreground mt-4 text-center text-sm underline underline-offset-4"
			>
				Continue with email
			</button>
		)
	}

	return (
		<form onSubmit={handleSubmit} className={isBrowserInApp ? "space-y-4" : "mt-6 space-y-4"}>
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
			<PasswordInput
				id="password"
				label="Password"
				value={password}
				onChange={setPassword}
				minLength={passwordMinLength}
			/>
			{extraFields}
			{error && <p className="text-destructive text-sm">{error}</p>}
			<Button type="submit" disabled={isSubmitting} className="w-full">
				{submitLabel}
			</Button>
		</form>
	)
}
