import { ADMIN_QUOTA, PLANS } from "@shared/plans"
import { Check, Plus, RotateCw, SlidersHorizontal } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { Accordion } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { QuotaLink } from "@/components/topic/QuotaLink"
import { TagPicker } from "@/components/topic/TagPicker"
import { TopicFeedSkeleton } from "@/components/topic/TopicFeedSkeleton"
import { TopicFeedSort } from "@/components/topic/TopicFeedSort"
import { TopicSection } from "@/components/topic/TopicSection"
import { authClient } from "@/lib/authClient"
import { cn, MENU_BUTTON_CLASS } from "@/lib/utils"
import { type TagMatchMode, tagMatchModes, useTopicFeed } from "@/providers/TopicFeedProvider"

// the display label per tag match mode
const TAG_MATCH_LABEL: Record<TagMatchMode, string> = {
	any: "Any Match",
	all: "All Match",
	none: "Exclude Tags",
	off: "Off",
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
	} = useTopicFeed()
	// increment when the refresh button is pressed to remount the sections so their hydrate animation replays
	const [refreshKey, setRefreshKey] = useState(0)
	// disables the Reheat button for the length of its own request, so a second click can't stack another reload
	const [isRefreshing, setIsRefreshing] = useState(false)
	const [isNewTopicOpen, setIsNewTopicOpen] = useState(false)
	// the section the reader opened, or null while none has been opened and the default still applies. an empty string closes every section
	const [openedSection, setopenedSection] = useState<string | null>(null)

	// refresh reloads the topic feed and replays the load animation.
	const handleRefresh = async (): Promise<void> => {
		setIsRefreshing(true)
		try {
			// wait for the refreshed topic feed so the load animation replays over the new content
			await reload()
			setRefreshKey((previousKey) => previousKey + 1)
		} finally {
			setIsRefreshing(false)
		}
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

	// the remount key changes on refresh or any filter change so that updated content animates in
	const viewKey = `${refreshKey}-${view}-${sort}-${[...resourceKinds].sort().join()}-${tagMatchMode}-${[...tagFilters].sort().join("|")}-${isSignedIn}`
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
			<div className="mb-3 flex flex-wrap items-start justify-between gap-3">
				<div className="flex items-start gap-2">
					<TopicFeedSort sort={sort} onChange={setSort} />
					<button
						type="button"
						onClick={handleRefresh}
						disabled={isRefreshing}
						className={cn(MENU_BUTTON_CLASS, "disabled:pointer-events-none disabled:opacity-50")}
					>
						{isRefreshing ? <CoffeeMug className="size-4" /> : <RotateCw className="size-4" />}
						{isRefreshing ? "Reheating…" : "Reheat"}
					</button>
				</div>
				<NewTopicBlock
					remaining={topicFeed?.topicsRemaining ?? null}
					isSignedIn={isSignedIn}
					onNewTopic={handleNewTopic}
				/>
			</div>

			{/* skeleton animation while loading */}
			{topicFeed === null && <TopicFeedSkeleton />}

			{/*
				the topic sections with a viewKey prop so that any change replays the hydrate animation.
				opening one section closes whichever was open. the collapsible prop lets the current open one close too
			*/}
			{topicFeed && (
				<Accordion key={viewKey} type="single" collapsible value={openSection} onValueChange={setopenedSection}>
					{topicFeed.sections.map((section) => (
						<TopicSection key={section.key} section={section} />
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
				{tagMatchModes.map((matchMode) => (
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
						<span className="flex-1 text-left">{TAG_MATCH_LABEL[matchMode]}</span>
						{matchMode === mode ? <Check className="size-4" /> : null}
					</button>
				))}
			</PopoverContent>
		</Popover>
	)
}

// the "+ New Topic" button and remaining topic quota
function NewTopicBlock({
	remaining,
	isSignedIn,
	onNewTopic,
}: {
	remaining: number | null
	isSignedIn: boolean
	onNewTopic: () => void
}) {
	return (
		<div className="flex shrink-0 flex-col items-end gap-0.5">
			<Button
				size="sm"
				onClick={onNewTopic}
				disabled={isSignedIn && (remaining === null || remaining <= 0)}
				className="min-h-11 gap-1.5 rounded-lg sm:min-h-9"
			>
				<Plus className="size-4" />
				New Topic
			</Button>
			{/* the cap line hydrates in once the feed lands */}
			<TopicsRemaining remaining={remaining} isSignedIn={isSignedIn} />
		</div>
	)
}

// the topics remaining showing the free cap with a link to sign up when a visitor is logged out or the current count with a link to the pricing page
function TopicsRemaining({ remaining, isSignedIn }: { remaining: number | null; isSignedIn: boolean }) {
	// a visitor sees the free plan's cap
	if (!isSignedIn) {
		return (
			<QuotaLink
				isLoading={false}
				isUnlimited={false}
				label={`${PLANS.free.topicLimit} left`}
				href="/signup?cta=topic-quota"
				tooltip="Sign up to add"
			/>
		)
	}
	return (
		<QuotaLink
			isLoading={remaining === null}
			isUnlimited={remaining !== null && remaining >= ADMIN_QUOTA}
			label={`${remaining} left`}
			href="/pricing"
			tooltip="Upgrade for more"
		/>
	)
}
