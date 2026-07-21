// placeholder sections mirroring "Your topics", "Featured" and "Popular". the strings exist only as stable react keys
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
export function PageSkeleton() {
	return (
		<div aria-hidden="true">
			{SECTION_SKELETONS.map((section) => (
				<SectionSkeleton key={section.key} topics={section.topics} />
			))}
		</div>
	)
}

// one section skeleton mirroring TopicSection. a chevron and title header, then the topic placeholders
function SectionSkeleton({ topics }: { topics: string[] }) {
	return (
		<div className="border-b last:border-b-0">
			{/* header: chevron, title, and the topic count on the right */}
			<div className="flex items-center gap-2 py-4">
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

// one topic skeleton mirroring a Topic. a header, then dashed resource rows
function TopicSkeleton() {
	return (
		<div className="py-4">
			{/* header: title, info button and a tag pill, with a "# new" count on the right */}
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					{/* title and info button */}
					<div className="flex items-center gap-2">
						<div className="bg-muted h-5 w-52 animate-pulse rounded" />
						<div className="bg-muted size-4 shrink-0 animate-pulse rounded-full" />
					</div>
					{/* tag pill */}
					<div className="bg-muted mt-1.5 h-5 w-20 animate-pulse rounded-full" />
				</div>
				{/* "# new" count */}
				<div className="bg-muted h-4 w-12 shrink-0 animate-pulse rounded" />
			</div>
			{/* dashed resource rows */}
			<div className="divide-separator mt-1 divide-y divide-dashed">
				{RESOURCE_SKELETONS.map((resourceKey) => (
					<ResourceSkeleton key={resourceKey} />
				))}
			</div>
		</div>
	)
}

// one resource skeleton mirroring TopicResource. an icon, then title and metadata lines
function ResourceSkeleton() {
	return (
		<div className="flex items-start gap-2.5 py-3 pr-10">
			{/* icon */}
			<div className="bg-muted mt-0.5 size-4 shrink-0 animate-pulse rounded" />
			{/* title and metadata lines */}
			<div className="min-w-0 flex-1">
				<div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
				<div className="bg-muted mt-2 h-3 w-2/5 animate-pulse rounded" />
			</div>
		</div>
	)
}
