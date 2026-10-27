import { createNote, type NotePageRef } from "@carlnotes/client/noteClient"
import { NOTE_NAME_MAX_CHARS, type Note, type NoteVisibility } from "@carlnotes/contracts/notes"
import { type ComponentType, type PropsWithChildren, useRef, useState } from "react"
import { NOTE_LABELS, NOTE_VISIBILITY_DESCRIPTIONS } from "../lib/noteLabels"

export type CreateNoteProps = {
	page: NotePageRef
	creatableVisibilities: NoteVisibility[]
	onCreated: (note: Note) => void
	onError: (message: string) => void
	isDisabled?: boolean
}
export type NoteNameInputProps = {
	value: string
	onChange: (name: string) => void
	maxLength: number
	label: string
	placeholder: string
}
export type NoteVisibilitySelectProps = {
	visibilities: NoteVisibility[]
	visibility: NoteVisibility
	onNoteVisibilityChange: (visibility: NoteVisibility) => void
}
export type CreateNoteElements = {
	Title: ComponentType<PropsWithChildren>
	Fields: ComponentType<PropsWithChildren>
	NameInput: ComponentType<NoteNameInputProps>
	VisibilityRow: ComponentType<PropsWithChildren>
	VisibilitySelect: ComponentType<NoteVisibilitySelectProps>
	Description: ComponentType<PropsWithChildren>
	Submit: ComponentType<PropsWithChildren<{ isDisabled: boolean; onPress: () => void }>>
}

/**
 * Shares note creation, permission-derived choices, validation and pending state across clients.
 */
export function CreateNote({
	page,
	creatableVisibilities,
	onCreated,
	onError,
	isDisabled = false,
	elements: { Title, Fields, NameInput, VisibilityRow, VisibilitySelect, Description, Submit },
}: CreateNoteProps & { elements: CreateNoteElements }) {
	// prefer team visibility when offered and never invent a permission
	const [name, setName] = useState("")
	const [visibility, setVisibility] = useState<NoteVisibility>(
		creatableVisibilities.includes("team") ? "team" : (creatableVisibilities[0] ?? "private"),
	)
	const [isPending, setIsPending] = useState(false)
	const isPendingRef = useRef(false)
	const canCreate =
		!isDisabled &&
		name.trim().length > 0 &&
		name.trim().length <= NOTE_NAME_MAX_CHARS &&
		creatableVisibilities.includes(visibility)

	// retain both fields when the request fails and prevent repeated submissions before React paints
	async function handleCreate(): Promise<void> {
		if (!canCreate || isPendingRef.current) {
			return
		}
		isPendingRef.current = true
		setIsPending(true)
		try {
			const createdNote = await createNote(page, name.trim(), visibility)
			if (createdNote) {
				onCreated(createdNote)
			} else {
				onError(NOTE_LABELS.createError)
			}
		} catch {
			onError(NOTE_LABELS.createError)
		} finally {
			isPendingRef.current = false
			setIsPending(false)
		}
	}

	return (
		<>
			<Title>New note</Title>
			<Fields>
				<NameInput
					value={name}
					onChange={setName}
					maxLength={NOTE_NAME_MAX_CHARS}
					label="Note name"
					placeholder="Name your note"
				/>
				<VisibilityRow>
					<VisibilitySelect
						visibilities={creatableVisibilities}
						visibility={visibility}
						onNoteVisibilityChange={setVisibility}
					/>
					<Description>{NOTE_VISIBILITY_DESCRIPTIONS[visibility]}</Description>
				</VisibilityRow>
			</Fields>
			<Submit isDisabled={!canCreate || isPending} onPress={() => void handleCreate()}>
				{isPending ? "Adding…" : "Add note"}
			</Submit>
		</>
	)
}
