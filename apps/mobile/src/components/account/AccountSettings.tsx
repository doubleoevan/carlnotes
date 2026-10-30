import { authClient } from "@carlnotes/client/authClient"
import { sendDeleteAccount } from "@carlnotes/client/profileClient"
import { SITE_URL } from "@carlnotes/contracts/site"
import {
	EmailSection,
	InvitationsSection,
	PasswordSection,
	ProfileFields as SharedProfileFields,
} from "@carlnotes/core/components/AccountFields"
import { BlockedUsersSection } from "@carlnotes/core/components/BlockedUsersSection"
import {
	CLOSE_ACCOUNT_CONFIRMATION,
	CLOSE_ACCOUNT_SECTION_TEXT,
	REQUEST_FAILED_TEXT,
} from "@carlnotes/core/lib/sessionCopy"
import { Settings } from "lucide-react-native"
import { useState } from "react"
import { Alert, View } from "react-native"
import { mobileAuthClient, retireCurrentSession } from "@/authClient"
import { UserAvatarPicker } from "@/components/avatar/UserAvatarPicker"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { ACCOUNT_FIELD_ELEMENTS, BLOCKED_USERS_ELEMENTS, PROFILE_FIELD_ELEMENTS } from "./AccountFields"

/**
 * Shows every web account setting using shared forms and native profile and session adapters.
 */
export function AccountSettings() {
	return (
		<>
			<View className="flex-row items-center gap-2">
				<Icon as={Settings} className="size-5 text-foreground" />
				<Text accessibilityRole="header" className="font-display text-xl">
					Settings
				</Text>
			</View>
			<View className="rounded-lg border border-separator bg-card p-4 shadow-raised">
				<Text className="font-semibold">Profile</Text>
				<ProfileFields />
			</View>
			<EmailSection elements={ACCOUNT_FIELD_ELEMENTS} callbackURL={`${SITE_URL}/account`} />
			<PasswordSection elements={ACCOUNT_FIELD_ELEMENTS} />
			<InvitationsSection elements={ACCOUNT_FIELD_ELEMENTS} />
			<BlockedUsersSection elements={BLOCKED_USERS_ELEMENTS} />
			<DeleteAccountSection />
		</>
	)
}

/**
 * Shares profile editing between the native account and profile screens.
 */
export function ProfileFields({ onUsernameChanged }: { onUsernameChanged?: () => void }) {
	// read the active account before mounting the shared profile form
	const { data: session } = authClient().useSession()
	if (!session) {
		return null
	}
	return (
		<SharedProfileFields
			key={session.user.id}
			elements={PROFILE_FIELD_ELEMENTS}
			avatar={<UserAvatarPicker userId={session.user.id} username={session.user.username} />}
			username={session.user.username}
			className="mt-3"
			onUsernameChanged={onUsernameChanged}
		/>
	)
}

// close the account only after confirmation and retire its local data before leaving the session
function DeleteAccountSection() {
	const [isClosing, setIsClosing] = useState(false)
	const [error, setError] = useState<string | null>(null)
	async function handleDelete(): Promise<void> {
		setIsClosing(true)
		setError(null)
		try {
			await sendDeleteAccount()
			await retireCurrentSession()
			await mobileAuthClient.signOut()
		} catch {
			setError(REQUEST_FAILED_TEXT)
		} finally {
			setIsClosing(false)
		}
	}
	return (
		<View className="gap-3 rounded-lg border border-destructive bg-card p-4">
			<Text className="font-semibold text-destructive">Close your account</Text>
			<Text className="text-sm text-muted-foreground">{CLOSE_ACCOUNT_SECTION_TEXT}</Text>
			{error && <Text className="text-sm text-destructive">{error}</Text>}
			<Button
				variant="destructive"
				className="self-start"
				accessibilityLabel="Close account"
				disabled={isClosing}
				onPress={() =>
					Alert.alert(CLOSE_ACCOUNT_CONFIRMATION.title, CLOSE_ACCOUNT_CONFIRMATION.body, [
						{ text: CLOSE_ACCOUNT_CONFIRMATION.cancelLabel, style: "cancel" },
						{ text: CLOSE_ACCOUNT_CONFIRMATION.confirmLabel, style: "destructive", onPress: () => void handleDelete() },
					])
				}
			>
				<Text>Close account</Text>
			</Button>
		</View>
	)
}
