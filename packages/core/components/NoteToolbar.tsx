import { type ComponentType, Fragment, type PropsWithChildren, type RefObject } from "react"
import {
	NOTE_FORMAT_GROUPS,
	type NoteEditorCommands,
	type NoteFormatKey,
	type NoteFormatState,
	type NoteLink,
	type NoteSelection,
} from "../lib/noteFormats"

// the platform controls keep focus, tooltips, and native touch targets local
export type NoteToolbarButtonProps = {
	label: string
	stateKey: NoteFormatKey
	isPressed: boolean
	isDisabled: boolean
	onPress: () => void
}
export type NoteLinkControlProps = {
	editorRef: RefObject<NoteEditorCommands | null>
	isLinkActive: boolean
	isLinkBlocked: boolean
	selection: NoteSelection
	activeLink: NoteLink | null
}
export type NoteToolbarProps = {
	editorRef: RefObject<NoteEditorCommands | null>
	formatState: NoteFormatState | null
	selection: NoteSelection
	activeLink: NoteLink | null
}
type NoteToolbarElements = {
	Container: ComponentType<PropsWithChildren>
	Divider: ComponentType
	Button: ComponentType<NoteToolbarButtonProps>
	LinkControl: ComponentType<NoteLinkControlProps>
}

/**
 * Composes both note toolbars from the same ordered formats and editor state.
 */
export function NoteToolbar({
	editorRef,
	formatState,
	selection,
	activeLink,
	elements,
}: NoteToolbarProps & { elements: NoteToolbarElements }) {
	const { Container, Divider, Button, LinkControl } = elements
	return (
		<Container>
			{/* the ordered format groups and their selected states */}
			{NOTE_FORMAT_GROUPS.map((group, i) => (
				<Fragment key={group[0]?.stateKey}>
					{i > 0 && <Divider />}
					{group.map((format) => (
						<Button
							key={format.stateKey}
							label={format.label}
							stateKey={format.stateKey}
							isPressed={formatState?.[format.stateKey]?.isActive ?? false}
							isDisabled={formatState?.[format.stateKey]?.isBlocking ?? false}
							onPress={() => editorRef.current && format.toggle(editorRef.current)}
						/>
					))}
				</Fragment>
			))}
			{/* link editing follows the format controls */}
			<Divider />
			<LinkControl
				editorRef={editorRef}
				selection={selection}
				activeLink={activeLink}
				isLinkActive={formatState?.link?.isActive ?? false}
				isLinkBlocked={formatState?.link?.isBlocking ?? false}
			/>
		</Container>
	)
}
