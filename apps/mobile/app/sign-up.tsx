// the sign-up screen: the web's two fields in the web's order, the install's proof behind the gate, and the web's
// sign-up as the way out for an install that cannot attest
import { MIN_PASSWORD_LENGTH, signupCredentialsPayload } from "@carlnotes/contracts/signupGate"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import {
	APP_SIGNUP_GATE_FAILED_TEXT,
	REQUEST_FAILED_TEXT,
	toVerifyEmailNoticeText,
	VERIFY_EMAIL_TITLE,
} from "@carlnotes/core/lib/sessionCopy"
import * as WebBrowser from "expo-web-browser"
import { useState } from "react"
import { Alert } from "react-native"
import { verifyInstallForSignup } from "@/appSignupGate"
import { mobileAuthClient } from "@/authClient"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { SessionErrorText } from "@/components/session/SessionErrorText"
import { SessionFooterLink } from "@/components/session/SessionLink"
import { SessionScreen } from "@/components/session/SessionScreen"
import { SessionEmailInput, SessionPasswordInput } from "@/components/session/SessionTextInput"

// what the form says for each field the payload rejects
const EMAIL_INVALID_TEXT = "Enter a valid email address."
const PASSWORD_SHORT_TEXT = `Use at least ${MIN_PASSWORD_LENGTH} characters.`

export default function SignUpScreen() {
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [isInstallUnverified, setIsInstallUnverified] = useState(false)

	// check the fields, prove the install, then create the account. the session arrives with the sign-up
	const handleSubmit = async (): Promise<void> => {
		// the fields, by the rule the api applies
		const credentials = signupCredentialsPayload.safeParse({ email, password })
		if (!credentials.success) {
			setError(
				credentials.error.issues.some((issue) => issue.path[0] === "email") ? EMAIL_INVALID_TEXT : PASSWORD_SHORT_TEXT,
			)
			return
		}
		setIsSubmitting(true)
		setError(null)

		// the gate, with nothing for the visitor to complete. an install that cannot attest is sent to the web
		try {
			if (!(await verifyInstallForSignup())) {
				setIsInstallUnverified(true)
				setError(APP_SIGNUP_GATE_FAILED_TEXT)
				return
			}

			// the account, named after the email's local part as on the web
			const name = email.split("@")[0] ?? email
			const { error: signUpError } = await mobileAuthClient.signUp.email({ email, password, name })
			if (signUpError) {
				setError(signUpError.message ?? "Sign up failed.")
				return
			}
			Alert.alert(VERIFY_EMAIL_TITLE, toVerifyEmailNoticeText(email))
		} catch (signUpError) {
			console.error("sign-up failed", signUpError)
			setError(REQUEST_FAILED_TEXT)
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<SessionScreen>
			<SessionEmailInput value={email} onChangeText={setEmail} />
			<SessionPasswordInput value={password} onChangeText={setPassword} isNewPassword />
			<SessionErrorText text={error} />

			{/* the web's sign-up, for an install the gate could not verify */}
			{isInstallUnverified ? (
				<Button
					accessibilityLabel="Sign up on carlnotes.com"
					onPress={() => WebBrowser.openBrowserAsync(`${SITE_URL}/signup`)}
				>
					<Text>Sign up on carlnotes.com</Text>
				</Button>
			) : (
				<Button accessibilityLabel="Sign up" onPress={handleSubmit} disabled={isSubmitting}>
					<Text>Sign up</Text>
				</Button>
			)}

			{/* the link back to the sign-in screen */}
			<SessionFooterLink prompt="Already have an account?" linkLabel="Log in" href="/sign-in" />
		</SessionScreen>
	)
}
