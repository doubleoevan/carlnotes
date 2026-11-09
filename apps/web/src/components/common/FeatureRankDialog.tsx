import { cn } from "@carlnotes/nightshift/classNames"
import { Check, GripVertical, X } from "lucide-react"
import { useState } from "react"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

// one row in the working order: the topic or podcast episode and its label
export type RankedItem = { id: string; label: string }

// one move the save sends: a position, or zero to clear
export type FeatureOrderMove = { id: string; position: number }

/**
 * The admin's featured order list, opened from a topic page's or a podcast episode page's actions menu. Rows drag into
 * a new order, clicking a row moves the page's item there, and the X drops a row. Every edit shows in place, and
 * nothing is sent until Save, which asks first if it would drop a featured row.
 */
export function FeatureRankDialog({
	noun,
	pageItem,
	featuredItems,
	isPageItemFeatured,
	onSave,
	onClose,
}: {
	// what the list ranks, in the title and the empty line
	noun: "topics" | "podcast episodes"
	pageItem: RankedItem
	featuredItems: RankedItem[]
	isPageItemFeatured: boolean
	onSave: (moves: FeatureOrderMove[]) => Promise<void>
	onClose: () => void
}) {
	// the order as it stands, with this page's item appended if it is not featured yet
	const initialRankedItems: RankedItem[] = isPageItemFeatured ? featuredItems : [...featuredItems, pageItem]

	// the working order, edited locally until Save
	const [rankedItems, setRankedItems] = useState(initialRankedItems)
	const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null)
	const [isSavingRankedItems, setIsSavingRankedItems] = useState(false)

	// whether anything moved or left, gating Save
	const hasRankedItemsChanged =
		rankedItems.length !== initialRankedItems.length ||
		rankedItems.some((rankedItem, index) => rankedItem.id !== initialRankedItems[index]?.id)

	// move one row to a new index, the one edit both the drag and the keyboard make
	const moveItem = (fromIndex: number, toIndex: number): void => {
		setRankedItems((currentOrder) => {
			const nextOrder = [...currentOrder]
			const [movedItem] = nextOrder.splice(fromIndex, 1)
			if (movedItem) {
				nextOrder.splice(toIndex, 0, movedItem)
			}
			return nextOrder
		})
	}

	// move the dragged row to where the pointer is. the list shows the drop as it happens
	const handleDragOver = (overIndex: number): void => {
		if (draggedItemIndex === null || draggedItemIndex === overIndex) {
			return
		}
		moveItem(draggedItemIndex, overIndex)
		setDraggedItemIndex(overIndex)
	}

	// move one row a step with the keyboard
	const handleKeyboardMove = (fromIndex: number, step: -1 | 1): void => {
		const toIndex = fromIndex + step
		if (toIndex >= 0 && toIndex < rankedItems.length) {
			moveItem(fromIndex, toIndex)
		}
	}

	// move the page's item to the clicked row, adding it back first if the X dropped it
	const handleMovePageItem = (toIndex: number): void => {
		setRankedItems((currentOrder) => {
			const withoutPageItem = currentOrder.filter((rankedItem) => rankedItem.id !== pageItem.id)
			withoutPageItem.splice(toIndex, 0, pageItem)
			return withoutPageItem
		})
	}

	// the featured rows the X dropped, which Save clears after a confirmation. the page's item counts only if it was
	// featured before the dialog opened
	const keptItemIds = new Set(rankedItems.map((rankedItem) => rankedItem.id))
	const removedItems = featuredItems.filter((featuredItem) => !keptItemIds.has(featuredItem.id))
	const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false)

	// clear the removed rows first, then set the kept order top to bottom
	const handleSaveRankedItems = async (): Promise<void> => {
		const featureOrderMoves: FeatureOrderMove[] = [
			...removedItems.map((rankedItem) => ({ id: rankedItem.id, position: 0 })),
			...rankedItems.map((rankedItem, index) => ({ id: rankedItem.id, position: index + 1 })),
		]

		// close the dialog after the order saves
		setIsSavingRankedItems(true)
		try {
			await onSave(featureOrderMoves)
			onClose()
		} catch {
			// keep the dialog open after a failed save
		} finally {
			setIsSavingRankedItems(false)
		}
	}

	return (
		<Dialog open onOpenChange={onClose}>
			<DialogContent className="sm:max-w-md">
				<DialogTitle>Featured {noun}</DialogTitle>
				{/* the rows bleed by the icons' own inset so the drag button and the X line up with the title and its close button.
				    min-w-0 lets a long name truncate */}
				<div className="-mx-2.5 min-w-0">
					{rankedItems.map((rankedItem, index) => (
						// biome-ignore lint/a11y/noStaticElementInteractions: the drag button is the keyboard path
						<div
							key={rankedItem.id}
							draggable
							onDragStart={() => setDraggedItemIndex(index)}
							onDragEnd={() => setDraggedItemIndex(null)}
							onDragOver={(event) => {
								event.preventDefault()
								handleDragOver(index)
							}}
							className={cn(
								"hover:bg-accent flex min-h-11 cursor-grab items-center rounded-md sm:min-h-9",
								draggedItemIndex === index && "bg-accent opacity-70",
							)}
						>
							{/* the drag button drags with a pointer and steps with the arrow keys */}
							<button
								type="button"
								aria-label={`Move ${rankedItem.label}`}
								onKeyDown={(event) => {
									if (event.key === "ArrowUp" || event.key === "ArrowDown") {
										event.preventDefault()
										handleKeyboardMove(index, event.key === "ArrowUp" ? -1 : 1)
									}
								}}
								className="text-muted-foreground grid size-9 shrink-0 cursor-grab place-items-center"
							>
								<GripVertical className="size-4" />
							</button>

							{/* clicking a row moves the page's item to this position. the check marks where it sits */}
							<button
								type="button"
								onClick={() => handleMovePageItem(index)}
								aria-pressed={rankedItem.id === pageItem.id}
								className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
							>
								<span className="text-muted-foreground w-4 shrink-0 tabular-nums">{index + 1}</span>
								{/* a name too long for the row is read from its tooltip */}
								<Tooltip>
									<TooltipTrigger asChild>
										<span className="min-w-0 truncate">{rankedItem.label}</span>
									</TooltipTrigger>
									<TooltipContent>{rankedItem.label}</TooltipContent>
								</Tooltip>
								{rankedItem.id === pageItem.id && <Check className="size-4 shrink-0" />}
							</button>

							{/* the X drops the row from the working order. nothing is sent until Save */}
							<button
								type="button"
								aria-label={`Remove ${rankedItem.label} from the featured ${noun}`}
								onClick={() => setRankedItems(rankedItems.filter((kept) => kept.id !== rankedItem.id))}
								className="text-muted-foreground hover:text-foreground grid size-9 shrink-0 place-items-center"
							>
								<X className="size-4" />
							</button>
						</div>
					))}
				</div>

				{/* nothing to drag when the list emptied out */}
				{rankedItems.length === 0 && <p className="text-muted-foreground text-sm">No featured {noun}.</p>}
				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={isSavingRankedItems}>
						Cancel
					</Button>
					<Button
						onClick={() => (removedItems.length > 0 ? setIsRemoveConfirmOpen(true) : void handleSaveRankedItems())}
						disabled={isSavingRankedItems || !hasRankedItemsChanged}
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
			{/* a save that drops featured rows asks first, naming each one */}
			{isRemoveConfirmOpen && (
				<ConfirmDialog
					title={`Remove from featured ${noun}?`}
					confirmLabel="Remove"
					cancelLabel="Cancel"
					onConfirm={async () => {
						setIsRemoveConfirmOpen(false)
						await handleSaveRankedItems()
					}}
					onClose={() => setIsRemoveConfirmOpen(false)}
				>
					{removedItems.map((removedItem) => removedItem.label).join(", ")} will leave the featured {noun} on the home
					page.
				</ConfirmDialog>
			)}
		</Dialog>
	)
}
