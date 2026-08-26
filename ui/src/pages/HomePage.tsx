import { ADMIN_QUOTA } from "@shared/plans"
import { Coffee, Plus } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { authClient } from "@/clients/authClient"
import { Accordion } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { TagPicker } from "@/components/topic/TagPicker"
import { TopicFeedSkeleton } from "@/components/topic/TopicFeedSkeleton"
import { TopicSection } from "@/components/topic/TopicSection"
import { PAGE_CLASS } from "@/lib/styleClasses"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { useRegisterPageActions } from "@/stores/pageActionsStore"

/**
 * The homepage topic feed sections
 */
export function HomePage() {
	const navigate = useNavigate()
	// the session decides whether + New Topic opens the modal or sends the visitor to sign up
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
		reload,
		reheat,
		reheatKey,
		isReheating,
	} = useTopicFeed()
	const [isNewTopicOpen, setIsNewTopicOpen] = useState(false)
	// the section the user opened, or null while none has been opened and the default still applies
	const [openedSection, setopenedSection] = useState<string | null>(null)

	// the search bar's menu includes this page's reheat row
	useRegisterPageActions({
		page: "Home",
		options: [{ label: "Reheat", Icon: Coffee, onSelect: () => void reheat() }],
	})

	// a created topic refreshes the feed behind the navigation to its new page
	const handleTopicCreated = async (topicId: string): Promise<void> => {
		setIsNewTopicOpen(false)
		navigate(`/topics/${topicId}`)
		void reload()
	}

	// "+ New Topic" button opens the modal when signed in, otherwise it sends the visitor to sign up first
	const handleNewTopic = (): void => {
		if (isSignedIn) {
			setIsNewTopicOpen(true)
		} else {
			navigate("/signup?cta=new-topic")
		}
	}

	// the remount key changes on a reheat or any filter change so that the updated content animates in
	const viewKey = `${reheatKey}-${findingFilter}-${sort}-${[...resourceKinds].sort().join()}-${tagMatchMode}-${[...tagFilters].sort().join("|")}-${isSignedIn}`
	// signed in opens your topics section, signed out opens the featured topics section
	const defaultOpenSection = isSignedIn ? "yours" : "featured"
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
					onNewTopic={handleNewTopic}
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
						onValueChange={setopenedSection}
						className="[&>*:first-child_[data-slot=accordion-trigger]]:pt-0"
					>
						{topicFeed.sections.map((section) => (
							<TopicSection key={section.key} section={section} onNewTopic={handleNewTopic} />
						))}
					</Accordion>
				)}
			</div>
			{/* the new-topic modal is only mounted while it's open so that its state resets each time */}
			{isNewTopicOpen && <EditTopicModal onClose={() => setIsNewTopicOpen(false)} onTopicSaved={handleTopicCreated} />}
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
	// the plan's limit, paired with what is left to say how many of them are held
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
							? () => toast(limitLine, { action: { label: "See plans", onClick: () => navigate("/plans") } })
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
