// the podcast episode page's loading skeleton: the button row, the image and title, the podcast section with the
// player, the comments, the chapters, and the transcript
import { cn } from "@carlnotes/nightshift/classNames"
import { TableCard } from "@/components/table/TableCard"
import { MORE_UNDER_CARD_CLASS } from "@/components/topic/MoreButton"
import { ExpanderSkeleton } from "@/components/topic/TopicFeedSkeleton"
import {
	CollapsibleSectionSkeleton,
	EmptySectionCardSkeleton,
	PodcastEpisodePlayerCardSkeleton,
	PodcastThemeSongNoteSkeleton,
	TopicPodcastEpisodeVideoCardSkeleton,
} from "@/components/topic/TopicSkeleton"
import {
	HEADER_TOPIC_IMAGE_CLASS,
	IMAGE_SKELETON_CLASS,
	INFO_CARD_CLASS,
	NARROW_SCREEN_HIDDEN_CLASS,
	PAGE_BUTTON_ROW_CLASS,
	PAGE_BUTTON_SKELETON_CLASS,
	PLAIN_TOPIC_HEADER_GRID_CLASS,
	ROW_AVATAR_SKELETON_CLASS,
	TOPIC_HEADER_AREA_CLASSES,
} from "@/lib/styleClasses"

/**
 * Renders the podcast episode page's loading state in the loaded page's own layout: the button row, the header's
 * image, title, description, and byline, the podcast section with the player card, the film section with the film's
 * card, the comments, the chapters, and the transcript.
 */
export function PodcastEpisodeSkeleton() {
	return (
		<div aria-hidden="true">
			{/* the placeholder buttons of the page's button row */}
			<div className={PAGE_BUTTON_ROW_CLASS}>
				<div className={PAGE_BUTTON_SKELETON_CLASS} />
				<div className={cn(PAGE_BUTTON_SKELETON_CLASS, "w-32")} />
			</div>
			{/* the header's grid, which floats the image on a phone: the image, the title, then the description and the
			    byline with the reactions after it */}
			<div className={PLAIN_TOPIC_HEADER_GRID_CLASS}>
				<div className={cn(TOPIC_HEADER_AREA_CLASSES.image, HEADER_TOPIC_IMAGE_CLASS, IMAGE_SKELETON_CLASS)} />
				{/* the title on one line from sm up, and on three beside the image on a phone */}
				<div className={TOPIC_HEADER_AREA_CLASSES.title}>
					<div className={TITLE_LINE_CLASS}>
						<div className="bg-muted h-6 w-96 max-w-full animate-pulse rounded sm:h-7" />
					</div>
					<div className={cn(TITLE_LINE_CLASS, "sm:hidden")}>
						<div className="bg-muted h-6 w-full animate-pulse rounded" />
					</div>
					<div className={cn(TITLE_LINE_CLASS, "sm:hidden")}>
						<div className="bg-muted h-6 w-2/3 animate-pulse rounded" />
					</div>
				</div>
				<div className={TOPIC_HEADER_AREA_CLASSES.byline}>
					{/* the description, on two lines on a phone */}
					<div className="mt-1.5 sm:mt-0">
						<div className="flex h-5 items-center">
							<div className="bg-muted h-4 w-full max-w-xl animate-pulse rounded" />
						</div>
						<div className="flex h-5 items-center sm:hidden">
							<div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
						</div>
					</div>
					{/* the byline, and the reactions after it, which wrap under it on a phone */}
					<div className="mt-1.5 flex flex-wrap items-center gap-x-3 max-sm:clear-left">
						<div className="flex h-6 w-full items-center gap-2 sm:w-auto">
							<div className={ROW_AVATAR_SKELETON_CLASS} />
							<div className="bg-muted h-4 w-56 max-w-full animate-pulse rounded" />
						</div>
						<div className="flex h-8 items-center">
							<div className="bg-muted h-5 w-36 animate-pulse rounded" />
						</div>
					</div>
				</div>
			</div>

			{/* the podcast section with the theme song's note after its title, the player card, and the line of its
			    expander */}
			<CollapsibleSectionSkeleton titleClassName="w-54" className="mt-2" titleNote={<PodcastThemeSongNoteSkeleton />}>
				<PodcastEpisodePlayerCardSkeleton />
				<ExpanderSkeleton className={MORE_UNDER_CARD_CLASS} />
			</CollapsibleSectionSkeleton>

			{/* the film section with the same note, and the film's card */}
			<CollapsibleSectionSkeleton titleClassName="w-52" className="mt-2" titleNote={<PodcastThemeSongNoteSkeleton />}>
				<TopicPodcastEpisodeVideoCardSkeleton />
			</CollapsibleSectionSkeleton>

			{/* the comments card */}
			<CollapsibleSectionSkeleton titleClassName="w-30">
				<EmptySectionCardSkeleton />
			</CollapsibleSectionSkeleton>

			{/* the chapters section and its table rows */}
			<CollapsibleSectionSkeleton titleClassName="w-36" className={cn(NARROW_SCREEN_HIDDEN_CLASS, "mt-2")} hasCount>
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

// one line of the title at the title's line height: the phone's, and the taller one from sm up
const TITLE_LINE_CLASS = "flex h-[30px] items-center sm:h-[37.5px]"

// placeholder keys for the skeleton's chapter rows and transcript lines
const CHAPTER_ROW_SKELETONS = ["c1", "c2", "c3", "c4", "c5"]
const TRANSCRIPT_LINE_SKELETONS = ["t1", "t2", "t3", "t4", "t5", "t6"]
