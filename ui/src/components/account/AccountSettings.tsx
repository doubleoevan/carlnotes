import { Camera, Check } from "lucide-react"
import { type SubmitEvent, useState } from "react"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Label } from "@/components/primitives/label"
import { PasswordInput } from "@/components/session/PasswordInput"
import { useAvatar } from "@/hooks/useAvatar"
import { authClient } from "@/lib/authClient"
import { sendAccountDelete, sendUsername } from "@/lib/profileClient"
import { cn, SECTION_CARD_CLASS } from "@/lib/utils"

/**
 * The user profile and password settings sections on the account page.
 */
export function AccountSettings() {
	return (
		<>
			<h2 className="font-display pt-2 text-xl">Settings</h2>
			<ProfileSection />
			<EmailSection />
			<PasswordSection />
			{/* closing the account comes last. it is the one thing on this page that cannot be undone */}
			<DeleteAccountSection />
		</>
	)
}

// the avatar with a camera overlay on hover. a click anywhere on the image opens the file chooser
function AvatarPicker({
	userId,
	username,
	avatarSource,
}: {
	userId: string
	username: string
	avatarSource?: string | null
}) {
	const [isUploading, setUploading] = useState(false)
	const [updateRejection, setUpdateRejection] = useState<string | null>(null)
	const { uploadPhoto } = useAvatar()

	// upload the avatar photo. the hook refreshes the session on success, which updates every avatar on the page
	async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
		const avatarFile = event.target.files?.[0]
		if (!avatarFile) {
			return
		}
		setUploading(true)
		setUpdateRejection(null)
		try {
			const avatarRejection = await uploadPhoto(avatarFile)
			if (avatarRejection) {
				setUpdateRejection(AVATAR_REJECTIONS[avatarRejection] ?? "That didn't reach Carl. Try again.")
			}
		} catch (error) {
			console.error("avatar upload failed", error)
			setUpdateRejection("That didn't reach Carl. Try again.")
		} finally {
			setUploading(false)
		}
	}

	return (
		<div>
			<label className="group relative block size-14 cursor-pointer" aria-label="Change your avatar">
				<UserAvatar userId={userId} username={username} avatarSource={avatarSource} className="size-14" />
				{/* the camera overlay shows up on the avatar and only appears on hover or keyboard focus */}
				<span className="absolute inset-0 grid place-items-center rounded-full bg-black/55 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
					<Camera className="size-5 text-white" />
				</span>
				<input
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif"
					onChange={handleFileChange}
					disabled={isUploading}
					className="sr-only"
				/>
			</label>
			{updateRejection && <p className="text-destructive mt-1 text-xs">{updateRejection}</p>}
		</div>
	)
}

// error messages for avatar uploads
const AVATAR_REJECTIONS: Record<string, string> = {
	"too-large": "That image is over 2MB.",
	empty: "That file was empty.",
	"unsupported-type": "PNG, JPEG, WebP or GIF only.",
}

// error messages for username updates
const USERNAME_REJECTIONS: Record<string, string> = {
	length: "Between 3 and 32 characters.",
	charset: "Letters, numbers, hyphens and underscores only.",
	separator: "It can't start or end with a hyphen or underscore.",
	reserved: "That one's taken by the site itself.",
	taken: "Someone already has that one.",
}

// the user profile settings
function ProfileSection() {
	const { data: session, refetch: refreshSession } = authClient.useSession()
	const [username, setUsername] = useState("")
	const [updateRejection, setUpdateRejection] = useState<string | null>(null)
	const [isSaving, setSaving] = useState(false)

	// the avatar comes from the session, which the header reads too, so toggling its source updates both at once
	const { avatarSource, hasProviderPhoto, setAvatarSource } = useAvatar()
	function handleProviderPhotoToggle(): void {
		void setAvatarSource(avatarSource === "oauth" ? "generated" : "oauth")
	}

	// update the username, letting the api apply validation rules
	async function handleUpdateUsername(event: SubmitEvent): Promise<void> {
		event.preventDefault()
		setSaving(true)
		setUpdateRejection(null)
		try {
			const usernameRejection = await sendUsername(username)
			if (usernameRejection) {
				setUpdateRejection(USERNAME_REJECTIONS[usernameRejection] ?? "That didn't work. Try again.")
				return
			}
			// refresh the session so the name on this page and the one in the header change together
			await refreshSession()
			setUsername("")
		} catch (error) {
			console.error("username claim failed", error)
			setUpdateRejection("That didn't reach Carl. Try again.")
		} finally {
			setSaving(false)
		}
	}

	// must be logged in to see your account page
	if (!session) {
		return null
	}
	const currentUsername = session.user.username

	return (
		<section className={SECTION_CARD_CLASS}>
			<h3 className="font-semibold">Profile</h3>
			<div className="mt-3 flex items-center gap-4">
				<AvatarPicker userId={session.user.id} username={currentUsername} avatarSource={avatarSource} />
				<div className="text-sm">
					<p className="font-display text-lg">{currentUsername}</p>
					{/* the provider photo avatar is opt-in. the default avatar is username initials */}
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

			{/* username is display only, so it can be changed as often as the user likes */}
			<form onSubmit={handleUpdateUsername} className="mt-3 max-w-sm space-y-3">
				<div className="space-y-1.5">
					<Label htmlFor="username">New username</Label>
					<Input
						id="username"
						value={username}
						onChange={(event) => setUsername(event.target.value)}
						placeholder={currentUsername}
						aria-describedby={updateRejection ? "username-rejection" : undefined}
						className="bg-card dark:bg-card"
						// a field named "username" reads as a login to password managers so set the autocomplete to nickname
						autoComplete="nickname"
						required
					/>
				</div>
				{updateRejection && (
					<p id="username-rejection" className="text-destructive text-sm">
						{updateRejection}
					</p>
				)}
				<Button type="submit" disabled={isSaving || username.length === 0}>
					Change username
				</Button>
			</form>
		</section>
	)
}

// the change email section. the current address is where scan emails are delivered, so a change is confirmed twice
function EmailSection() {
	const { data: session } = authClient.useSession()
	const [newEmail, setNewEmail] = useState("")
	const [isSubmitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [isRequested, setRequested] = useState(false)

	// ask for the email change. better auth writes to the current address first, and only afterword to the new one
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
		<section className={SECTION_CARD_CLASS}>
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
		<section className={SECTION_CARD_CLASS}>
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

// closing the account, at the bottom of the page and styled as a destructive action
function DeleteAccountSection() {
	const [isConfirming, setIsConfirming] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// close the account, then navigate back to the home page
	const handleDeleteAccount = async (): Promise<void> => {
		setIsConfirming(false)
		setError(null)
		try {
			await sendAccountDelete()
			window.location.href = "/"
		} catch (deleteError) {
			console.error("account delete failed", deleteError)
			setError("That didn't reach Carl. Try again.")
		}
	}

	return (
		<section className={cn(SECTION_CARD_CLASS, "border-destructive")}>
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
