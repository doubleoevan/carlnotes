import { authClient } from "@carlnotes/client/authClient"
import { sendInviteAccess } from "@carlnotes/client/profileClient"
import { type ComponentType, type ReactNode, useState } from "react"
import { useAvatar } from "../hooks/useAvatar"
import { type UsernameChange, useUsernameChange } from "../hooks/useUsernameChange"
import { REQUEST_FAILED_TEXT, SAVE_FAILED_TEXT } from "../lib/sessionCopy"

type Container = ComponentType<{ children: ReactNode; className?: string }>
export type AccountFieldElements = {
	Card: Container
	Group: Container
	Form: ComponentType<{ children: ReactNode; onSubmit: () => void }>
	Heading: Container
	Text: Container
	Field: ComponentType<{
		label: string
		value: string
		onChange: (value: string) => void
		kind?: "email" | "current-password" | "new-password"
	}>
	Button: ComponentType<{ label: string; onPress: () => void; isDisabled?: boolean }>
	Choice: ComponentType<{
		label: string
		description?: string
		isSelected: boolean
		isDisabled: boolean
		onSelect: () => void
	}>
	// a labeled on and off switch
	Switch: ComponentType<{
		label: string
		isChecked: boolean
		isDisabled: boolean
		onChange: (isChecked: boolean) => void
	}>
}

// the profile's platform controls. the shared form owns labels, visibility, and saving
export type ProfileFieldElements = {
	Root: Container
	Identity: ComponentType<{ avatar: ReactNode; children: ReactNode }>
	Text: Container
	ProviderPhoto: ComponentType<{ label: string; isSelected: boolean; onSelect: () => void }>
	Form: ComponentType<{ children: ReactNode; onSubmit: () => void; isExternallySaved: boolean }>
	Field: ComponentType<{
		label: string
		value: string
		onChange: (value: string) => void
		placeholder: string
		hasRejection: boolean
	}>
	Rejection: Container
	Button: AccountFieldElements["Button"]
}

/**
 * Composes the same profile identity, photo preference, and username form on both platforms.
 */
export function ProfileFields({
	elements,
	avatar,
	username,
	className,
	usernameChange,
	onUsernameChanged,
}: {
	elements: ProfileFieldElements
	avatar: ReactNode
	username: string
	className?: string
	usernameChange?: UsernameChange
	onUsernameChanged?: () => void
}) {
	// retain an externally controlled username in the web profile dialog
	const fallbackUsernameChange = useUsernameChange(onUsernameChanged)
	const accountUsernameChange = usernameChange ?? fallbackUsernameChange
	const { avatarSource, hasProviderPhoto, setAvatarSource } = useAvatar()
	const { Root, Identity, Text, ProviderPhoto, Form, Field, Rejection, Button } = elements
	function handleProviderPhotoToggle(): void {
		void setAvatarSource(avatarSource === "oauth" ? "generated" : "oauth")
	}
	function handleUpdateUsername(): void {
		void accountUsernameChange.saveUsername()
	}

	return (
		<Root className={className}>
			{/* the current identity and the optional sign-in provider photo */}
			<Identity avatar={avatar}>
				<Text className="font-display text-lg">{username}</Text>
				{hasProviderPhoto && (
					<ProviderPhoto
						label="Use the photo from my sign-in provider"
						isSelected={avatarSource === "oauth"}
						onSelect={handleProviderPhotoToggle}
					/>
				)}
			</Identity>
			{/* the dialog owns its save button when it supplies username state */}
			<Form onSubmit={handleUpdateUsername} isExternallySaved={Boolean(usernameChange)}>
				<Field
					label="New username"
					value={accountUsernameChange.username}
					onChange={accountUsernameChange.setUsername}
					placeholder={username}
					hasRejection={Boolean(accountUsernameChange.rejection)}
				/>
				{accountUsernameChange.rejection && <Rejection>{accountUsernameChange.rejection}</Rejection>}
				{!usernameChange && (
					<Button
						label="Change username"
						onPress={handleUpdateUsername}
						isDisabled={accountUsernameChange.isSaving || !accountUsernameChange.username}
					/>
				)}
			</Form>
		</Root>
	)
}

/**
 * Shows the same email-change form and confirmation in both apps.
 */
export function EmailSection({ elements, callbackURL }: { elements: AccountFieldElements; callbackURL: string }) {
	// keep failed requests editable and stop duplicate submissions
	const { data: session } = authClient().useSession()
	const [newEmail, setNewEmail] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [isRequested, setIsRequested] = useState(false)
	const { Card, Form, Heading, Text, Field, Button } = elements
	async function handleChangeEmail(): Promise<void> {
		if (isSubmitting || !newEmail.trim()) {
			return
		}
		setIsSubmitting(true)
		setError(null)
		try {
			const { error: changeError } = await authClient().changeEmail({ newEmail: newEmail.trim(), callbackURL })
			if (changeError) {
				setError(changeError.message ?? "That didn't work. Try again.")
			} else {
				setIsRequested(true)
			}
		} catch {
			setError(REQUEST_FAILED_TEXT)
		} finally {
			setIsSubmitting(false)
		}
	}
	if (!session) {
		return null
	}
	return (
		<Card>
			<Heading>Email</Heading>
			<Text className="text-muted-foreground mt-1 text-sm">
				{"Scans are delivered here. It's also how you sign in with a password."}
			</Text>
			<Text className="mt-2 text-sm">{session.user.email}</Text>
			{/* confirmation replaces only the completed form */}
			{isRequested ? (
				<Text className="mt-3 text-sm">{`Check ${session.user.email} for a link to confirm the change.\nConfirm so Carl can send notes to your new address.`}</Text>
			) : (
				<Form onSubmit={() => void handleChangeEmail()}>
					<Field label="New email" value={newEmail} onChange={setNewEmail} kind="email" />
					{error && <Text className="text-destructive text-sm">{error}</Text>}
					<Button
						label="Change email"
						onPress={() => void handleChangeEmail()}
						isDisabled={isSubmitting || !newEmail.trim()}
					/>
				</Form>
			)}
		</Card>
	)
}

/**
 * Changes the password with identical validation feedback and session policy on both platforms.
 */
export function PasswordSection({ elements }: { elements: AccountFieldElements }) {
	// clear credentials only after an accepted change
	const [currentPassword, setCurrentPassword] = useState("")
	const [newPassword, setNewPassword] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [isChanged, setIsChanged] = useState(false)
	const { Card, Form, Heading, Text, Field, Button } = elements
	async function handleChangePassword(): Promise<void> {
		if (isSubmitting) {
			return
		}
		setIsSubmitting(true)
		setError(null)
		setIsChanged(false)
		try {
			const { error: changeError } = await authClient().changePassword({
				currentPassword,
				newPassword,
				revokeOtherSessions: true,
			})
			if (changeError) {
				setError(changeError.message ?? "That didn't work. Check your current password.")
				return
			}
			setCurrentPassword("")
			setNewPassword("")
			setIsChanged(true)
		} catch {
			setError(REQUEST_FAILED_TEXT)
		} finally {
			setIsSubmitting(false)
		}
	}
	return (
		<Card>
			<Heading>Password</Heading>
			<Form onSubmit={() => void handleChangePassword()}>
				<Field label="Current password" value={currentPassword} onChange={setCurrentPassword} kind="current-password" />
				<Field label="New password" value={newPassword} onChange={setNewPassword} kind="new-password" />
				{error && <Text className="text-destructive text-sm">{error}</Text>}
				{isChanged && <Text className="text-sm">{"Password changed. You've been signed out everywhere else."}</Text>}
				<Button label="Change password" onPress={() => void handleChangePassword()} isDisabled={isSubmitting} />
			</Form>
		</Card>
	)
}

// the same levels and explanation wherever the account is edited
const INVITE_CHOICES = [
	{ value: "anyone", label: "Anyone" },
	{
		value: "connected",
		label: "People I interact with",
		description:
			"People you share a team with, people following one of your topics, and people whose invitations you accepted.",
	},
	{ value: "nobody", label: "Nobody" },
] as const

/**
 * Saves who may invite the account, retaining the acknowledged choice on failure.
 */
export function InvitationsSection({ elements }: { elements: AccountFieldElements }) {
	// disable overlapping writes and read the saved choice from the shared session
	const { data: session, refetch } = authClient().useSession()
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const { Card, Group, Heading, Text, Choice } = elements
	async function handleSelect(inviteAccess: "anyone" | "connected" | "nobody"): Promise<void> {
		if (isSaving) {
			return
		}
		setIsSaving(true)
		setError(null)
		try {
			await sendInviteAccess(inviteAccess)
			await refetch()
		} catch {
			setError(SAVE_FAILED_TEXT)
		} finally {
			setIsSaving(false)
		}
	}
	if (!session) {
		return null
	}
	const selectedChoice = session.user.inviteAccess || "anyone"
	return (
		<Card>
			<Heading>Invitations</Heading>
			<Text className="text-muted-foreground mt-1 text-sm">Who may invite you to topics and teams.</Text>
			<Group>
				{INVITE_CHOICES.map((choice) => (
					<Choice
						key={choice.value}
						label={choice.label}
						description={"description" in choice ? choice.description : undefined}
						isSelected={selectedChoice === choice.value}
						isDisabled={isSaving}
						onSelect={() => void handleSelect(choice.value)}
					/>
				))}
			</Group>
			{error && <Text className="text-destructive mt-2 text-sm">{error}</Text>}
		</Card>
	)
}
