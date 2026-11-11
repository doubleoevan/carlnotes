import { authClient } from "@carlnotes/client/authClient"
import {
	TopicNotePopover as SharedTopicNotePopover,
	type TopicNotePopoverElements,
} from "@carlnotes/core/components/TopicNotePopover"
import type { ComponentProps } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { NoteIconButton } from "@/components/branding/NoteIconButton"
import { Sheet } from "@/components/common/Sheet"
import { Text } from "@/components/primitives/text"
import { TOPIC_NOTE_BUTTON_LABEL, TOPIC_ROAST_TITLE, TopicInfoContent } from "./TopicInfo"

// the app's elements: the note tile, which opens the Topic roast sheet in the popover's place. a phone has no
// anchored popover
const TOPIC_NOTE_POPOVER_ELEMENTS: TopicNotePopoverElements = {
	Frame: ({ isOpen, onOpenChange, children }) => (
		<>
			<NoteIconButton
				label={TOPIC_NOTE_BUTTON_LABEL}
				hint="A topic note from Carl"
				isOpen={isOpen}
				onPress={() => onOpenChange(true)}
			/>
			{isOpen ? (
				<Sheet title={TOPIC_ROAST_TITLE} onClose={() => onOpenChange(false)}>
					{children}
				</Sheet>
			) : null}
		</>
	),
	TopicInfo: ({ topic, onClose }) => <TopicInfoContent topic={topic} onClose={onClose} />,
	Unavailable: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	Loading: () => <CoffeeLoading className="py-16" />,
}

/**
 * A Topic's note in a sheet under its note icon in the app, for a row that holds only the Topic's id.
 */
export function TopicNotePopover(props: Omit<ComponentProps<typeof SharedTopicNotePopover>, "elements" | "userId">) {
	const { data: session } = authClient().useSession()
	return <SharedTopicNotePopover {...props} userId={session?.user.id ?? null} elements={TOPIC_NOTE_POPOVER_ELEMENTS} />
}
