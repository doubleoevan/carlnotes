import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { ComponentType, ReactNode } from "react"
import { useTopicNote } from "../hooks/useTopicNote"

// what the note reads as for a Topic that is gone or that the reader may not open
const TOPIC_NOTE_UNAVAILABLE_TEXT = "Carl couldn't open this topic's note."

// the platform elements of a row's Topic note: the note icon with what it opens, a popover on the web and a sheet in
// the app, the Topic's note itself, which closes the note on a press of its link to the Topic's page, the line an
// unavailable Topic shows, and the placeholder while the Topic loads
export type TopicNotePopoverElements = {
	Frame: ComponentType<{ isOpen: boolean; onOpenChange: (isOpen: boolean) => void; children: ReactNode }>
	TopicInfo: ComponentType<{ topic: TopicResponse; onClose: () => void }>
	Unavailable: ComponentType<{ children: ReactNode }>
	Loading: ComponentType
}

/**
 * A Topic's note under its note icon, for a row that holds only the Topic's id. The Topic loads once the note opens.
 * The row around it opens the note too, through isOpen and onOpenChange.
 */
export function TopicNotePopover({
	topicId,
	userId,
	isOpen,
	onOpenChange,
	elements: { Frame, TopicInfo, Unavailable, Loading },
}: {
	topicId: string
	// who reads the note, or null for a visitor
	userId: string | null
	isOpen: boolean
	onOpenChange: (isOpen: boolean) => void
	elements: TopicNotePopoverElements
}) {
	const { topic, isUnavailable } = useTopicNote({ topicId, userId, isOpen })
	return (
		<Frame isOpen={isOpen} onOpenChange={onOpenChange}>
			{topic ? (
				<TopicInfo topic={topic} onClose={() => onOpenChange(false)} />
			) : isUnavailable ? (
				<Unavailable>{TOPIC_NOTE_UNAVAILABLE_TEXT}</Unavailable>
			) : (
				<Loading />
			)}
		</Frame>
	)
}
