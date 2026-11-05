import {
	type PersonalSourcesImportDialogElements,
	type PersonalSourcesImportDialogProps,
	PersonalSourcesImportDialog as SharedPersonalSourcesImportDialog,
} from "@carlnotes/core/components/PersonalSourcesImportDialog"
import { type ComponentRef, type RefObject, useEffect } from "react"
import { AccessibilityInfo, findNodeHandle, View } from "react-native"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"

/**
 * Renders the shared guidance without a browser file parser or upload control.
 */
export function PersonalSourcesImportDialog({
	triggerRef,
	...props
}: PersonalSourcesImportDialogProps & { triggerRef?: RefObject<ComponentRef<typeof View> | null> }) {
	// restore the native opener after the shared dialog unmounts
	useEffect(
		() => () => {
			const trigger = triggerRef?.current && findNodeHandle(triggerRef.current)
			if (trigger) {
				AccessibilityInfo.setAccessibilityFocus(trigger)
			}
		},
		[triggerRef],
	)
	return <SharedPersonalSourcesImportDialog {...props} elements={ELEMENTS} />
}

// native presentation supplies touch controls and the existing focus-managed sheet
const ELEMENTS: PersonalSourcesImportDialogElements = {
	Group: ({ children, className }) => <View className={className}>{children}</View>,
	Text: ({ children, className }) => <Text className={className}>{children}</Text>,
	Status: ({ children, isError }) => (
		<Text accessibilityLiveRegion="polite" className={isError ? "text-sm text-destructive" : undefined}>
			{children}
		</Text>
	),
	Button: ({ label, isDisabled, onPress, variant = "outline" }) => (
		<Button variant={variant} disabled={isDisabled} onPress={onPress} accessibilityLabel={label}>
			<Text>{label}</Text>
		</Button>
	),
	Dialog: ({ title, description, children, onClose }) => (
		<Sheet title={title} onClose={onClose}>
			<View className="gap-3">
				<Text className="text-sm text-muted-foreground">{description}</Text>
				{children}
			</View>
		</Sheet>
	),
}
