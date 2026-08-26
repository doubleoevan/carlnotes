import type { TopicResponse } from "@shared/contracts"
import { Check, X } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import { cn } from "@/lib/utils"

// one slot in the featured order: the position, what holds it, and the topic it belongs to
type FeatureOrderOption = { position: number; label: string; topicId: string | null }

/**
 * The admin's featured-order list for a public topic, opened from the page's actions menu.
 * A row sets this topic's position, and the X beside a row drops whatever topic holds it.
 */
export function TopicRankDialog({
	topic,
	onRank,
	onClose,
}: {
	topic: TopicResponse
	onRank: (topicId: string, position: number) => Promise<void>
	onClose: () => void
}) {
	// one option per featured topic, plus the slot past the end for a topic that isn't featured yet
	const featuredTopics = topic.featuredTopics ?? []
	const featureOrderOptions: FeatureOrderOption[] = featuredTopics.map((featured) => ({
		position: featured.featureOrder,
		label: featured.name,
		topicId: featured.id,
	}))
	if (topic.featureOrder === null) {
		featureOrderOptions.push({ position: featuredTopics.length + 1, label: "New topic", topicId: null })
	}

	// ranking and clearing both close the dialog, and the page reloads the order behind it
	const handleFeatureTopic = async (topicId: string, position: number): Promise<void> => {
		onClose()
		await onRank(topicId, position)
	}
	return (
		<Dialog open onOpenChange={onClose}>
			<DialogContent className="sm:max-w-md">
				<DialogTitle>Featured topics</DialogTitle>
				{/* the row the current topic already holds is checked */}
				{featureOrderOptions.map((featureOption) => (
					<div
						key={featureOption.position}
						className="hover:bg-accent flex min-h-11 items-center gap-1 rounded-md sm:min-h-9"
					>
						<button
							type="button"
							onClick={() => void handleFeatureTopic(topic.id, featureOption.position)}
							aria-pressed={featureOption.topicId === topic.id}
							className="flex min-w-0 flex-1 items-center gap-2 px-2 text-left text-sm"
						>
							<span className="text-muted-foreground w-4 shrink-0 tabular-nums">{featureOption.position}</span>
							<span className={cn("min-w-0 truncate", featureOption.topicId ? "" : "text-muted-foreground italic")}>
								{featureOption.label}
							</span>
							{featureOption.topicId === topic.id && <Check className="size-4 shrink-0" />}
						</button>
						{/* this button removes the topic that holds this position */}
						{featureOption.topicId && (
							<button
								type="button"
								aria-label={`Remove ${featureOption.label} from the featured topics`}
								onClick={() => void handleFeatureTopic(featureOption.topicId as string, 0)}
								className="text-muted-foreground hover:text-foreground grid size-9 shrink-0 place-items-center"
							>
								<X className="size-3.5" />
							</button>
						)}
					</div>
				))}
			</DialogContent>
		</Dialog>
	)
}
