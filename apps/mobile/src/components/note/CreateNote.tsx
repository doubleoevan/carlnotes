import { showClientError } from "@carlnotes/client/apiClient"
import {
	type CreateNoteElements,
	type CreateNoteProps,
	CreateNote as SharedCreateNote,
} from "@carlnotes/core/components/CreateNote"
import { BottomSheetTextInput } from "@gorhom/bottom-sheet"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { NoteVisibilitySelect } from "./NoteVisibilitySelect"

// the surrounding Sheet supplies the title and keyboard-aware scrolling
const ELEMENTS: CreateNoteElements = {
	Title: () => null,
	Fields: ({ children }) => <View className="gap-3">{children}</View>,
	NameInput: ({ value, onChange, maxLength, label, placeholder }) => (
		<BottomSheetTextInput
			accessibilityLabel={label}
			value={value}
			onChangeText={onChange}
			maxLength={maxLength}
			placeholder={placeholder}
			style={toTypeRoleStyle("bodyLarge")}
			className="min-h-12 rounded-md border border-input bg-card px-3 py-2 text-foreground"
		/>
	),
	VisibilityRow: ({ children }) => <View className="flex-row flex-wrap items-center gap-3">{children}</View>,
	VisibilitySelect: NoteVisibilitySelect,
	Description: ({ children }) => <Text className="flex-1 text-sm text-muted-foreground">{children}</Text>,
	Submit: ({ children, isDisabled, onPress }) => (
		<Button accessibilityLabel="Add note" disabled={isDisabled} onPress={onPress} className="mt-4 self-end">
			<Text>{children}</Text>
		</Button>
	),
}

/**
 * Uses the web's shared creation form inside a native sheet.
 */
export function CreateNote(props: Omit<CreateNoteProps, "onError">) {
	return <SharedCreateNote {...props} onError={showClientError} elements={ELEMENTS} />
}
