import { type InviteFieldElements, InviteFields as SharedInviteFields } from "@carlnotes/core/components/InviteFields"
import { X } from "lucide-react-native"
import type { ComponentProps } from "react"
import { TextInput, View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * Presents the shared invitation fields using native inputs and removable chips.
 */
export function InviteFields(props: Omit<ComponentProps<typeof SharedInviteFields>, "elements">) {
	return <SharedInviteFields {...props} elements={INVITE_FIELD_ELEMENTS} />
}

// every native invitation form uses the same controls
const INVITE_FIELD_ELEMENTS: InviteFieldElements = {
	Group: ({ children }) => <View className="gap-2">{children}</View>,
	Row: ({ children }) => <View className="flex-row items-center gap-2">{children}</View>,
	Chips: ({ children }) => <View className="flex-row flex-wrap gap-1.5">{children}</View>,
	Label: ({ children }) => <Text className="font-medium text-sm">{children}</Text>,
	Error: ({ children }) => <Text className="text-xs text-destructive">{children}</Text>,
	Chip: ({ label, onRemove }) => (
		<Button
			variant="secondary"
			size="sm"
			className="rounded-full"
			accessibilityLabel={`Remove ${label}`}
			onPress={onRemove}
		>
			<Text>{label}</Text>
			<Icon as={X} className="size-3" />
		</Button>
	),
	Input: ({ label, value, placeholder, kind, onChange, onSubmit }) => (
		<TextInput
			accessibilityLabel={label}
			value={value}
			placeholder={placeholder}
			onChangeText={onChange}
			onSubmitEditing={onSubmit}
			keyboardType={kind === "email" ? "email-address" : "default"}
			autoCapitalize="none"
			autoCorrect={false}
			autoComplete="off"
			returnKeyType="done"
			style={toTypeRoleStyle("body")}
			className="min-h-11 min-w-0 flex-1 rounded-md border border-separator bg-card px-3 text-foreground placeholder:text-muted-foreground"
		/>
	),
	Button: ({ onPress, isDisabled }) => (
		<Button variant="outline" accessibilityLabel="Invite" disabled={isDisabled} onPress={onPress}>
			<Text>Invite</Text>
		</Button>
	),
}
