// the settings screen: sign out in one press, and closing the account behind the web's confirmation
import { sendDeleteAccount } from "@carlnotes/client/profileClient"
import {
	CLOSE_ACCOUNT_CONFIRMATION,
	CLOSE_ACCOUNT_SECTION_TEXT,
	REQUEST_FAILED_TEXT,
	toSignOutFailedText,
} from "@carlnotes/core/lib/sessionCopy"
import { useState } from "react"
import { Alert, Text, View } from "react-native"
import { mobileAuthClient } from "../src/authClient"
import { SessionButton } from "../src/components/session/SessionButton"
import { SessionErrorText } from "../src/components/session/SessionErrorText"
import { SessionScreen } from "../src/components/session/SessionScreen"
import { toTypeRoleStyle } from "../src/typeRoleStyles"

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
			<Text style={toTypeRoleStyle("pageTitle")} className="text-foreground" accessibilityRole="header">
				Settings
			</Text>
			<SessionButton label="Sign out" onPress={handleSignOut} />

			{/* closing the account, last and destructive as on the web */}
			<View className="mt-8 gap-3 rounded-lg border border-destructive p-4">
				<Text style={toTypeRoleStyle("sectionHeading")} className="text-destructive">
					Close your account
				</Text>
				<Text style={toTypeRoleStyle("body")} className="text-muted-foreground">
					{CLOSE_ACCOUNT_SECTION_TEXT}
				</Text>
				<SessionErrorText text={closeError} />
				<SessionButton
					label={CLOSE_ACCOUNT_CONFIRMATION.confirmLabel}
					variant="destructive"
					onPress={handleCloseAccount}
				/>
			</View>
		</SessionScreen>
	)
}
