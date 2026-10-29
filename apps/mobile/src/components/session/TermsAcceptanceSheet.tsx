import {
	type TermsAcceptanceElements,
	TermsAcceptanceNotice,
	useIsTermsAcceptanceDialogOpen,
} from "@carlnotes/core/components/TermsAcceptanceNotice"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"

// the sheet's elements around the shared notice. closing the sheet puts the acceptance off, as Not now does
export const TERMS_ACCEPTANCE_SHEET_ELEMENTS: TermsAcceptanceElements = {
	Root: ({ title, onClose, children }) => (
		<Sheet title={title} onClose={onClose}>
			<View className="gap-4">{children}</View>
		</Sheet>
	),
	Text: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	Links: ({ children }) => <View className="flex-row gap-4">{children}</View>,
	Link: ({ href, children }) => (
		<AnchorLink href={`${SITE_URL}${href}`} accessibilityLabel={children}>
			<Text className="text-sm text-link">{children}</Text>
		</AnchorLink>
	),
	Error: ({ children }) => <Text className="text-sm text-destructive">{children}</Text>,
	Actions: ({ children }) => <View className="flex-row justify-end gap-2">{children}</View>,
	Button: ({ label, onPress, isDisabled, isPrimary }) => (
		<Button
			variant={isPrimary ? "default" : "ghost"}
			accessibilityLabel={label}
			onPress={onPress}
			disabled={isDisabled}
		>
			<Text>{label}</Text>
		</Button>
	),
}

/**
 * Asks a signed-in user whose accepted Terms version is older than the published one to accept it, or to put it off
 * until their next post. Mounted at the root, it shows on whichever screen the session loads.
 */
export function TermsAcceptanceSheet() {
	const isNeeded = useIsTermsAcceptanceDialogOpen()
	if (!isNeeded) {
		return null
	}
	return <TermsAcceptanceNotice elements={TERMS_ACCEPTANCE_SHEET_ELEMENTS} />
}
