import { topicSectionKeys } from "@shared/enums"
import { ADMIN_QUOTA, PLANS } from "@shared/plans"
import { Check, Plus, RotateCw, SlidersHorizontal } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { AnchorLink } from "@/components/AnchorLink"
import { Accordion } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TagPicker } from "@/components/TagPicker"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { TopicFeedSkeleton } from "@/components/topic-feed/TopicFeedSkeleton"
import { TopicSection } from "@/components/topic-feed/TopicSection"
import { UnreadToggle } from "@/components/UnreadToggle"
import { authClient } from "@/lib/authClient"
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
	// gates the add-topic flow: signed out, Add Topic sends the visitor to sign up instead of opening the modal
	const { data: session } = authClient.useSession()
	const isSignedIn = Boolean(session)
	// the shared feed state: the sections, the view filters, and the topic-creation quota
	const {
		topicFeed,
		showAll,
		setShowAll,
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
	// whether the add-topic modal is open
	const [isAddTopicOpen, setIsAddTopicOpen] = useState(false)

	// refresh refetches the topic feed and replays the load animation
	const handleRefresh = async () => {
		// wait for the refreshed topic feed so the entrance animation replays over the new content, not the old
		await reload()
		setRefreshKey((previousKey) => previousKey + 1)
	}

	// a created topic refreshes the feed behind the navigation to its new page
	const handleTopicCreated = async (topicId: string) => {
		setIsAddTopicOpen(false)
		await reload()
		navigate(`/topics/${topicId}`)
	}

	// "Add Topic" button opens the modal when signed in, otherwise it sends the visitor to sign up first
	const handleAddTopic = () => {
		if (isSignedIn) {
			setIsAddTopicOpen(true)
		} else {
			navigate("/signup")
		}
	}

	// the remount key changes on refresh or any filter change so that updated content animates in
	const viewKey = `${refreshKey}-${showAll}-${[...resourceKinds].sort().join()}-${tagMatchMode}-${[...tagFilters].sort().join("|")}`
	return (
		<main className="mx-auto max-w-5xl px-safe py-8">
			{/* the "All" "Unread" toggle to the left, the "Refresh" button and the "Add Topic" block to the right */}
			<div className="mb-3 flex items-start justify-between gap-3">
				<UnreadToggle showAll={showAll} onChange={setShowAll} />
				<div className="flex items-start gap-2">
					<Button
						variant="secondary"
						size="sm"
						onClick={handleRefresh}
						className="min-h-11 gap-1.5 rounded-lg sm:min-h-9"
					>
						<RotateCw className="size-4" />
						Refresh
					</Button>
					<AddTopicBlock
						remaining={topicFeed?.topicsRemaining ?? null}
						isSignedIn={isSignedIn}
						onAdd={handleAddTopic}
					/>
				</div>
			</div>

			{/* tag filters: the Tags link with its pills and "+" to the left, the Tag Filters menu to the right */}
			<div className="mb-3 flex flex-wrap items-center justify-between gap-1.5">
				<div className="flex min-w-0 flex-wrap items-center gap-1.5">
					<TagPicker tags={tagFilters} knownTags={knownTags} openPickerLabel="Tags:" onTagsChange={setTagFilters} />
				</div>
				<TagFiltersMenu mode={tagMatchMode} onModeChange={setTagMatchMode} />
			</div>

			{/* skeleton animation while loading */}
			{topicFeed === null && <TopicFeedSkeleton />}

			{/* the topic sections with a viewKey prop so that any change replays the hydrate animation */}
			{topicFeed && (
				<Accordion key={viewKey} type="multiple" defaultValue={[...topicSectionKeys]}>
					{topicFeed.sections.map((section) => (
						<TopicSection key={section.key} section={section} />
					))}
				</Accordion>
			)}

			{/* the add-topic modal is mounted only while it's open so that its state resets each time */}
			{isAddTopicOpen && <EditTopicModal onClose={() => setIsAddTopicOpen(false)} onTopicSaved={handleTopicCreated} />}
		</main>
	)
}

// the Tag Filters menu: a button matching the search bar's Filters control, opening the tag match mode options
function TagFiltersMenu({ mode, onModeChange }: { mode: TagMatchMode; onModeChange: (mode: TagMatchMode) => void }) {
	return (
		<Popover>
			<PopoverTrigger className="bg-card text-muted-foreground hover:text-foreground inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm shadow-sm sm:min-h-9">
				<SlidersHorizontal className="size-4" />
				Tag Filters
			</PopoverTrigger>
			<PopoverContent align="end" className="w-40 p-1">
				{/* one row per match mode with a check on the active one */}
				{tagMatchModes.map((matchMode) => (
					<button
						key={matchMode}
						type="button"
						onClick={() => onModeChange(matchMode)}
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

// the "Add Topic" button and remaining topic quota
function AddTopicBlock({
	remaining,
	isSignedIn,
	onAdd,
}: {
	remaining: number | null
	isSignedIn: boolean
	onAdd: () => void
}) {
	return (
		<div className="flex shrink-0 flex-col items-end gap-0.5">
			<Button
				size="sm"
				onClick={onAdd}
				disabled={isSignedIn && (remaining === null || remaining <= 0)}
				className="min-h-11 gap-1.5 rounded-lg sm:min-h-9"
			>
				<Plus className="size-4" />
				Add Topic
			</Button>
			{/* the cap line hydrates in once the feed lands */}
			<TopicsRemaining remaining={remaining} isSignedIn={isSignedIn} />
		</div>
	)
}

// the topics remaining showing the free cap with a link to sign up when logged out or the current count with a link to the pricing page
function TopicsRemaining({ remaining, isSignedIn }: { remaining: number | null; isSignedIn: boolean }) {
	if (!isSignedIn) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<AnchorLink href="/signup" className="text-link animate-hydrate mr-2.5 text-xs hover:underline">
						{PLANS.free.topicLimit} left
					</AnchorLink>
				</TooltipTrigger>
				<TooltipContent side="bottom">Sign up to add</TooltipContent>
			</Tooltip>
		)
	}

	// animate while loading
	if (remaining === null) {
		return <div aria-hidden="true" className="bg-muted mr-2.5 h-4 w-16 animate-pulse rounded" />
	}

	// an admin has unlimited topics
	if (remaining >= ADMIN_QUOTA) {
		return <span className="text-muted-foreground animate-hydrate mr-2.5 text-xs">Unlimited</span>
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<AnchorLink href="/pricing" className="text-link animate-hydrate mr-2.5 text-xs hover:underline">
					{remaining} left
				</AnchorLink>
			</TooltipTrigger>
			<TooltipContent side="bottom">Upgrade for more</TooltipContent>
		</Tooltip>
	)
}
