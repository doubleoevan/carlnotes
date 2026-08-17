import { ADMIN_QUOTA, PLANS } from "@shared/plans"
import { Ban, Blend, Check, CircleX, type LucideIcon, Plus, RotateCw, SlidersHorizontal, Target } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { Accordion } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { ScanQuotaLink } from "@/components/topic/ScanQuotaLink.tsx"
import { TagPicker } from "@/components/topic/TagPicker"
import { TopicFeedSkeleton } from "@/components/topic/TopicFeedSkeleton"
import { TopicFeedSort } from "@/components/topic/TopicFeedSort"
import { TopicSection } from "@/components/topic/TopicSection"
import { authClient } from "@/lib/authClient"
import { cn, MENU_BUTTON_CLASS } from "@/lib/utils"
import { type TagMatchMode, tagMatchModes, useTopicFeed } from "@/providers/TopicFeedProvider"

// each tag match mode's display label and icon
const TAG_MATCH_ROWS: Record<TagMatchMode, { label: string; Icon: LucideIcon }> = {
	any: { label: "Any Match", Icon: Blend },
	all: { label: "All Match", Icon: Target },
	none: { label: "Exclude Tags", Icon: Ban },
	off: { label: "Off", Icon: CircleX },
}

/**
 * The homepage topic feed sections
 */
export function HomePage() {
	const navigate = useNavigate()
	// + New Topic sends a non-authenticated visitor to sign up instead of opening the modal
	const { data: session } = authClient.useSession()
	const isSignedIn = Boolean(session)
	// the shared feed state: the sections, the view filters, and the topic-creation quota
	const {
		topicFeed,
		view,
		sort,
		setSort,
		resourceKinds,
		tagFilters,
		setTagFilters,
		tagMatchMode,
		setTagMatchMode,
		knownTags,
		reload,
		reheat,
		reheatKey,
		isReheating,
	} = useTopicFeed()
	const [isNewTopicOpen, setIsNewTopicOpen] = useState(false)
	// the section the user opened, or null while none has been opened and the default still applies. an empty string closes every section
	const [openedSection, setopenedSection] = useState<string | null>(null)

	// the Reheat button runs the provider's reheat, which reloads the feed and replays the load animation.
	// the hero's home links run the same reheat when clicked from this page
	const handleReheat = async (): Promise<void> => {
		await reheat()
	}

	// a created topic refreshes the feed behind the navigation to its new page
	const handleTopicCreated = async (topicId: string): Promise<void> => {
		setIsNewTopicOpen(false)
		try {
			await reload()
		} finally {
			navigate(`/topics/${topicId}`)
		}
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
	const viewKey = `${reheatKey}-${view}-${sort}-${[...resourceKinds].sort().join()}-${tagMatchMode}-${[...tagFilters].sort().join("|")}-${isSignedIn}`
	// signed in opens your topics section, signed out opens the featured topics section
	const defaultOpenSection = isSignedIn ? "yours" : "featured"
	const openSection = openedSection ?? defaultOpenSection
	return (
		<main className="mx-auto max-w-5xl px-safe pt-3 pb-8">
			{/* tag filters: the Tags link with its pills and "+" to the left, the Tag Filters menu to the right */}
			<div className="mb-3 flex flex-wrap items-center justify-between gap-1.5">
				<div className="flex min-w-0 flex-wrap items-center gap-1.5">
					<TagPicker tags={tagFilters} knownTags={knownTags} openPickerLabel="Tags:" onTagsChange={setTagFilters} />
				</div>
				<TagFiltersMenu mode={tagMatchMode} onTagModeChange={setTagMatchMode} />
			</div>

			{/* the Sort menu and the "Reheat" button to the left, the "+ New Topic" block to the right, wrapping onto a second line when the screen is too narrow */}
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex items-start gap-2">
					<TopicFeedSort sort={sort} onChange={setSort} />
					<button
						type="button"
						onClick={handleReheat}
						disabled={isReheating}
						className={cn(MENU_BUTTON_CLASS, "disabled:pointer-events-none disabled:opacity-50")}
					>
						{isReheating ? <CoffeeMug className="size-4" /> : <RotateCw className="size-4" />}
						{isReheating ? "Reheating…" : "Reheat"}
					</button>
				</div>
				<NewTopicBlock
					remainingTopics={topicFeed?.topicsRemaining ?? null}
					isSignedIn={isSignedIn}
					onNewTopic={handleNewTopic}
				/>
			</div>

			{/* skeleton animation while loading and reheating */}
			{(topicFeed === null || isReheating) && <TopicFeedSkeleton />}

			{/*
				the topic sections with a viewKey prop so that any change replays the hydrate animation.
				opening one section closes the others. the collapsible prop lets the current open one close too.
				the first section's header sits drops the top padding
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

			{/* the new-topic modal is only mounted while it's open so that its state resets each time */}
			{isNewTopicOpen && <EditTopicModal onClose={() => setIsNewTopicOpen(false)} onTopicSaved={handleTopicCreated} />}
		</main>
	)
}

// the Tag Filters menu: a button matching the search bar's Filters control. picking a mode closes the menu
function TagFiltersMenu({
	mode,
	onTagModeChange,
}: {
	mode: TagMatchMode
	onTagModeChange: (mode: TagMatchMode) => void
}) {
	const [isOpen, setIsOpen] = useState(false)
	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger className={MENU_BUTTON_CLASS}>
				<SlidersHorizontal className="size-4" />
				Tag Filters
			</PopoverTrigger>
			<PopoverContent align="end" className="w-40 p-1">
				{/* one row per match mode with a check on the active one */}
				{tagMatchModes.map((matchMode) => {
					const { label, Icon } = TAG_MATCH_ROWS[matchMode]
					return (
						<button
							key={matchMode}
							type="button"
							onClick={() => {
								onTagModeChange(matchMode)
								setIsOpen(false)
							}}
							aria-pressed={matchMode === mode}
							className="hover:bg-accent flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm sm:min-h-9"
						>
							<Icon className="size-4 text-muted-foreground" />
							<span className="flex-1 text-left">{label}</span>
							{matchMode === mode ? <Check className="size-4" /> : null}
						</button>
					)
				})}
			</PopoverContent>
		</Popover>
	)
}

// the "+ New Topic" button and remaining topic quota
function NewTopicBlock({
	remainingTopics,
	isSignedIn,
	onNewTopic,
}: {
	remainingTopics: number | null
	isSignedIn: boolean
	onNewTopic: () => void
}) {
	return (
		<div className="flex shrink-0 flex-col items-end gap-0.5">
			<Button
				size="sm"
				onClick={onNewTopic}
				disabled={isSignedIn && (remainingTopics === null || remainingTopics <= 0)}
				className="min-h-11 gap-1.5 rounded-lg sm:min-h-9"
			>
				<Plus className="size-4" />
				New Topic
			</Button>
			{/* the cap line hydrates in once the feed lands */}
			<TopicsRemaining remainingTopics={remainingTopics} isSignedIn={isSignedIn} />
		</div>
	)
}

// the topic slots remaining showing the free cap with a link to sign up when a visitor is logged out,
// or the current count with a link to the plans page
function TopicsRemaining({ remainingTopics, isSignedIn }: { remainingTopics: number | null; isSignedIn: boolean }) {
	// a visitor sees the free plan's cap
	if (!isSignedIn) {
		return (
			<ScanQuotaLink
				isLoading={false}
				isUnlimited={false}
				label={`${PLANS.free.topicLimit} left`}
				href="/signup?cta=topic-quota"
				tooltip="Sign up to add"
			/>
		)
	}
	return (
		<ScanQuotaLink
			isLoading={remainingTopics === null}
			isUnlimited={remainingTopics !== null && remainingTopics >= ADMIN_QUOTA}
			label={`${remainingTopics} left`}
			href="/plans"
			tooltip="Upgrade for more"
		/>
	)
}
