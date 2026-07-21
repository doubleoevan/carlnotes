import { resourceKinds as allResourceKinds } from "@shared/enums"
import { Check, SlidersHorizontal } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { RESOURCE_KIND_ICON } from "@/lib/utils"
import { type ResourceKind, useTopicFeed } from "@/providers/TopicFeedProvider"

/**
 * The Filters dropdown. tap to open, then toggle which resource kinds appear in the topic feed
 */
export function SearchFilters() {
	// the active resource kind filter and its toggle from the topic feed context
	const { resourceKinds, toggleResourceKind } = useTopicFeed()
	return (
		<Popover>
			<PopoverTrigger
				className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm sm:min-h-9"
				aria-label="Filters"
			>
				<SlidersHorizontal className="size-4" />
				Filters
			</PopoverTrigger>
			<PopoverContent align="end" className="w-44 p-1">
				{/* one tappable row per resource kind from the shared enums */}
				{allResourceKinds.map((resourceKind) => (
					<ResourceKindFilter
						key={resourceKind}
						resourceKind={resourceKind}
						isActive={resourceKinds.has(resourceKind)}
						onClick={() => toggleResourceKind(resourceKind)}
					/>
				))}
			</PopoverContent>
		</Popover>
	)
}

// a clickable filter row with the resource kind's shared icon and a check mark when active
type ResourceKindFilterProps = { resourceKind: ResourceKind; isActive: boolean; onClick: () => void }
function ResourceKindFilter({ resourceKind, isActive, onClick }: ResourceKindFilterProps) {
	const Icon = RESOURCE_KIND_ICON[resourceKind]
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={isActive}
			className="hover:bg-accent flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm sm:min-h-9"
		>
			<Icon className="text-muted-foreground size-4" />
			<span className="flex-1 text-left capitalize">{resourceKind}</span>
			{isActive ? <Check className="size-4" /> : null}
		</button>
	)
}
