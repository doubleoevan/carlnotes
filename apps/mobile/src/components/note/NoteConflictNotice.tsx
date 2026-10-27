import {
	type NoteConflictNoticeProps,
	NoteConflictNotice as SharedNoteConflictNotice,
} from "@carlnotes/core/components/NoteConflictNotice"
import type { ComponentProps } from "react"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"

// match the web notice with a wrapping row and an accessible reload target
const ELEMENTS: ComponentProps<typeof SharedNoteConflictNotice>["elements"] = {
	Container: ({ children }) => (
		<View
			accessibilityRole="alert"
			className="mb-4 flex-row flex-wrap items-center gap-3 rounded-md border border-border bg-muted px-3 py-2"
		>
			{children}
		</View>
	),
	Message: ({ children }) => <Text className="min-w-0 flex-1 text-sm">{children}</Text>,
	ReloadButton: ({ children, isDisabled, onPress }) => (
		<Button accessibilityLabel="Reload note" size="sm" disabled={isDisabled} onPress={onPress}>
			<Text>{children}</Text>
		</Button>
	),
}

/**
 * Renders the shared conflict message and deliberate Reload action on mobile.
 */
export function NoteConflictNotice(props: NoteConflictNoticeProps) {
	return <SharedNoteConflictNotice {...props} elements={ELEMENTS} />
}
