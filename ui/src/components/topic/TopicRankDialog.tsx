import type { TopicResponse } from "@shared/contracts"
import { Check, GripVertical, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { cn } from "@/lib/utils"

// one row in the working order: the topic and its name
type RankedTopic = { topicId: string; label: string }

// one move the save sends: a position, or zero to clear
export type FeatureOrderMove = { topicId: string; position: number }

/**
 * The admin's featured topics order list, opened from a topic page's actions menu. Rows drag into a new order,
 * clicking a row moves that page's topic there, and the X drops a row. Every edit shows in
 * place, and nothing is sent until Save.
 */
export function TopicRankDialog({
	topic,
	onSave,
	onClose,
}: {
	topic: TopicResponse
	onSave: (moves: FeatureOrderMove[]) => Promise<void>
	onClose: () => void
}) {
	// the order as it stands, with this topic appended when it is not featured yet
	const featuredTopics = topic.featuredTopics ?? []
	const initialRankedTopics: RankedTopic[] = featuredTopics.map((featuredTopic) => ({
		topicId: featuredTopic.id,
		label: featuredTopic.name,
	}))
	if (topic.featureOrder === null) {
		initialRankedTopics.push({ topicId: topic.id, label: topic.name })
	}

	// the working order, edited locally until Save
	const [rankedTopics, setRankedTopics] = useState(initialRankedTopics)
	const [draggedTopicIndex, setDraggedTopicIndex] = useState<number | null>(null)
	const [isSavingRankedTopics, setIsSavingRankedTopics] = useState(false)

	// whether anything moved or left, gating Save
	const isRankedTopicsChanged =
		rankedTopics.length !== initialRankedTopics.length ||
		rankedTopics.some((rankedTopic, index) => rankedTopic.topicId !== initialRankedTopics[index]?.topicId)

	// move one row to a new index, the one edit both the drag and the keyboard make
	const moveTopic = (fromIndex: number, toIndex: number): void => {
		setRankedTopics((currentOrder) => {
			const nextOrder = [...currentOrder]
			const [movedTopic] = nextOrder.splice(fromIndex, 1)
			if (movedTopic) {
				nextOrder.splice(toIndex, 0, movedTopic)
			}
			return nextOrder
		})
	}

	// move the dragged row to where the pointer is. the list shows the drop as it happens
	const handleDragOverIndex = (overIndex: number): void => {
		if (draggedTopicIndex === null || draggedTopicIndex === overIndex) {
			return
		}
		moveTopic(draggedTopicIndex, overIndex)
		setDraggedTopicIndex(overIndex)
	}

	// move one row a step with the keyboard
	const handleMoveStep = (fromIndex: number, step: -1 | 1): void => {
		const toIndex = fromIndex + step
		if (toIndex >= 0 && toIndex < rankedTopics.length) {
			moveTopic(fromIndex, toIndex)
		}
	}

	// move the page's topic to the clicked row, adding it back first when the X dropped it
	const handleClickTopicIndex = (toIndex: number): void => {
		setRankedTopics((currentOrder) => {
			const withoutPageTopic = currentOrder.filter((rankedTopic) => rankedTopic.topicId !== topic.id)
			withoutPageTopic.splice(toIndex, 0, { topicId: topic.id, label: topic.name })
			return withoutPageTopic
		})
	}

	// clear the removed rows first, then set the kept order top to bottom
	const handleSaveRankedTopics = async (): Promise<void> => {
		const keptTopicIds = new Set(rankedTopics.map((rankedTopic) => rankedTopic.topicId))
		const featureOrderMoves: FeatureOrderMove[] = [
			...initialRankedTopics
				.filter((rankedTopic) => !keptTopicIds.has(rankedTopic.topicId))
				.map((rankedTopic) => ({ topicId: rankedTopic.topicId, position: 0 })),
			...rankedTopics.map((rankedTopic, index) => ({ topicId: rankedTopic.topicId, position: index + 1 })),
		]

		// the dialog closes once the order lands, and the page reloads behind it
		setIsSavingRankedTopics(true)
		try {
			await onSave(featureOrderMoves)
			onClose()
		} finally {
			setIsSavingRankedTopics(false)
		}
	}

	return (
		<Dialog open onOpenChange={onClose}>
			<DialogContent className="sm:max-w-md">
				<DialogTitle>Featured topics</DialogTitle>
				{/* the rows bleed by the icons' own inset so the drag button and the X line up with the title and its close button.
				    min-w-0 lets a long name truncate, which a grid item otherwise will not do */}
				<div className="-mx-2.5 min-w-0">
					{rankedTopics.map((rankedTopic, index) => (
						// biome-ignore lint/a11y/noStaticElementInteractions: the drag button is the keyboard path
						<div
							key={rankedTopic.topicId}
							draggable
							onDragStart={() => setDraggedTopicIndex(index)}
							onDragEnd={() => setDraggedTopicIndex(null)}
							onDragOver={(event) => {
								event.preventDefault()
								handleDragOverIndex(index)
							}}
							className={cn(
								"hover:bg-accent flex min-h-11 cursor-grab items-center rounded-md sm:min-h-9",
								draggedTopicIndex === index && "bg-accent opacity-70",
							)}
						>
							{/* the drag button drags with a pointer and steps with the arrow keys */}
							<button
								type="button"
								aria-label={`Move ${rankedTopic.label}`}
								onKeyDown={(event) => {
									if (event.key === "ArrowUp" || event.key === "ArrowDown") {
										event.preventDefault()
										handleMoveStep(index, event.key === "ArrowUp" ? -1 : 1)
									}
								}}
								className="text-muted-foreground grid size-9 shrink-0 cursor-grab place-items-center"
							>
								<GripVertical className="size-4" />
							</button>

							{/* clicking a row moves the page's topic to this position. the check marks where it sits */}
							<button
								type="button"
								onClick={() => handleClickTopicIndex(index)}
								aria-pressed={rankedTopic.topicId === topic.id}
								className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
							>
								<span className="text-muted-foreground w-4 shrink-0 tabular-nums">{index + 1}</span>
								{/* a name too long for the row is read from its tooltip */}
								<Tooltip>
									<TooltipTrigger asChild>
										<span className="min-w-0 truncate">{rankedTopic.label}</span>
									</TooltipTrigger>
									<TooltipContent>{rankedTopic.label}</TooltipContent>
								</Tooltip>
								{rankedTopic.topicId === topic.id && <Check className="size-4 shrink-0" />}
							</button>

							{/* the X drops the row from the working order. nothing is sent until Save */}
							<button
								type="button"
								aria-label={`Remove ${rankedTopic.label} from the featured topics`}
								onClick={() => setRankedTopics(rankedTopics.filter((kept) => kept.topicId !== rankedTopic.topicId))}
								className="text-muted-foreground hover:text-foreground grid size-9 shrink-0 place-items-center"
							>
								<X className="size-4" />
							</button>
						</div>
					))}
				</div>

				{/* nothing to drag when the list emptied out */}
				{rankedTopics.length === 0 && <p className="text-muted-foreground text-sm">No featured topics.</p>}
				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={isSavingRankedTopics}>
						Cancel
					</Button>
					<Button
						onClick={() => void handleSaveRankedTopics()}
						disabled={isSavingRankedTopics || !isRankedTopicsChanged}
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
