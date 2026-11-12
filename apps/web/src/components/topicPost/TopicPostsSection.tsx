// the web's section of a Topic's Topic Posts, on the topic page: the shared section in the page's collapsible
// section, in a card like the comment thread's with the button that starts a draft above the Topic Posts, and the page
// buttons under the card as in the scan history
import { createTopicPostDraft } from "@carlnotes/client/topicPostClient"
import type { TopicPostsResponse } from "@carlnotes/contracts/topicPosts"
import {
	TopicPostsSection as SharedTopicPostsSection,
	type TopicPostsSectionElements,
} from "@carlnotes/core/components/TopicPostsSection"
import { TOPIC_POST_LABELS, toTopicPostFailureMessage } from "@carlnotes/core/lib/topicPosts"
import { cn } from "@carlnotes/nightshift/classNames"
import { useNavigate } from "@tanstack/react-router"
import { NotebookPen } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { CARDS_SECTION_ELEMENTS } from "@/components/common/CardsSection"
import { Button } from "@/components/primitives/button"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { INFO_CARD_CLASS } from "@/lib/styleClasses"
import { TopicPostCard } from "./TopicPostCard"

/**
 * The web's elements. The section keeps its content in the html while closed, so a crawler reads every card.
 */
export const TOPIC_POSTS_SECTION_ELEMENTS: TopicPostsSectionElements = {
	...CARDS_SECTION_ELEMENTS,
	Section: ({ value, title, countLabel, action, pageButtons, children }) => (
		<CollapsibleSection value={value} title={title} countLabel={countLabel || undefined} isContentKept hasClosedDivider>
			<div className={cn(INFO_CARD_CLASS, "flex flex-col gap-4")}>
				{action}
				{children}
			</div>
			{pageButtons}
		</CollapsibleSection>
	),
	Card: TopicPostCard,
	// the highlighted button, as in the comment thread's card
	NewPostButton: ({ label, isDisabled, onPress }) => (
		<Button size="sm" className="shrink-0 self-start" disabled={isDisabled} onClick={onPress}>
			<NotebookPen className="size-4" />
			{label}
		</Button>
	),
	Empty: ({ action, children }) => (
		<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
			{action}
			<p className="text-muted-foreground">{children}</p>
		</div>
	),
}

/**
 * A Topic's Open Mic section on the topic page. The button creates a draft and opens its editor.
 */
export function TopicPostsSection({ topicId, topicPosts, canPublish }: TopicPostsResponse & { topicId: string }) {
	const navigate = useNavigate()
	const [isCreating, setIsCreating] = useState(false)

	// create the draft, then open its page, which shows its author the editor
	const handleNewPost = async (): Promise<void> => {
		setIsCreating(true)
		const topicPostWriteResult = await createTopicPostDraft(topicId)
		setIsCreating(false)
		if (topicPostWriteResult.status === "saved") {
			void navigate({ to: topicPostWriteResult.topicPost.path })
		} else {
			toast.error(toTopicPostFailureMessage(topicPostWriteResult, TOPIC_POST_LABELS.createError))
		}
	}
	return (
		<SharedTopicPostsSection
			topicPosts={topicPosts}
			canPublish={canPublish}
			isCreating={isCreating}
			onNewPost={() => void handleNewPost()}
			elements={TOPIC_POSTS_SECTION_ELEMENTS}
		/>
	)
}
