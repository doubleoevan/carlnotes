import {
	type CommentMentionBadgeElements,
	CommentMentionBadge as SharedCommentMentionBadge,
} from "@carlnotes/core/components/CommentMentionBadge"
import { COMMENT_MENTIONS_TITLE } from "@carlnotes/core/lib/socialLabels"
import { useCommentMentions } from "@carlnotes/core/stores/commentMentionStore"
import { AtSign } from "lucide-react"
import { type ComponentProps, useState } from "react"
import { CountBadge } from "@/components/common/CountBadge"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { MENU_OPTION_CLASS, POPOVER_HEADING_CLASS } from "@/lib/styleClasses"
import { captureVisitEvent } from "@/lib/visitAnalytics"
import { COMMENT_MENTION_LIST_ELEMENTS, CommentMentionList } from "./CommentMentionList"

// the web's elements: the count is the trigger of a popover that holds the list. a press on the badge or inside the
// list never reaches the row or the section it sits in
const COMMENT_MENTION_BADGE_ELEMENTS: CommentMentionBadgeElements = {
	Frame: ({ count, label, isOpen, onOpenChange, children }) => (
		<Popover open={isOpen} onOpenChange={onOpenChange}>
			<PopoverTrigger
				aria-label={label}
				onClick={(event) => event.stopPropagation()}
				// the padding grows the trigger to the 24-pixel minimum target, and the negative margin keeps the count in place
				className="-m-1 shrink-0 rounded-full p-1"
			>
				<CountBadge count={count} />
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)]" bodyClassName="p-2">
				<CommentMentionListPanel>{children}</CommentMentionListPanel>
			</PopoverContent>
		</Popover>
	),
	list: COMMENT_MENTION_LIST_ELEMENTS,
}

/**
 * A place's unseen Comment Mentions on the web as one count, whose press opens the list of every unseen mention in a
 * popover.
 */
export function CommentMentionBadge(
	props: Omit<ComponentProps<typeof SharedCommentMentionBadge>, "elements" | "captureVisitEvent">,
) {
	return (
		<SharedCommentMentionBadge
			{...props}
			captureVisitEvent={captureVisitEvent}
			elements={COMMENT_MENTION_BADGE_ELEMENTS}
		/>
	)
}

/**
 * The mentions list under its title, with the close button of the popover it sits in.
 */
export function CommentMentionListPanel({ children }: { children: React.ReactNode }) {
	return (
		// a press inside the list stays in the list
		// biome-ignore lint/a11y/noStaticElementInteractions: the wrapper only stops a press from reaching the row behind it
		// biome-ignore lint/a11y/useKeyWithClickEvents: the links and the button inside take the keys
		<div onClick={(event) => event.stopPropagation()}>
			<PopoverCloseButton />
			<p className={POPOVER_HEADING_CLASS}>{COMMENT_MENTIONS_TITLE}</p>
			{children}
		</div>
	)
}

/**
 * The user menu's Mentions row, which shows while a mention waits. A press opens the list under the row, inside the
 * menu's own popover, and choosing a mention closes the menu.
 */
export function CommentMentionMenuRow({ onNavigate }: { onNavigate: () => void }) {
	const commentMentions = useCommentMentions()
	const [isOpen, setIsOpen] = useState(false)
	if (commentMentions.length === 0) {
		return null
	}

	// report each open of the list from the header's menu
	const handleToggle = (): void => {
		if (!isOpen) {
			captureVisitEvent("social_mention_badge_open", { place: "header" })
		}
		setIsOpen(!isOpen)
	}
	return (
		<>
			<button type="button" aria-expanded={isOpen} onClick={handleToggle} className={MENU_OPTION_CLASS}>
				<AtSign className="size-4" />
				<span className="flex-1">{COMMENT_MENTIONS_TITLE}</span>
				<CountBadge count={commentMentions.length} className="h-5 min-w-5 text-xs" />
			</button>
			{isOpen && (
				<div className="max-h-72 overflow-y-auto">
					<CommentMentionList onChoose={onNavigate} />
				</div>
			)}
		</>
	)
}
