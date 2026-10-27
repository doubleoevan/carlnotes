// the text fields the session forms share: a labeled field, and the email and password fields over it
import { cn } from "@carlnotes/nightshift/classNames"
import { FIELD_CLASS } from "@carlnotes/nightshift/field"
import { Text, TextInput, type TextInputProps, View } from "react-native"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * Shows a Nightshift text field with an optional visible label.
 */
export function SessionTextInput({
	label,
	isLabelVisible = true,
	className,
	style,
	multiline,
	...textInputProps
}: { label: string; isLabelVisible?: boolean } & TextInputProps) {
	return (
		<View className="gap-1">
			{isLabelVisible && (
				<Text style={toTypeRoleStyle("label")} className="text-foreground">
					{label}
				</Text>
			)}
			<TextInput
				accessibilityLabel={label}
				className={cn(FIELD_CLASS, "min-h-11 rounded-md border px-3 text-foreground", multiline && "py-2", className)}
				style={[toTypeRoleStyle("body"), style]}
				multiline={multiline}
				textAlignVertical={multiline ? "top" : "center"}
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
