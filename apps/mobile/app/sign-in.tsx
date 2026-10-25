// the sign-in screen: Google and Apple, the email form, the reset link to the web, and the sign-up path
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { OAUTH_ERROR_TEXT, REQUEST_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import * as AppleAuthentication from "expo-apple-authentication"
import * as WebBrowser from "expo-web-browser"
import { type ReactNode, useState } from "react"
import { Platform, Pressable, StyleSheet, useColorScheme, View } from "react-native"
import { signInWithAppleSheet } from "@/appleSignIn"
import { hasSession, mobileAuthClient } from "@/authClient"
import { Button, toButtonHeight, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { AppleIcon, GoogleIcon } from "@/components/session/OAuthProviderIcons"
import { SessionErrorText } from "@/components/session/SessionErrorText"
import { SessionFooterLink } from "@/components/session/SessionLink"
import { SessionScreen } from "@/components/session/SessionScreen"
import { SessionEmailInput, SessionPasswordInput } from "@/components/session/SessionTextInput"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"

// the providers that open the system browser. Apple opens the native sheet on iOS instead
type OAuthProviderId = "google" | "apple"

// the oauth buttons' hero fill and pressed fill, and the color of their label and icon, as on the web
const OAUTH_BUTTON_CLASS = "bg-hero active:bg-hero/90"
const OAUTH_BUTTON_LABEL_CLASS = "text-hero-foreground"

// the muted, underlined label of the email reveal and the reset link, as on the web
const MUTED_LINK_LABEL_CLASS = "text-muted-foreground underline"

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
			{/* the oauth buttons, in the web's order */}
			<OAuthButton label="Continue with Google" icon={<GoogleIcon />} onPress={() => handleBrowserSignIn("google")} />
			<AppleSignInButton onPress={Platform.OS === "ios" ? handleAppleSheet : () => handleBrowserSignIn("apple")} />
			<SessionErrorText text={oauthError} />

			{/* the email form, behind its reveal as on the web */}
			{isEmailFormOpen ? (
				<EmailSignInForm />
			) : (
				<Button variant="link" accessibilityLabel="Continue with email" onPress={() => setIsEmailFormOpen(true)}>
					<Text className={MUTED_LINK_LABEL_CLASS}>Continue with email</Text>
				</Button>
			)}

			{/* the link to the sign-up screen */}
			<SessionFooterLink prompt={"Don't have an account?"} linkLabel="Sign up" href="/sign-up" />
		</SessionScreen>
	)
}

// an oauth provider's button on the hero fill, with its icon before its label as on the web
function OAuthButton({ label, icon, onPress }: { label: string; icon: ReactNode; onPress: () => void }) {
	return (
		<Button className={OAUTH_BUTTON_CLASS} accessibilityLabel={label} onPress={onPress}>
			{icon}
			<Text className={OAUTH_BUTTON_LABEL_CLASS}>{label}</Text>
		</Button>
	)
}

// Apple's button. on iOS the native button, which follows Apple's Human Interface Guidelines, black on light and white
// on dark, at the oauth buttons' height. the native button takes touches only inside its bounds, so a pressable around
// it gives the touch target. on Android the same OAuthButton as Google's
function AppleSignInButton({ onPress }: { onPress: () => void }) {
	// the color scheme, the height the other oauth buttons draw, grown with a larger system text size but never smaller,
	// as Apple's guidelines ask, and the hit slop that grows that height to the touch target
	const colorScheme = useColorScheme()
	const oauthButtonHeight = toButtonHeight("default")
	const appleButtonHeight = Math.max(oauthButtonHeight, useFontScaledSize(oauthButtonHeight))
	const appleButtonHitSlop = toTouchTargetHitSlop(appleButtonHeight)
	if (Platform.OS !== "ios") {
		return (
			<OAuthButton
				label="Continue with Apple"
				icon={<AppleIcon className={OAUTH_BUTTON_LABEL_CLASS} />}
				onPress={onPress}
			/>
		)
	}
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel="Continue with Apple"
			hitSlop={appleButtonHitSlop}
			onPress={onPress}
			style={({ pressed }) => (pressed ? styles.pressedAppleButton : undefined)}
		>
			<View
				style={styles.appleButtonDrawing}
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
			>
				<AppleAuthentication.AppleAuthenticationButton
					buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
					buttonStyle={
						colorScheme === "dark"
							? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
							: AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
					}
					cornerRadius={8}
					style={{ height: appleButtonHeight }}
					onPress={onPress}
				/>
			</View>
		</Pressable>
	)
}

// the native Apple button only draws, and the pressable around it dims while pressed, as the hero buttons' pressed
// fill does
const styles = StyleSheet.create({
	appleButtonDrawing: { pointerEvents: "none" },
	pressedAppleButton: { opacity: 0.9 },
})

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
			<Button
				variant="link"
				accessibilityLabel="Forgot password?"
				onPress={() => WebBrowser.openBrowserAsync(`${SITE_URL}/reset-password`)}
			>
				<Text className={MUTED_LINK_LABEL_CLASS}>Forgot password?</Text>
			</Button>
			<SessionErrorText text={error} />
			<Button accessibilityLabel="Log in" onPress={handleSubmit} disabled={isSubmitting}>
				<Text>Log in</Text>
			</Button>
		</View>
	)
}
