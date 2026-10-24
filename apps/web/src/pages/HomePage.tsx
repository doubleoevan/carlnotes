import { authClient } from "@carlnotes/client/authClient"
import type { TopicFeedResponse } from "@carlnotes/contracts/topics"
import { useNavigate } from "@tanstack/react-router"
import { Coffee } from "lucide-react"
import { useState } from "react"
import { Accordion } from "@/components/primitives/accordion"
import { toSignupNavigation } from "@/components/session/signupPrompts"
import { TagsAndNewTopicRow } from "@/components/topic/TagsAndNewTopicRow"
import { TopicFeedSkeleton } from "@/components/topic/TopicFeedSkeleton"
import { TopicSection } from "@/components/topic/TopicSection"
import { PAGE_CLASS } from "@/lib/styleClasses"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { openNewTopicChat, useRegisterChatContext } from "@/stores/chatPanelStore"
import { useRegisterPageActions } from "@/stores/pageActionsStore"

/**
 * Renders the homepage: the tag picker, the New Topic button, and the topic feed sections.
 */
export function HomePage() {
	const navigate = useNavigate()
	// whether a user is signed in or a visitor is browsing
	const { data: session } = authClient().useSession()
	const isSignedIn = Boolean(session)
	// the shared feed state: the sections, the finding, resource, and tag filters, and the reheat
	const {
		topicFeed,
		findingFilter,
		sort,
		resourceKinds,
		tagFilters,
		setTagFilters,
		tagMatchMode,
		reheat,
		reheatKey,
		isReheating,
	} = useTopicFeed()
	// the section the user opened, or null while none has been opened and the default still applies
	const [openedSection, setOpenedSection] = useState<string | null>(null)

	// the search bar's menu includes this page's reheat option, and leaves out New topic
	useRegisterPageActions({
		page: "Home",
		options: [{ label: "Reheat", Icon: Coffee, onSelect: () => void reheat() }],
		hasNewTopicButton: true,
	})

	// the panel's page context. the new-topic chat opens by default for a user who owns and follows no topics
	const ownTopicCount = toSectionTopicCount(topicFeed, "yours")
	const followedTopicCount = toSectionTopicCount(topicFeed, "subscribed")
	useRegisterChatContext(
		isSignedIn && topicFeed
			? {
					topicId: null,
					teamId: null,
					name: "a new topic",
					joinTeam: null,
					isUserTopicFeedEmpty: ownTopicCount === 0 && followedTopicCount === 0,
				}
			: null,
	)

	// the "Give Carl a topic" button opens the new-topic chat, and sends a visitor to sign up first
	const handleNewTopicChat = (): void => {
		if (isSignedIn) {
			openNewTopicChat()
		} else {
			navigate(toSignupNavigation("new-topic"))
		}
	}

	// the remount key changes on a reheat or any filter change so that the updated content animates in
	const resourceKindsKey = [...resourceKinds].sort().join()
	const tagFiltersKey = [...tagFilters].sort().join("|")
	const viewKey = [reheatKey, findingFilter, sort, resourceKindsKey, tagMatchMode, tagFiltersKey, isSignedIn].join("-")
	// the section that opens first
	const defaultOpenSection = toDefaultOpenSection(isSignedIn, ownTopicCount, followedTopicCount)
	const openSection = openedSection ?? defaultOpenSection
	return (
		<main className={PAGE_CLASS}>
			{/* the page's heading for a signed-in user, who gets the compact banner instead of the hero and its h1 */}
			{isSignedIn && <h1 className="sr-only">Your topics</h1>}
			{/* the Tags picker to the left and the New Topic button to the right */}
			<TagsAndNewTopicRow tags={tagFilters} onTagsChange={setTagFilters} />

			{/* the sections clear the New Topic button above them */}
			<div className="mt-4">
				{/* skeleton animation while loading and reheating */}
				{(topicFeed === null || isReheating) && <TopicFeedSkeleton />}

				{/*
				the topic sections with a viewKey prop so that any change replays the hydrate animation.
				opening one section closes the others. the collapsible prop lets the current open one close too.
				the first section's header drops the top padding
			*/}
				{topicFeed && !isReheating && (
					<Accordion
						key={viewKey}
						type="single"
						collapsible
						value={openSection}
						onValueChange={setOpenedSection}
						className="[&>*:first-child_[data-slot=accordion-trigger]]:pt-0"
					>
						{topicFeed.sections.map((section) => (
							<TopicSection key={section.key} section={section} onNewTopicChat={handleNewTopicChat} />
						))}
					</Accordion>
				)}
			</div>
		</main>
	)
}

// how many topics a section of the feed has, or null while the feed is still loading
function toSectionTopicCount(topicFeed: TopicFeedResponse | null, sectionKey: string): number | null {
	return topicFeed?.sections.find((section) => section.key === sectionKey)?.topics.length ?? null
}

// which section opens first: featured for a visitor, else the user's own topics, else the ones they follow
function toDefaultOpenSection(
	isSignedIn: boolean,
	ownTopicCount: number | null,
	followedTopicCount: number | null,
): string {
	if (!isSignedIn) {
		return "featured"
	}
	return ownTopicCount === 0 && (followedTopicCount ?? 0) > 0 ? "subscribed" : "yours"
}
