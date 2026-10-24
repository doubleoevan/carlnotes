// the button the session screens press
import { Pressable, Text } from "react-native"
import { toTypeRoleStyle } from "../../typeRoleStyles"

// how a button draws: the provider buttons' hero surface, the form's primary, the destructive close, or a text link
export type SessionButtonVariant = "hero" | "primary" | "destructive" | "link"

// the classes each variant draws with. tailwind reads only literal class names, so each spells out its own
const BUTTON_CLASSES: Record<SessionButtonVariant, { pressable: string; text: string }> = {
	hero: { pressable: "bg-hero", text: "text-hero-foreground" },
	primary: { pressable: "bg-primary", text: "text-primary-foreground" },
	destructive: { pressable: "bg-destructive", text: "text-destructive-foreground" },
	link: { pressable: "", text: "text-muted-foreground underline" },
}

/**
 * A full-width button at the touch target's minimum height, labeled for the screen reader.
 */
export function SessionButton({
	label,
	onPress,
	variant = "primary",
	isDisabled = false,
}: {
	label: string
	onPress: () => void
	variant?: SessionButtonVariant
	isDisabled?: boolean
}) {
	const buttonClasses = BUTTON_CLASSES[variant]
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled: isDisabled }}
			disabled={isDisabled}
			onPress={onPress}
			className={`min-h-11 flex-row items-center justify-center gap-2 rounded-lg px-4 ${buttonClasses.pressable} ${isDisabled ? "opacity-50" : ""}`}
		>
			<Text style={toTypeRoleStyle("label")} className={buttonClasses.text}>
				{label}
			</Text>
		</Pressable>
	)
}
