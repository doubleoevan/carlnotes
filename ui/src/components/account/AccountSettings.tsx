import { Check, Info, Settings } from "lucide-react"
import { type SubmitEvent, useState } from "react"
import { authClient } from "@/clients/authClient"
import { sendDeleteAccount, sendInviteAccess } from "@/clients/profileClient"
import { UserAvatarPicker } from "@/components/avatar/UserAvatarPicker"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Label } from "@/components/primitives/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { PasswordInput } from "@/components/session/PasswordInput"
import { useAvatar } from "@/hooks/useAvatar"
import { type UsernameChange, useUsernameChange } from "@/hooks/useUsernameChange"
import { CARD_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/**
 * The settings sections on the account page: profile, email, password, invitations, and closing the account.
 */
export function AccountSettings() {
	return (
		<>
			{/* the section title with its icon */}
			<h2 className="font-display flex items-center gap-2 pt-2 text-xl">
				<Settings className="size-5" />
				Settings
			</h2>
			<ProfileSection />
			<EmailSection />
			<PasswordSection />
			<InvitationsSection />
			{/* closing the account comes last. it is the one thing on this page that cannot be undone */}
			<DeleteAccountSection />
		</>
	)
}

// the user profile settings
function ProfileSection() {
	const { data: session } = authClient.useSession()

	// only a signed-in user has an account page
	if (!session) {
		return null
	}
	return (
		<section className={CARD_CLASS}>
			<h3 className="font-semibold">Profile</h3>
			<ProfileFields userId={session.user.id} username={session.user.username} className="mt-3" />
		</section>
	)
}

/**
 * The profile's editable fields: the avatar picker with the provider-photo toggle, and the username form.
 */
export function ProfileFields({
	userId,
	username,
	className,
	usernameChange,
	onUsernameChanged,
}: {
	userId: string
	username: string
	className?: string
	// a username-change state the caller owns. when set, the form hides its own submit button
	usernameChange?: UsernameChange
	// runs after a username change saves
	onUsernameChanged?: () => void
}) {
	// a hook cannot be called conditionally, so this fallback is always created
	const fallbackUsernameChange = useUsernameChange(onUsernameChanged)
	const accountUsernameChange = usernameChange ?? fallbackUsernameChange

	// the avatar comes from the session, which the header reads too, so toggling its source updates both at once
	const { avatarSource, hasProviderPhoto, setAvatarSource } = useAvatar()
	function handleProviderPhotoToggle(): void {
		void setAvatarSource(avatarSource === "oauth" ? "generated" : "oauth")
	}

	// stop the event and save the username
	async function handleUpdateUsername(event: SubmitEvent): Promise<void> {
		event.preventDefault()
		await accountUsernameChange.saveUsername()
	}

	return (
		<div className={className}>
			<div className="flex items-center gap-4">
				<UserAvatarPicker userId={userId} username={username} />
				<div className="text-sm">
					<p className="font-display text-lg">{username}</p>
					{/* an oauth signup defaults to the provider photo, which is opt-out. this toggle switches it back. */}
					{hasProviderPhoto && (
						<button
							type="button"
							onClick={handleProviderPhotoToggle}
							aria-pressed={avatarSource === "oauth"}
							className="text-link text-xs hover:underline"
						>
							Use the photo from my sign-in provider
							{avatarSource === "oauth" && <Check className="ml-1 inline size-3.5" />}
						</button>
					)}
				</div>
			</div>

			{/* username is display only, so it can be changed as often as the user likes.
			    a caller that owns the save is a modal, where the field runs the full width */}
			<form onSubmit={handleUpdateUsername} className={cn("mt-3 space-y-3", !usernameChange && "max-w-sm")}>
				<div className="space-y-1.5">
					<Label htmlFor="username">New username</Label>
					<Input
						id="username"
						value={accountUsernameChange.username}
						onChange={(event) => accountUsernameChange.setUsername(event.target.value)}
						placeholder={username}
						aria-describedby={accountUsernameChange.rejection ? "username-rejection" : undefined}
						className="bg-card dark:bg-card"
						required
					/>
				</div>
				{accountUsernameChange.rejection && (
					<p id="username-rejection" className="text-destructive text-sm">
						{accountUsernameChange.rejection}
					</p>
				)}
				{/* a caller that owns the state saves it from its own button instead */}
				{!usernameChange && (
					<Button
						type="submit"
						disabled={accountUsernameChange.isSaving || accountUsernameChange.username.length === 0}
					>
						Change username
					</Button>
				)}
			</form>
		</div>
	)
}

// the change email section. the current address is where scan emails are delivered, so a change is confirmed twice
function EmailSection() {
	const { data: session } = authClient.useSession()
	const [newEmail, setNewEmail] = useState("")
	const [isSubmitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [isRequested, setRequested] = useState(false)

	// ask for the email change. better auth emails the current address first, and only afterward the new one
	async function handleChangeEmail(event: SubmitEvent): Promise<void> {
		event.preventDefault()
		setSubmitting(true)
		setError(null)
		try {
			const { error: changeError } = await authClient.changeEmail({ newEmail, callbackURL: "/account" })
			if (changeError) {
				setError(changeError.message ?? "That didn't work. Try again.")
				return
			}
			setRequested(true)
		} catch (changeError) {
			console.error("email change failed", changeError)
			setError("That didn't reach Carl. Try again.")
		} finally {
			setSubmitting(false)
		}
	}

	if (!session) {
		return null
	}

	return (
		<section className={CARD_CLASS}>
			<h3 className="font-semibold">Email</h3>
			<p className="text-muted-foreground mt-1 text-sm">
				{"Scans are delivered here. It's also how you sign in with a password."}
			</p>
			<p className="mt-2 text-sm">{session.user.email}</p>
			{isRequested ? (
				<p className="mt-3 text-sm">
					{`Check ${session.user.email} for a link to confirm the change.`}
					<br />
					{"Confirm so Carl can send notes to your new address."}
				</p>
			) : (
				<form onSubmit={handleChangeEmail} className="mt-3 max-w-sm space-y-3">
					<div className="space-y-1.5">
						<Label htmlFor="new-email">New email</Label>
						<Input
							id="new-email"
							type="email"
							value={newEmail}
							onChange={(event) => setNewEmail(event.target.value)}
							className="bg-card dark:bg-card"
							required
						/>
					</div>
					{error && <p className="text-destructive text-sm">{error}</p>}
					<Button type="submit" disabled={isSubmitting || newEmail.length === 0}>
						Change email
					</Button>
				</form>
			)}
		</section>
	)
}

// the change password section. the current password is required.
function PasswordSection() {
	const [currentPassword, setCurrentPassword] = useState("")
	const [newPassword, setNewPassword] = useState("")
	const [isSubmitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [isChanged, setChanged] = useState(false)

	// change the password, revoking other sessions to keep this session alive with the updated password
	async function handleChangePassword(event: SubmitEvent): Promise<void> {
		event.preventDefault()
		setSubmitting(true)
		setError(null)
		setChanged(false)
		try {
			const { error: changeError } = await authClient.changePassword({
				currentPassword,
				newPassword,
				revokeOtherSessions: true,
			})
			if (changeError) {
				setError(changeError.message ?? "That didn't work. Check your current password.")
				return
			}
			// clear the fields so the typed passwords are not left sitting in the form
			setCurrentPassword("")
			setNewPassword("")
			setChanged(true)
		} catch (error) {
			console.error("password change failed", error)
			setError("That didn't reach Carl. Try again.")
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<section className={CARD_CLASS}>
			<h3 className="font-semibold">Password</h3>
			<form onSubmit={handleChangePassword} className="mt-3 max-w-sm space-y-3">
				<PasswordInput
					id="current-password"
					label="Current password"
					value={currentPassword}
					onChange={setCurrentPassword}
					autoComplete="current-password"
				/>
				<PasswordInput
					id="new-password"
					label="New password"
					value={newPassword}
					onChange={setNewPassword}
					autoComplete="new-password"
				/>
				{error && <p className="text-destructive text-sm">{error}</p>}
				{isChanged && <p className="text-sm">Password changed. You've been signed out everywhere else.</p>}
				<Button type="submit" disabled={isSubmitting}>
					Change password
				</Button>
			</form>
		</section>
	)
}

// the three levels of invitation access
const INVITE_CHOICES = [
	{ value: "anyone", label: "Anyone" },
	{ value: "connected", label: "People I interact with" },
	{ value: "nobody", label: "Nobody" },
] as const

function InvitationsSection() {
	const { data: session, refetch: refreshSession } = authClient.useSession()
	const [inviteAccess, setInviteAccess] = useState<string | null>(null)
	const [saveError, setSaveError] = useState<string | null>(null)
	if (!session) {
		return null
	}
	const inviteChoice = inviteAccess ?? ((session.user as { inviteAccess?: string }).inviteAccess || "anyone")

	// an invite access choice is saved on click
	async function handleSetInviteAccess(value: "anyone" | "connected" | "nobody"): Promise<void> {
		setInviteAccess(value)
		setSaveError(null)
		try {
			await sendInviteAccess(value)
			await refreshSession()
		} catch (error) {
			console.error("who-may-invite update failed", error)
			setInviteAccess(null)
			setSaveError("That didn't save. Try again.")
		}
	}

	return (
		<section className={CARD_CLASS}>
			<h3 className="font-semibold">Invitations</h3>
			{/* invite access is updated on click. the fieldset names the group for a screen reader */}
			<fieldset className="mt-1">
				<legend className="text-muted-foreground text-sm">Who may invite you to topics and teams.</legend>
				<div className="mt-3 space-y-2">
					{INVITE_CHOICES.map((choice) => (
						<label key={choice.value} className="flex cursor-pointer items-center gap-2 text-sm">
							<input
								type="radio"
								name="who-may-invite"
								checked={inviteChoice === choice.value}
								onChange={() => void handleSetInviteAccess(choice.value)}
								className="cursor-pointer"
							/>
							{choice.label}
							{/* the "connected" invite access shows a tooltip describing what that means */}
							{choice.value === "connected" && (
								<Tooltip>
									<TooltipTrigger asChild>
										<Info
											className="text-primary stroke-card size-4.5 fill-current"
											aria-label="What counts as interacting"
										/>
									</TooltipTrigger>
									<TooltipContent className="max-w-64">
										People you share a team with, people following one of your topics, and people whose invitations you
										accepted.
									</TooltipContent>
								</Tooltip>
							)}
						</label>
					))}
				</div>
			</fieldset>
			{saveError && <p className="text-destructive mt-2 text-sm">{saveError}</p>}
		</section>
	)
}

function DeleteAccountSection() {
	const [isConfirming, setIsConfirming] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// close the account, then navigate back to the home page
	const handleDeleteAccount = async (): Promise<void> => {
		setIsConfirming(false)
		setError(null)
		try {
			await sendDeleteAccount()
			window.location.href = "/"
		} catch (deleteError) {
			console.error("account delete failed", deleteError)
			setError("That didn't reach Carl. Try again.")
		}
	}

	return (
		<section className={cn(CARD_CLASS, "border-destructive")}>
			<h3 className="text-destructive font-semibold">Close your account</h3>
			<p className="text-muted-foreground mt-1 text-sm">
				Your topics, findings, subscriptions, and chats go with it. Any paid plan is canceled. This cannot be undone.
			</p>
			{error && <p className="text-destructive mt-2 text-sm">{error}</p>}
			<Button variant="destructive" className="mt-3" onClick={() => setIsConfirming(true)}>
				Close account
			</Button>
			{isConfirming && (
				<ConfirmDialog
					title="Close your account?"
					confirmLabel="Close account"
					cancelLabel="Keep it"
					onConfirm={handleDeleteAccount}
					onClose={() => setIsConfirming(false)}
				>
					Everything Carl kept for you goes with it, and any paid plan is canceled. This cannot be undone.
				</ConfirmDialog>
			)}
		</section>
	)
}
