import { RESOURCE_LIST_CARD_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// placeholder sections mirroring "Your topics", "Featured topics" and "Popular topics"
const SECTION_SKELETONS = [
	{ key: "yours", topics: ["a", "b"] },
	{ key: "featured", topics: ["c", "d"] },
	{ key: "popular", topics: ["e"] },
]
// five resource placeholders per topic
const RESOURCE_SKELETONS = ["r1", "r2", "r3", "r4", "r5"]

/**
 * A loading state for the topic sections. It mirrors the real layout so that content doesn't shift when the data arrives.
 */
export function TopicFeedSkeleton() {
	return (
		<div aria-hidden="true">
			{SECTION_SKELETONS.map((section, index) => (
				<TopicSectionSkeleton key={section.key} topics={section.topics} isFirst={index === 0} />
			))}
		</div>
	)
}

// one section skeleton mirroring the TopicSection
function TopicSectionSkeleton({ topics, isFirst }: { topics: string[]; isFirst: boolean }) {
	return (
		<div className="border-b last:border-b-0">
			{/* header: chevron, title, and the topic count on the right */}
			<div className={cn("flex items-center gap-2 pb-4", !isFirst && "pt-4")}>
				<div className="bg-muted size-4 shrink-0 animate-pulse rounded" />
				<div className="bg-muted h-6 w-32 animate-pulse rounded" />
				<div className="bg-muted ml-auto h-4 w-4 animate-pulse rounded" />
			</div>
			<div className="pb-2">
				{topics.map((topic) => (
					<TopicSkeleton key={topic} />
				))}
			</div>
		</div>
	)
}

// one topic skeleton mirroring a Topic. a header, then the resource rows in the same card they sit in
function TopicSkeleton() {
	return (
		<div className="py-2">
			{/* header: title, info button and a tag pill, with a "# new" count on the right */}
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					{/* title and info button */}
					<div className="flex items-center gap-2">
						<div className="bg-muted my-1 ml-4 h-5 w-52 animate-pulse rounded" />
						<div className="bg-muted size-4 shrink-0 animate-pulse rounded-full" />
					</div>
					{/* tag pill */}
					<div className="bg-muted mt-1.5 mb-1.5 ml-3 h-5 w-20 animate-pulse rounded-full" />
				</div>
				{/* "# new" count */}
				<div className="bg-muted h-4 w-12 shrink-0 animate-pulse rounded" />
			</div>
			{/* the rows sit in the same translucent card as the real list,
			    so the steam still reads through, and nothing shifts when the feed arrives */}
			<div className={cn(RESOURCE_LIST_CARD_CLASS, "mt-1.5 p-1")}>
				{RESOURCE_SKELETONS.map((resourceKey) => (
					<ResourceSkeleton key={resourceKey} />
				))}
			</div>
		</div>
	)
}

// one resource skeleton mirroring TopicResource: the rank slot, the kind icon, then title and metadata lines
export function ResourceSkeleton() {
	return (
		<div className="after:border-separator-strong relative flex after:absolute after:inset-x-2 after:top-0 after:border-t after:border-dashed first:after:hidden">
			{/* the rank slot the real row keeps for its number */}
			<div className="absolute top-1.5 left-0 grid size-11 place-items-center sm:size-8">
				<div className="bg-muted size-3 animate-pulse rounded" />
			</div>
			{/* icon, then title and metadata lines */}
			<div className="flex min-w-0 flex-1 items-start gap-2.5 py-3 pr-10 pl-9">
				<div className="bg-muted mt-0.5 size-4 shrink-0 animate-pulse rounded" />
				<div className="min-w-0 flex-1">
					<div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
					<div className="bg-muted mt-2 h-3 w-2/5 animate-pulse rounded" />
				</div>
			</div>
		</div>
	)
}
