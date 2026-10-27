import { authClient } from "@carlnotes/client/authClient"
import { sendDeleteAccount } from "@carlnotes/client/profileClient"
import {
	EmailSection,
	InvitationsSection,
	PasswordSection,
	ProfileFields as SharedProfileFields,
} from "@carlnotes/core/components/AccountFields"
import type { UsernameChange } from "@carlnotes/core/hooks/useUsernameChange"
import {
	CLOSE_ACCOUNT_CONFIRMATION,
	CLOSE_ACCOUNT_SECTION_TEXT,
	REQUEST_FAILED_TEXT,
} from "@carlnotes/core/lib/sessionCopy"
import { cn } from "@carlnotes/nightshift/classNames"
import { Settings } from "lucide-react"
import { useState } from "react"
import { UserAvatarPicker } from "@/components/avatar/UserAvatarPicker"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/primitives/button"
import { CARD_CLASS } from "@/lib/styleClasses"
import { ACCOUNT_FIELD_ELEMENTS, PROFILE_FIELD_ELEMENTS } from "./AccountFields"

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
			<EmailSection elements={ACCOUNT_FIELD_ELEMENTS} callbackURL="/account" />
			<PasswordSection elements={ACCOUNT_FIELD_ELEMENTS} />
			<InvitationsSection elements={ACCOUNT_FIELD_ELEMENTS} />
			{/* closing the account comes last. it is the one thing on this page that cannot be undone */}
			<DeleteAccountSection />
		</>
	)
}

// the user profile settings
function ProfileSection() {
	const { data: session } = authClient().useSession()

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
	return (
		<SharedProfileFields
			elements={PROFILE_FIELD_ELEMENTS}
			avatar={<UserAvatarPicker userId={userId} username={username} />}
			username={username}
			className={className}
			usernameChange={usernameChange}
			onUsernameChanged={onUsernameChanged}
		/>
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
			setError(REQUEST_FAILED_TEXT)
		}
	}

	return (
		<section className={cn(CARD_CLASS, "border-destructive")}>
			<h3 className="text-destructive font-semibold">Close your account</h3>
			<p className="text-muted-foreground mt-1 text-sm">{CLOSE_ACCOUNT_SECTION_TEXT}</p>
			{error && <p className="text-destructive mt-2 text-sm">{error}</p>}
			<Button variant="destructive" className="mt-3" onClick={() => setIsConfirming(true)}>
				Close account
			</Button>
			{isConfirming && (
				<ConfirmDialog
					title={CLOSE_ACCOUNT_CONFIRMATION.title}
					confirmLabel={CLOSE_ACCOUNT_CONFIRMATION.confirmLabel}
					cancelLabel={CLOSE_ACCOUNT_CONFIRMATION.cancelLabel}
					onConfirm={handleDeleteAccount}
					onClose={() => setIsConfirming(false)}
				>
					{CLOSE_ACCOUNT_CONFIRMATION.body}
				</ConfirmDialog>
			)}
		</section>
	)
}
