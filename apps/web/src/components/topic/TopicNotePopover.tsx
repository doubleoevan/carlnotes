import { authClient } from "@carlnotes/client/authClient"
import {
	TopicNotePopover as SharedTopicNotePopover,
	type TopicNotePopoverElements,
} from "@carlnotes/core/components/TopicNotePopover"
import type { ComponentProps } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Popover, PopoverCloseButton, PopoverContent } from "@/components/primitives/popover"
import { POPOVER_PANEL_CLASS, TITLE_ICON_BUTTON_CLASS } from "@/lib/styleClasses"
import { TopicInfo } from "./TopicInfo"
import { TopicNoteTrigger } from "./TopicNoteTrigger"

// the web's elements: the note icon that opens the home's Topic note popover, and the note's own content
const TOPIC_NOTE_POPOVER_ELEMENTS: TopicNotePopoverElements = {
	Frame: ({ isOpen, onOpenChange, children }) => (
		<Popover open={isOpen} onOpenChange={onOpenChange}>
			<TopicNoteTrigger className={TITLE_ICON_BUTTON_CLASS} />
			{/* a click inside the note stays in the note, and never reaches the row that opened it */}
			<PopoverContent onClick={(event) => event.stopPropagation()} align="end" className={POPOVER_PANEL_CLASS}>
				<PopoverCloseButton />
				{children}
			</PopoverContent>
		</Popover>
	),
	TopicInfo: ({ topic }) => <TopicInfo topic={topic} />,
	Unavailable: ({ children }) => <p className="text-muted-foreground text-sm">{children}</p>,
	Loading: () => <CoffeeLoading className="min-h-24 text-base" />,
}

/**
 * A Topic's note in a popover under its note icon on the web, for a row that holds only the Topic's id.
 */
export function TopicNotePopover(props: Omit<ComponentProps<typeof SharedTopicNotePopover>, "elements" | "userId">) {
	const { data: session } = authClient().useSession()
	return <SharedTopicNotePopover {...props} userId={session?.user.id ?? null} elements={TOPIC_NOTE_POPOVER_ELEMENTS} />
}
