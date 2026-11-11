// the web's section of a Topic's Topic Posts, on the topic page: the shared section in the page's collapsible
// section, with the button that starts a draft above the posts
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
	Section: ({ value, title, countLabel, action, children }) => (
		<CollapsibleSection value={value} title={title} countLabel={countLabel || undefined} isContentKept hasClosedDivider>
			{action}
			{children}
		</CollapsibleSection>
	),
	Card: TopicPostCard,
	// the Hot takes card's highlighted button. above the posts it keeps the gap between two cards below it
	NewPostButton: ({ label, isDisabled, isAboveCards, onPress }) => (
		<Button size="sm" className={cn("shrink-0", isAboveCards && "mb-4")} disabled={isDisabled} onClick={onPress}>
			<NotebookPen className="size-4" />
			{label}
		</Button>
	),
	Empty: ({ action, children }) => (
		<div className={cn(INFO_CARD_CLASS, "flex flex-wrap items-center justify-between gap-x-4 gap-y-3")}>
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
