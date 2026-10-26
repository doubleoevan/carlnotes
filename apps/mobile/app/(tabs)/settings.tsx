import { sendDeleteAccount } from "@carlnotes/client/profileClient"
import { CLOSE_ACCOUNT_CONFIRMATION, REQUEST_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { useState } from "react"
import { Alert, ScrollView, View } from "react-native"
import { mobileAuthClient, retireCurrentSession } from "@/authClient"
import { SettingsContent, SignedInUserRow } from "@/components/account/SettingsContent"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import { Header } from "@/components/layout/Header"
import { useSignOut } from "@/hooks/useSignOut"

/**
 * Keeps account requests and their confirmation in the protected Settings route.
 */
export default function SettingsScreen() {
	// hold the controls while either account request is pending
	const [closeError, setCloseError] = useState<string | null>(null)
	const [isClosing, setIsClosing] = useState(false)
	const { isPending: isSigningOut, signOut } = useSignOut()
	const isPending = isClosing || isSigningOut
	const handleDelete = async (): Promise<void> => {
		setIsClosing(true)
		setCloseError(null)
		try {
			await sendDeleteAccount()
			await retireCurrentSession()
			await mobileAuthClient.signOut()
		} catch (error) {
			console.error("account close failed", error)
			setCloseError(REQUEST_FAILED_TEXT)
		} finally {
			setIsClosing(false)
		}
	}
	const handleCloseAccount = (): void =>
		Alert.alert(CLOSE_ACCOUNT_CONFIRMATION.title, CLOSE_ACCOUNT_CONFIRMATION.body, [
			{ text: CLOSE_ACCOUNT_CONFIRMATION.cancelLabel, style: "cancel" },
			{ text: CLOSE_ACCOUNT_CONFIRMATION.confirmLabel, style: "destructive", onPress: handleDelete },
		])
	return (
		<View className="flex-1 bg-background">
			<Header />
			<ClassNameSafeAreaView edges={["left", "right"]} className="w-full max-w-3xl flex-1 self-center">
				<ScrollView>
					<SettingsContent
						identity={<SignedInUserRow />}
						closeError={closeError}
						isPending={isPending}
						onSignOut={signOut}
						onCloseAccount={handleCloseAccount}
					/>
				</ScrollView>
			</ClassNameSafeAreaView>
		</View>
	)
}
