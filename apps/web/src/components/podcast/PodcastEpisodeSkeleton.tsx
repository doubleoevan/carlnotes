// the podcast episode page's loading skeleton: the button row, the image and title, the player, the comments, the
// chapters, and the transcript
import { cn } from "@carlnotes/nightshift/classNames"
import { TableCard } from "@/components/table/TableCard"
import { ExpanderSkeleton } from "@/components/topic/TopicFeedSkeleton"
import { CollapsibleSectionSkeleton, PodcastEpisodePlayerCardSkeleton } from "@/components/topic/TopicSkeleton"
import {
	HEADER_TOPIC_IMAGE_CLASS,
	IMAGE_HEADER_CLASS,
	IMAGE_SKELETON_CLASS,
	INFO_CARD_CLASS,
	NARROW_SCREEN_HIDDEN_CLASS,
} from "@/lib/styleClasses"

/**
 * Renders the podcast episode page's loading state, with the image and title, the player, the chapters, and the
 * transcript.
 */
export function PodcastEpisodeSkeleton() {
	return (
		<div aria-hidden="true">
			{/* the placeholder buttons of the page's button row */}
			<div className="flex items-start justify-between gap-3">
				<div className="bg-muted h-11 w-28 animate-pulse rounded-lg sm:h-9" />
				<div className="bg-muted h-11 w-32 animate-pulse rounded-lg sm:h-9" />
			</div>
			{/* the placeholder image, beside the title, the description, the topic's line, and the byline */}
			<div className={IMAGE_HEADER_CLASS}>
				<div className={SKELETON_IMAGE_CLASS} />
				<div className="min-w-0 flex-1">
					<div className="bg-muted h-8 w-96 max-w-full animate-pulse rounded" />
					<div className="bg-muted mt-2.5 h-4 w-full animate-pulse rounded" />
					<div className="bg-muted mt-2.5 h-4 w-56 max-w-full animate-pulse rounded" />
					<div className="mt-2.5 flex items-center gap-2">
						<div className="bg-muted size-6 shrink-0 animate-pulse rounded-full" />
						<div className="bg-muted h-4 w-40 animate-pulse rounded" />
					</div>
				</div>
			</div>

			{/* the player card and the line of its expander */}
			<div>
				<PodcastEpisodePlayerCardSkeleton />
				<ExpanderSkeleton />
			</div>

			{/* the comments card */}
			<CollapsibleSectionSkeleton titleClassName="w-28" className="mt-2">
				<div className={cn(INFO_CARD_CLASS, "h-32")} />
			</CollapsibleSectionSkeleton>

			{/* the chapters section and its table rows */}
			<CollapsibleSectionSkeleton titleClassName="w-36" className={cn(NARROW_SCREEN_HIDDEN_CLASS, "mt-2")}>
				<TableCard>
					{CHAPTER_ROW_SKELETONS.map((skeletonKey) => (
						<div key={skeletonKey} className="border-separator flex items-center gap-4 border-b py-2 last:border-b-0">
							<div className="bg-muted size-11 shrink-0 animate-pulse rounded-full sm:size-9" />
							<div className="bg-muted h-4 w-40 shrink-0 animate-pulse rounded" />
							<div className="bg-muted h-4 w-10 shrink-0 animate-pulse rounded" />
							<div className="bg-muted h-4 w-10 shrink-0 animate-pulse rounded" />
							<div className="bg-muted h-4 flex-1 animate-pulse rounded" />
						</div>
					))}
				</TableCard>
			</CollapsibleSectionSkeleton>

			{/* the transcript heading and its first lines */}
			<div className="py-2">
				<div className="bg-muted h-7 w-40 animate-pulse rounded" />
			</div>
			<div className={INFO_CARD_CLASS}>
				{TRANSCRIPT_LINE_SKELETONS.map((skeletonKey) => (
					<div key={skeletonKey} className="bg-muted mb-3 h-4 w-full animate-pulse rounded last:mb-0 last:w-2/3" />
				))}
			</div>
		</div>
	)
}

// the skeleton's image, in a flex row beside its placeholder lines
const SKELETON_IMAGE_CLASS = cn(HEADER_TOPIC_IMAGE_CLASS, IMAGE_SKELETON_CLASS, "shrink-0 rounded-lg")

// placeholder keys for the skeleton's chapter rows and transcript lines
const CHAPTER_ROW_SKELETONS = ["c1", "c2", "c3", "c4", "c5"]
const TRANSCRIPT_LINE_SKELETONS = ["t1", "t2", "t3", "t4", "t5", "t6"]
