import { authClient } from "@carlnotes/client/authClient"
import { sendDeleteAccount } from "@carlnotes/client/profileClient"
import type { BillingProvider } from "@carlnotes/contracts/plans"
import { STORE_MANAGEMENT_URLS } from "@carlnotes/contracts/storeBilling"
import {
	EmailSection,
	InvitationsSection,
	PasswordSection,
	ProfileFields as SharedProfileFields,
} from "@carlnotes/core/components/AccountFields"
import { BlockedUsersSection } from "@carlnotes/core/components/BlockedUsersSection"
import type { UsernameChange } from "@carlnotes/core/hooks/useUsernameChange"
import { CLOSE_ACCOUNT_CONFIRMATION, REQUEST_FAILED_TEXT, toCloseAccountCopy } from "@carlnotes/core/lib/sessionCopy"
import { PLAN_MANAGEMENT_LABELS } from "@carlnotes/core/lib/storefrontPurchaseRules"
import { cn } from "@carlnotes/nightshift/classNames"
import { Settings } from "lucide-react"
import { useState } from "react"
import { UserAvatarPicker } from "@/components/avatar/UserAvatarPicker"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/primitives/button"
import { CARD_CLASS } from "@/lib/styleClasses"
import { ACCOUNT_FIELD_ELEMENTS, BLOCKED_USERS_ELEMENTS, PROFILE_FIELD_ELEMENTS } from "./AccountFields"

/**
 * The settings sections on the account page: profile, email, password, invitations, blocked people, and closing the
 * account, which names the store for a plan bought in the app.
 */
export function AccountSettings({ provider }: { provider: BillingProvider | null }) {
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
			<BlockedUsersSection elements={BLOCKED_USERS_ELEMENTS} />
			{/* closing the account comes last. it is the one thing on this page that cannot be undone */}
			<DeleteAccountSection provider={provider} />
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

// closing the account, with the store's subscription page for a store plan, which closing the account cannot cancel
function DeleteAccountSection({ provider }: { provider: BillingProvider | null }) {
	const { storeProvider, sectionText, confirmationBody } = toCloseAccountCopy(provider)
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
			<p className="text-muted-foreground mt-1 text-sm">{sectionText}</p>
			{error && <p className="text-destructive mt-2 text-sm">{error}</p>}
			<div className="mt-3 flex flex-wrap gap-2">
				<Button variant="destructive" onClick={() => setIsConfirming(true)}>
					Close account
				</Button>
				{/* the store's subscription page, where a store plan is canceled */}
				{storeProvider && (
					<Button variant="outline" asChild>
						<AnchorLink href={STORE_MANAGEMENT_URLS[storeProvider]}>{PLAN_MANAGEMENT_LABELS[storeProvider]}</AnchorLink>
					</Button>
				)}
			</div>
			{isConfirming && (
				<ConfirmDialog
					title={CLOSE_ACCOUNT_CONFIRMATION.title}
					confirmLabel={CLOSE_ACCOUNT_CONFIRMATION.confirmLabel}
					cancelLabel={CLOSE_ACCOUNT_CONFIRMATION.cancelLabel}
					onConfirm={handleDeleteAccount}
					onClose={() => setIsConfirming(false)}
				>
					{confirmationBody}
				</ConfirmDialog>
			)}
		</section>
	)
}
