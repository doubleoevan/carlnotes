import type { TopicResponse } from "@shared/contracts"
import { Check, ListOrdered, X } from "lucide-react"
import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { cn, MENU_BUTTON_CLASS } from "@/lib/utils"

// one row of the feature order menu: the position, and either the topic that holds it or the slot this topic can append at
type FeatureOrderOption = { position: number; label: string; topicId: string | null }

/**
 * The Featured Topics order button: an admin's dropdown menu showing where a public Topic sits in the homepage's Featured Topics section.
 * The menu lists each Featured Topic position with the Topic holding it. Selecting a choice inserts the current topic at that position.
 */
export function TopicRankButton({
	topic,
	isAdmin,
	onRank,
}: {
	topic: TopicResponse
	isAdmin: boolean
	onRank: (topicId: string, position: number) => Promise<void>
}) {
	const [isOpen, setIsOpen] = useState(false)

	// nobody but an admin can arrange the Featured Topic section, and only a public Topic can be in it.
	if (!isAdmin || topic.visibility !== "public") {
		return null
	}

	// one option per featured Topic, plus the slot past the end for a Topic that isn't featured yet
	const featuredTopics = topic.featuredTopics ?? []
	const featureOrderOptions: FeatureOrderOption[] = featuredTopics.map((featured) => ({
		position: featured.featureOrder,
		label: featured.name,
		topicId: featured.id,
	}))
	// a topic that is already featured cannot be appended to the end
	const isFeatured = topic.featureOrder !== null
	if (!isFeatured) {
		featureOrderOptions.push({ position: featuredTopics.length + 1, label: "New topic", topicId: null })
	}

	// ranking and clearing both close the feature topic menu immediately, the menu gets updated afterword
	const handleFeatureTopic = async (topicId: string, position: number): Promise<void> => {
		setIsOpen(false)
		await onRank(topicId, position)
	}
	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger className={MENU_BUTTON_CLASS}>
						<ListOrdered className="size-4" />
						{topic.featureOrder === null ? "Rank" : `Rank: ${topic.featureOrder}`}
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>Set featured topics</TooltipContent>
			</Tooltip>
			<PopoverContent align="center" className="w-64 p-1">
				{/* the row the current Topic already holds is checked */}
				{featureOrderOptions.map((featureOption) => (
					<div
						key={featureOption.position}
						className="hover:bg-accent flex min-h-11 items-center gap-1 rounded-md sm:min-h-9"
					>
						<button
							type="button"
							onClick={() => handleFeatureTopic(topic.id, featureOption.position)}
							aria-pressed={featureOption.topicId === topic.id}
							className="flex min-w-0 flex-1 items-center gap-2 px-2 text-left text-sm"
						>
							<span className="text-muted-foreground w-4 shrink-0 tabular-nums">{featureOption.position}</span>
							<span className={cn("min-w-0 truncate", featureOption.topicId ? "" : "text-muted-foreground italic")}>
								{featureOption.label}
							</span>
							{/* the Topic whose page this is shows checked */}
							{featureOption.topicId === topic.id && <Check className="size-4 shrink-0" />}
						</button>
						{/* this button removes the Topic that holds this feature order position */}
						{featureOption.topicId && (
							<button
								type="button"
								aria-label={`Remove ${featureOption.label} from the featured topics`}
								onClick={() => handleFeatureTopic(featureOption.topicId as string, 0)}
								className="text-muted-foreground hover:text-foreground grid size-9 shrink-0 place-items-center"
							>
								<X className="size-3.5" />
							</button>
						)}
					</div>
				))}
			</PopoverContent>
		</Popover>
	)
}
