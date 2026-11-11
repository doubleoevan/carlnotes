// the app's section of a Topic's Topic Posts, on the topic screen: the shared section in the screen's collapsible
// section, with the button that starts a draft above the posts
import { showClientError } from "@carlnotes/client/apiClient"
import { createTopicPostDraft } from "@carlnotes/client/topicPostClient"
import type { TopicPostsResponse } from "@carlnotes/contracts/topicPosts"
import {
	TopicPostsSection as SharedTopicPostsSection,
	type TopicPostsSectionElements,
} from "@carlnotes/core/components/TopicPostsSection"
import { TOPIC_POST_LABELS, toTopicPostFailureMessage } from "@carlnotes/core/lib/topicPosts"
import { router } from "expo-router"
import { NotebookPen } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { CARDS_SECTION_ELEMENTS } from "@/components/common/CardsSection"
import { Pagination } from "@/components/common/Pagination"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { toPlatformPath } from "@/platformPath"
import { TopicPostCard } from "./TopicPostCard"

// the app's elements. the cards stack in one column, and a card off the page shown is not rendered
const ELEMENTS: TopicPostsSectionElements = {
	...CARDS_SECTION_ELEMENTS,
	Section: ({ title, countLabel, action, children }) => (
		<CollapsibleSection title={title} countLabel={countLabel || undefined} hasClosedDivider>
			{action}
			{children}
		</CollapsibleSection>
	),
	// the topic screen's column is already inset, so the cards and the page buttons add no margin of their own
	Grid: ({ children }) => <View className="gap-3 pt-2 pb-2">{children}</View>,
	Pagination: ({ label, pageNumber, pageCount, onOpenPage }) => (
		<View className="pt-1 pb-2">
			<Pagination label={label} pageNumber={pageNumber} pageCount={pageCount} onOpenPage={onOpenPage} />
		</View>
	),
	Card: TopicPostCard,
	// the Hot takes card's highlighted button. above the posts it keeps the gap between two cards below it
	NewPostButton: ({ label, isDisabled, isAboveCards, onPress }) => (
		<Button
			size="sm"
			accessibilityLabel={label}
			disabled={isDisabled}
			onPress={onPress}
			className={isAboveCards ? "mb-4 self-start" : undefined}
		>
			<Icon as={NotebookPen} className="size-4" />
			<Text>{label}</Text>
		</Button>
	),
	// the Hot takes card, with the button at the left and the line at the far right
	Empty: ({ action, children }) => (
		<View className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border border-separator bg-card p-5 shadow-raised">
			{action}
			<Text className="text-sm text-muted-foreground">{children}</Text>
		</View>
	),
}

/**
 * A Topic's Topic Posts section on the topic screen. The button creates a draft and opens its editor.
 */
export function TopicPostsSection({ topicId, topicPosts, canPublish }: TopicPostsResponse & { topicId: string }) {
	const [isCreating, setIsCreating] = useState(false)

	// create the draft, then open its screen, which shows its author the editor
	const handleNewPost = async (): Promise<void> => {
		setIsCreating(true)
		const topicPostWriteResult = await createTopicPostDraft(topicId)
		setIsCreating(false)
		if (topicPostWriteResult.status === "saved") {
			router.push(toPlatformPath(topicPostWriteResult.topicPost.path))
		} else {
			showClientError(toTopicPostFailureMessage(topicPostWriteResult, TOPIC_POST_LABELS.createError))
		}
	}
	return (
		<SharedTopicPostsSection
			topicPosts={topicPosts}
			canPublish={canPublish}
			isCreating={isCreating}
			onNewPost={() => void handleNewPost()}
			elements={ELEMENTS}
		/>
	)
}
