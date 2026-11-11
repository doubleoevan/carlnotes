import type { ComponentType, PropsWithChildren } from "react"

export type NoteConflictNoticeProps = {
	// what the notice says instead of naming the last editor
	message?: string
	lastEditorUsername: string | null
	isReloading: boolean
	onReload: () => void
}

/**
 * Keeps the conflicting draft visible until the reader deliberately reloads the stored note.
 */
export function NoteConflictNotice({
	message,
	lastEditorUsername,
	isReloading,
	onReload,
	elements: { Container, Message, ReloadButton },
}: NoteConflictNoticeProps & {
	elements: {
		Container: ComponentType<PropsWithChildren>
		Message: ComponentType<PropsWithChildren>
		ReloadButton: ComponentType<PropsWithChildren<{ isDisabled: boolean; onPress: () => void }>>
	}
}) {
	// name the last editor without exposing a closed account
	const editorLabel = lastEditorUsername ? `@${lastEditorUsername}` : "someone else"
	return (
		<Container>
			<Message>
				{message ?? `Saved by ${editorLabel} since you opened it. Copy anything you want to keep, then reload.`}
			</Message>
			<ReloadButton isDisabled={isReloading} onPress={onReload}>
				{isReloading ? "Reloading…" : "Reload"}
			</ReloadButton>
		</Container>
	)
}
