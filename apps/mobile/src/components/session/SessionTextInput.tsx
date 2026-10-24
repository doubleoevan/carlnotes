// the text fields the session forms share: a labeled field, and the email and password fields over it
import { Text, TextInput, type TextInputProps, View } from "react-native"
import { toTypeRoleStyle } from "../../typeRoleStyles"

/**
 * A labeled text field on the card surface.
 */
export function SessionTextInput({ label, ...textInputProps }: { label: string } & TextInputProps) {
	return (
		<View className="gap-1">
			<Text style={toTypeRoleStyle("label")} className="text-foreground">
				{label}
			</Text>
			<TextInput
				accessibilityLabel={label}
				className="min-h-11 rounded-lg border border-border bg-card px-3 text-foreground"
				style={toTypeRoleStyle("body")}
				autoCapitalize="none"
				autoCorrect={false}
				{...textInputProps}
			/>
		</View>
	)
}

/**
 * The email field the sign-in and sign-up forms share.
 */
export function SessionEmailInput({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) {
	return (
		<SessionTextInput
			label="Email"
			value={value}
			onChangeText={onChangeText}
			keyboardType="email-address"
			autoComplete="email"
			textContentType="emailAddress"
		/>
	)
}

/**
 * The password field the sign-in and sign-up forms share, marked as the current or a new password for autofill.
 */
export function SessionPasswordInput({
	value,
	onChangeText,
	isNewPassword = false,
}: {
	value: string
	onChangeText: (value: string) => void
	isNewPassword?: boolean
}) {
	return (
		<SessionTextInput
			label="Password"
			value={value}
			onChangeText={onChangeText}
			secureTextEntry
			autoComplete={isNewPassword ? "new-password" : "current-password"}
			textContentType={isNewPassword ? "newPassword" : "password"}
		/>
	)
}
