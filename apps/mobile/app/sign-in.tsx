// the sign-in screen: Google and Apple, the email form, the reset link to the web, and the sign-up path

import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { OAUTH_ERROR_TEXT, REQUEST_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import * as AppleAuthentication from "expo-apple-authentication"
import * as WebBrowser from "expo-web-browser"
import { useState } from "react"
import { Platform, useColorScheme, View } from "react-native"
import { signInWithAppleSheet } from "../src/appleSignIn"
import { hasSession, mobileAuthClient } from "../src/authClient"
import { SessionButton } from "../src/components/session/SessionButton"
import { SessionErrorText } from "../src/components/session/SessionErrorText"
import { SessionFooterLink } from "../src/components/session/SessionLink"
import { SessionScreen } from "../src/components/session/SessionScreen"
import { SessionEmailInput, SessionPasswordInput } from "../src/components/session/SessionTextInput"

// the providers that open the system browser. Apple opens the native sheet on iOS instead
type OAuthProviderId = "google" | "apple"

export default function SignInScreen() {
	const [oauthError, setOauthError] = useState<string | null>(null)
	const [isEmailFormOpen, setIsEmailFormOpen] = useState(false)

	// open a provider's sign-in in the system browser. the session arrives when the browser returns to the app, and a
	// browser closed before then returns with no error and no session
	const handleBrowserSignIn = async (provider: OAuthProviderId): Promise<void> => {
		setOauthError(null)
		try {
			const { error } = await mobileAuthClient.signIn.social({ provider, callbackURL: "/" })
			if (!error && hasSession()) {
				return
			}
			console.error(`the ${provider} sign-in did not complete`, error)
		} catch (networkError) {
			console.error(`the ${provider} sign-in request failed`, networkError)
		}
		setOauthError(OAUTH_ERROR_TEXT)
	}

	// open Apple's native sheet on iOS
	const handleAppleSheet = async (): Promise<void> => {
		setOauthError(null)
		setOauthError(await signInWithAppleSheet())
	}

	return (
		<SessionScreen>
			{/* the provider buttons, in the web's order */}
			<SessionButton label="Continue with Google" variant="hero" onPress={() => handleBrowserSignIn("google")} />
			<AppleSignInButton onPress={Platform.OS === "ios" ? handleAppleSheet : () => handleBrowserSignIn("apple")} />
			<SessionErrorText text={oauthError} />

			{/* the email form, behind its reveal as on the web */}
			{isEmailFormOpen ? (
				<EmailSignInForm />
			) : (
				<SessionButton label="Continue with email" variant="link" onPress={() => setIsEmailFormOpen(true)} />
			)}

			{/* the link to the sign-up screen */}
			<SessionFooterLink prompt={"Don't have an account?"} linkLabel="Sign up" href="/sign-up" />
		</SessionScreen>
	)
}

// Apple's button. on iOS the native button, which follows Apple's Human Interface Guidelines, black on light and white
// on dark. on Android a button in the provider row's style
function AppleSignInButton({ onPress }: { onPress: () => void }) {
	const colorScheme = useColorScheme()
	if (Platform.OS !== "ios") {
		return <SessionButton label="Continue with Apple" variant="hero" onPress={onPress} />
	}
	return (
		<AppleAuthentication.AppleAuthenticationButton
			buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
			buttonStyle={
				colorScheme === "dark"
					? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
					: AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
			}
			cornerRadius={8}
			style={{ height: 44 }}
			onPress={onPress}
		/>
	)
}

// the email and password form, with the reset link that opens the web's flow
function EmailSignInForm() {
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setIsSubmitting] = useState(false)

	// sign in natively. the session store updates, and the guard moves the user to the home screen
	const handleSubmit = async (): Promise<void> => {
		setIsSubmitting(true)
		setError(null)
		try {
			const { error: signInError } = await mobileAuthClient.signIn.email({ email, password })
			if (signInError) {
				setError(signInError.message ?? "Log in failed.")
			}
		} catch (networkError) {
			console.error("sign-in failed", networkError)
			setError(REQUEST_FAILED_TEXT)
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<View className="mt-4 gap-4">
			<SessionEmailInput value={email} onChangeText={setEmail} />
			<SessionPasswordInput value={password} onChangeText={setPassword} />
			{/* the reset flow lives on the web */}
			<SessionButton
				label="Forgot password?"
				variant="link"
				onPress={() => WebBrowser.openBrowserAsync(`${SITE_URL}/reset-password`)}
			/>
			<SessionErrorText text={error} />
			<SessionButton label="Log in" onPress={handleSubmit} isDisabled={isSubmitting} />
		</View>
	)
}
