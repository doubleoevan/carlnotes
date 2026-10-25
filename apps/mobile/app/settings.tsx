// the settings screen: sign out in one press, and closing the account behind the web's confirmation
import { sendDeleteAccount } from "@carlnotes/client/profileClient"
import {
	CLOSE_ACCOUNT_CONFIRMATION,
	CLOSE_ACCOUNT_SECTION_TEXT,
	REQUEST_FAILED_TEXT,
	toSignOutFailedText,
} from "@carlnotes/core/lib/sessionCopy"
import { useState } from "react"
import { Alert, Text as NativeText, View } from "react-native"
import { mobileAuthClient } from "@/authClient"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { SessionErrorText } from "@/components/session/SessionErrorText"
import { SessionScreen } from "@/components/session/SessionScreen"
import { toTypeRoleStyle } from "@/typeRoleStyles"

export default function SettingsScreen() {
	const [closeError, setCloseError] = useState<string | null>(null)

	// sign out. the session store empties, and the guard shows the sign-in screen
	const handleSignOut = async (): Promise<void> => {
		const { error } = await mobileAuthClient.signOut()
		if (error) {
			Alert.alert("CarlNotes", toSignOutFailedText(error.message))
		}
	}

	// close the account through the web's route, then sign out. nothing signed in survives in the app
	const closeAccount = async (): Promise<void> => {
		setCloseError(null)
		try {
			await sendDeleteAccount()
			await mobileAuthClient.signOut()
		} catch (closeError) {
			console.error("account close failed", closeError)
			setCloseError(REQUEST_FAILED_TEXT)
		}
	}

	// confirm with the web's words before anything is destroyed
	const handleCloseAccount = (): void => {
		Alert.alert(CLOSE_ACCOUNT_CONFIRMATION.title, CLOSE_ACCOUNT_CONFIRMATION.body, [
			{ text: CLOSE_ACCOUNT_CONFIRMATION.cancelLabel, style: "cancel" },
			{ text: CLOSE_ACCOUNT_CONFIRMATION.confirmLabel, style: "destructive", onPress: closeAccount },
		])
	}

	return (
		<SessionScreen>
			<NativeText style={toTypeRoleStyle("pageTitle")} className="text-foreground" accessibilityRole="header">
				Settings
			</NativeText>
			<Button accessibilityLabel="Sign out" onPress={handleSignOut}>
				<Text>Sign out</Text>
			</Button>

			{/* closing the account, last and destructive as on the web */}
			<View className="mt-8 gap-3 rounded-lg border border-destructive p-4">
				<NativeText style={toTypeRoleStyle("sectionHeading")} className="text-destructive">
					Close your account
				</NativeText>
				<NativeText style={toTypeRoleStyle("body")} className="text-muted-foreground">
					{CLOSE_ACCOUNT_SECTION_TEXT}
				</NativeText>
				<SessionErrorText text={closeError} />
				<Button
					variant="destructive"
					accessibilityLabel={CLOSE_ACCOUNT_CONFIRMATION.confirmLabel}
					onPress={handleCloseAccount}
				>
					<Text>{CLOSE_ACCOUNT_CONFIRMATION.confirmLabel}</Text>
				</Button>
			</View>
		</SessionScreen>
	)
}
