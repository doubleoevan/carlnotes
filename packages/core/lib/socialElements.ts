// the platform elements that the reaction row and the comment thread render through, one set per app
import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import type { ReactionType } from "@carlnotes/contracts/social"
import type { ComponentType, PropsWithChildren } from "react"
import type { TextComposerElementProps } from "../components/TextComposer"
import type { ConfirmElementProps } from "./confirmElement"

// one reaction type in the picker: its label, how many chose it, the newest of them, the label counting the rest, and
// whether the user did
export type ReactionOptionProps = {
	reactionType: ReactionType
	label: string
	count: number
	users: ProfileIdentity[]
	moreUsersLabel: string | null
	isOwn: boolean
	// a press saves the type, unless the option is disabled
	isDisabled: boolean
	onPress: () => void
}

// one chapter a comment on a Podcast Episode can name
export type CommentChapter = { position: number; title: string }

// the composer's share switch: its label, its state, and what a press does
export type ComposerShareSwitchProps = {
	label: string
	isChecked: boolean
	// why the switch is disabled, which it shows on hover on the web and on a press on mobile
	disabledReason?: string
	onChange: (isChecked: boolean) => void
}

// the elements both components share: the list and its rows, each row's parts and controls, and the composer with
// the frame it opens in
export type SocialElements = {
	Container: ComponentType<PropsWithChildren>
	Message: ComponentType<PropsWithChildren>
	Loading: ComponentType
	List: ComponentType<PropsWithChildren>
	Row: ComponentType<PropsWithChildren>
	Header: ComponentType<PropsWithChildren>
	// a row's author with a link to their profile, or Carl for no author
	Author: ComponentType<{ author: ProfileIdentity | null }>
	Age: ComponentType<PropsWithChildren>
	// a super long body scrolls inside its own box
	Body: ComponentType<PropsWithChildren<{ isScrolling?: boolean }>>
	// a comment's replies, indented under it
	Replies: ComponentType<PropsWithChildren>
	// the flame that says a comment is shared with Carl, and the mugs once a Podcast Episode read it. a user who may
	// share presses it, and it is disabled while the Topic has no free shared comment slot. anyone else sees it on a
	// shared comment, with no press
	ShareToggle: ComponentType<{
		label: string
		isShared: boolean
		isAired: boolean
		isDisabled: boolean
		onPress?: () => void
	}>
	// a row's controls under its body: the share toggle, a pencil, a trash can, a flag of someone else's, and the reply
	// button last. a disabled control says why
	Controls: ComponentType<PropsWithChildren>
	RowControl: ComponentType<{
		kind: "edit" | "delete"
		label: string
		disabledReason?: string
		onPress: () => void
	}>
	// the reply button and the report flag
	ReplyButton: ComponentType<{ label: string; onPress: () => void }>
	Report: ComponentType<{ label: string; isReported: boolean; onPress: () => void }>
	// the buttons that show more of a thread
	More: ComponentType<{ label: string; onPress: () => void }>
	MoreToggle: ComponentType<{ isExpanded: boolean; moreLabel: string; onToggle: () => void }>
	// the confirmation a delete opens
	Confirm: ComponentType<ConfirmElementProps>
	// the button that opens the composer, the frame it opens in, and the composer itself. the frame is a dialog on the
	// web and a bottom sheet on mobile
	ComposerRow: ComponentType<PropsWithChildren>
	SharedCommentSlotsLabel: ComponentType<PropsWithChildren<{ tooltip: string }>>
	ComposerButton: ComponentType<{ label: string; onPress: () => void }>
	ComposerFrame: ComponentType<PropsWithChildren<{ title: string; onClose: () => void }>>
	Composer: ComponentType<TextComposerElementProps>
	// the switch at the composer's bottom left that shares the comment with Carl, for a user who may share
	ComposerShareSwitch: ComponentType<ComposerShareSwitchProps>
	// the reaction picker's group and each of its options
	ReactionGroup: ComponentType<PropsWithChildren>
	ReactionOption: ComponentType<ReactionOptionProps>
	// a thread's own parts: a mention's link, a chapter's tag, and the choice of a chapter in the composer
	Mention: ComponentType<PropsWithChildren<{ userId: string }>>
	ChapterTag: ComponentType<{ chapter: CommentChapter; onPress: () => void }>
	// the composer's choice of a chapter, or of the whole podcast episode
	ChapterSelect: ComponentType<{
		chapters: CommentChapter[]
		chapterPosition: number | null
		onChange: (chapterPosition: number | null) => void
	}>
}

// the comment parts that the note thread and the comment thread render one way, one set per app to spread into each
// thread's elements
export type CommentElements = Pick<SocialElements, "Message" | "List" | "Row" | "Age" | "Body" | "Composer">
