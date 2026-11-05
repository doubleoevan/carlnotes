import { PersonalSourcesImportButton as SharedPersonalSourcesImportButton } from "@carlnotes/core/components/PersonalSourcesImportButton"
import type { PersonalSourcesImportControlProps } from "@carlnotes/core/components/TopicPersonalSources"
import { type ComponentRef, useRef } from "react"
import type { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { PersonalSourcesImportDialog } from "./PersonalSourcesImportDialog"

/**
 * Adapts the shared import opener to the mobile guidance sheet.
 */
export function PersonalSourcesImportButton(props: PersonalSourcesImportControlProps) {
	// retain the opener for screen-reader focus after the sheet closes
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	return (
		<SharedPersonalSourcesImportButton
			{...props}
			renderButton={({ label, isDisabled, onPress }) => (
				<Button
					ref={triggerRef}
					variant="outline"
					disabled={isDisabled}
					onPress={onPress}
					accessibilityLabel={label}
					className="h-auto min-h-12 max-w-full"
				>
					<Text className="shrink text-center">{label}</Text>
				</Button>
			)}
			renderDialog={(dialog) => <PersonalSourcesImportDialog {...dialog} triggerRef={triggerRef} />}
		/>
	)
}
