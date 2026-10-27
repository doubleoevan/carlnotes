import { showClientError } from "@carlnotes/client/apiClient"
import { NOTE_NAME_MAX_CHARS, type NoteResponse, type NoteVisibility } from "@carlnotes/contracts/notes"
import { useNoteManagement } from "@carlnotes/core/hooks/useNoteManagement"
import { NOTE_DELETE, toNoteDeleteDescription } from "@carlnotes/core/lib/noteLabels"
import { Pencil } from "lucide-react-native"
import { useState } from "react"
import { Alert, TextInput, View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { NoteVisibilitySelect } from "./NoteVisibilitySelect"

/**
 * Uses the web's fresh permission fields for rename, visibility and confirmed deletion.
 */
export function NoteManagement({
	note,
	visibilities,
	isOffline,
	onChanged,
	onDeleted,
}: {
	note: NoteResponse
	visibilities: NoteVisibility[]
	isOffline: boolean
	onChanged: (changes: Partial<Pick<NoteResponse, "name" | "visibility">>) => void
	onDeleted: () => Promise<void>
}) {
	const { name, setName, savedName, visibility, isPending, rename, changeVisibility, remove } = useNoteManagement({
		note,
		isOffline,
		onChanged,
		onDeleted,
		onError: showClientError,
	})
	const [isNameFocused, setIsNameFocused] = useState(false)

	return (
		<View className="gap-2 pb-3">
			<View className="flex-row items-center justify-between gap-3">
				{note.isNoteOwner && !isOffline ? (
					<NoteVisibilitySelect
						visibilities={visibilities}
						visibility={visibility}
						onNoteVisibilityChange={(next) => void changeVisibility(next)}
					/>
				) : (
					<NoteVisibilitySelect visibilities={[visibility]} visibility={visibility} onNoteVisibilityChange={() => {}} />
				)}
				{note.canDelete && (
					<Button
						accessibilityLabel="Delete note"
						variant="destructive"
						size="sm"
						disabled={isOffline || isPending}
						onPress={() =>
							Alert.alert(NOTE_DELETE.title, toNoteDeleteDescription(savedName), [
								{ text: NOTE_DELETE.cancelLabel, style: "cancel" },
								{ text: NOTE_DELETE.confirmLabel, style: "destructive", onPress: () => void remove() },
							])
						}
					>
						<Text>Delete</Text>
					</Button>
				)}
			</View>
			{note.canEdit ? (
				<View className="relative justify-center">
					<TextInput
						accessibilityLabel="Note name"
						value={name}
						onChangeText={setName}
						onFocus={() => setIsNameFocused(true)}
						onBlur={() => {
							// restore the edit cue after committing the title
							setIsNameFocused(false)
							void rename()
						}}
						onSubmitEditing={() => void rename()}
						editable={!isOffline && !isPending}
						maxLength={NOTE_NAME_MAX_CHARS}
						style={toTypeRoleStyle("pageTitle")}
						className="min-h-12 px-8 text-center text-foreground"
					/>
					{!isNameFocused && !isOffline && (
						<View pointerEvents="none" className="absolute right-2">
							<Icon as={Pencil} className="size-4 text-muted-foreground" />
						</View>
					)}
				</View>
			) : (
				<Text accessibilityRole="header" className="text-center" style={toTypeRoleStyle("pageTitle")}>
					{note.name}
				</Text>
			)}
		</View>
	)
}
