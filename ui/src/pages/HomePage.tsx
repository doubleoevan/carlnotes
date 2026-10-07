import type { TopicFeedResponse } from "@shared/contracts"
import { ADMIN_QUOTA } from "@shared/plans"
import { useNavigate } from "@tanstack/react-router"
import { Coffee, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { authClient } from "@/clients/authClient"
import { Accordion } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TagPicker } from "@/components/topic/TagPicker"
import { useNewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"
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
	const { data: session } = authClient.useSession()
	const isSignedIn = Boolean(session)
	// the shared feed state: the sections, the finding and resource filters, and the topic-creation quota
	const {
		topicFeed,
		findingFilter,
		sort,
		resourceKinds,
		tagFilters,
		setTagFilters,
		tagMatchMode,
		knownTags,
		reloadTopicFeed,
		reheat,
		reheatKey,
		isReheating,
	} = useTopicFeed()
	// the New Topic button's dialog. a created topic reloads the topic feed behind the navigation
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog(() => void reloadTopicFeed())
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
			navigate({ to: "/signup", search: { cta: "new-topic" } })
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
			{/* the Tags link with its pills and "+" to the left, the "+ New Topic" block to the right,
				wrapping onto a second line when the screen is too narrow. */}
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex min-w-0 flex-wrap items-center gap-1.5">
					<TagPicker tags={tagFilters} knownTags={knownTags} openPickerLabel="Tags:" onTagsChange={setTagFilters} />
				</div>
				<NewTopicRow
					remainingTopics={topicFeed?.topicsRemaining ?? null}
					topicLimit={topicFeed?.topicLimit ?? null}
					isSignedIn={isSignedIn}
					onNewTopic={openNewTopicDialog}
				/>
			</div>

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
			{/* the dialog that the New Topic button opens */}
			{newTopicDialog}
		</main>
	)
}

// the "+ New Topic" button and remaining topic quota
function NewTopicRow({
	remainingTopics,
	topicLimit,
	isSignedIn,
	onNewTopic,
}: {
	remainingTopics: number | null
	// the plan's topic limit, or null while the feed loads
	topicLimit: number | null
	isSignedIn: boolean
	onNewTopic: () => void
}) {
	const navigate = useNavigate()

	// a logged-out visitor is shown a sign-up button, and a user at their limit is told so instead of meeting a dead button
	const isAtLimit = isSignedIn && remainingTopics !== null && remainingTopics <= 0
	const limitLine = `That's all ${topicLimit ?? 0} topics. Carl needs a little pick-me-up to read more.`
	const quotaLine =
		isSignedIn && remainingTopics !== null && topicLimit !== null
			? topicLimit >= ADMIN_QUOTA
				? "Unlimited topics"
				: `${remainingTopics} of ${topicLimit} topics left`
			: null
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					size="sm"
					onClick={
						isAtLimit
							? () => toast(limitLine, { action: { label: "See plans", onClick: () => navigate({ to: "/plans" }) } })
							: onNewTopic
					}
					disabled={isSignedIn && remainingTopics === null}
					className="min-h-11 shrink-0 gap-1.5 rounded-lg sm:min-h-9"
				>
					<Plus className="size-4" />
					New Topic
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				You know the one...
				{quotaLine && <span className="block">{quotaLine}</span>}
			</TooltipContent>
		</Tooltip>
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
