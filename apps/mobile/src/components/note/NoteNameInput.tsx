import { NOTE_NAME_MAX_CHARS } from "@carlnotes/contracts/notes"
import { Pencil } from "lucide-react-native"
import { type ComponentRef, useRef } from "react"
import { TextInput, View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * Renders an editor's note name as a centered title field, with a pencil that focuses it and hides while it is edited.
 */
export function NoteNameInput({
	name,
	isFocused,
	isDisabled,
	isPencilShown,
	onNameChange,
	onFocusChange,
	onRename,
}: {
	name: string
	isFocused: boolean
	isDisabled: boolean
	// false offline, when the name cannot be saved
	isPencilShown: boolean
	onNameChange: (name: string) => void
	onFocusChange: (isFocused: boolean) => void
	onRename: () => void
}) {
	const nameInputRef = useRef<ComponentRef<typeof TextInput>>(null)
	return (
		<View className="relative justify-center">
			<TextInput
				ref={nameInputRef}
				accessibilityLabel="Note name"
				value={name}
				onChangeText={onNameChange}
				onFocus={() => onFocusChange(true)}
				onBlur={() => {
					// restore the edit cue after committing the title
					onFocusChange(false)
					onRename()
				}}
				onSubmitEditing={onRename}
				editable={!isDisabled}
				maxLength={NOTE_NAME_MAX_CHARS}
				style={toTypeRoleStyle("pageTitle")}
				className="min-h-12 px-12 text-center text-foreground"
			/>
			{!isFocused && isPencilShown && (
				<Button
					accessibilityLabel="Edit note name"
					variant="ghost"
					size="icon"
					className="absolute right-0"
					disabled={isDisabled}
					onPress={() => nameInputRef.current?.focus()}
				>
					<Icon as={Pencil} className="size-4 text-foreground" />
				</Button>
			)}
		</View>
	)
}
