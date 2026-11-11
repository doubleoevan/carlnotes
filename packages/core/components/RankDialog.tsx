import { fetchProfile } from "@carlnotes/client/profileClient"
import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import { type ComponentType, type ReactNode, useEffect, useRef, useState } from "react"
import { sendProfileOrderMoves, toProfileRankDialogItems } from "../lib/profileSections"
import {
	type PinnedOrderMove,
	type RankDialogLabels,
	type RankedItem,
	type RankedNoun,
	toProfileRankDialogLabels,
} from "../lib/rankDialog"

// one row of the working order as a platform draws it: the item, its position from one, and what its controls do
export type RankDialogRowProps = {
	rankedItem: RankedItem
	position: number
	// whether the row is the page's own item, which a check marks
	isPageItem: boolean
	isDragged: boolean
	removeLabel: string
	// move the page's item to this row. absent in a dialog with no page item
	onSelect?: () => void
	// move the row one step up or down, and the pointer drag a platform with one reports
	onStep: (step: -1 | 1) => void
	onDragStart: () => void
	onDragOver: () => void
	onDragEnd: () => void
	onRemove: () => void
}

// the platform elements of a rank dialog: its frame with the confirmation it opens, the list of rows, one row, the
// picker that adds a row, the empty line, and the footer's Cancel and Save
export type RankDialogElements = {
	Frame: ComponentType<{ title: string; removeConfirm: ReactNode; onClose: () => void; children: ReactNode }>
	List: ComponentType<{ children: ReactNode }>
	Row: ComponentType<RankDialogRowProps>
	AddPicker: ComponentType<{ label: string; addableItems: RankedItem[]; onAdd: (addedItem: RankedItem) => void }>
	EmptyText: ComponentType<{ children: string }>
	Footer: ComponentType<{ isSaving: boolean; onCancel: () => void; onSave: () => void }>
	RemoveConfirm: ComponentType<{ title: string; text: string; onConfirm: () => void; onClose: () => void }>
}

type RankDialogProps = {
	labels: RankDialogLabels
	// the pinned rows in their saved order
	pinnedItems: RankedItem[]
	// the page's own item, appended if it is not pinned yet, which a row press moves
	pageItem?: RankedItem
	isPageItemPinned?: boolean
	// every item the dialog may add, pinned or not, and the most rows the order holds
	candidateItems?: RankedItem[]
	limit?: number
	onSave: (pinnedOrderMoves: PinnedOrderMove[]) => Promise<void>
	onClose: () => void
	elements: RankDialogElements
}

/**
 * The list that orders pinned topics, films, podcast episodes, or Topic Posts, for the home's pins and for a
 * profile's. Rows move by a drag or a step, the order is sent on Save, and Save is enabled whether or not a row moved.
 * The X on a pinned row asks first, then removes it at once. The X on a row that is not saved yet only drops it.
 */
export function RankDialog({
	labels,
	pinnedItems,
	pageItem,
	isPageItemPinned = false,
	candidateItems = [],
	limit,
	onSave,
	onClose,
	elements,
}: RankDialogProps) {
	const { Frame, List, Row, AddPicker, EmptyText, Footer, RemoveConfirm } = elements

	// the working order, edited locally until Save, with the page's item appended if it is not pinned yet
	const [rankedItems, setRankedItems] = useState(
		pageItem && !isPageItemPinned ? [...pinnedItems, pageItem] : pinnedItems,
	)
	const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null)
	const [isSaving, setIsSaving] = useState(false)

	// the pinned row whose X asks before it is removed
	const [removingItem, setRemovingItem] = useState<RankedItem | null>(null)

	// move one row to a new index, the one edit that the drag and the step both make
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

	// move one row a step, unless it is already at that end
	const handleStep = (fromIndex: number, step: -1 | 1): void => {
		const toIndex = fromIndex + step
		if (toIndex >= 0 && toIndex < rankedItems.length) {
			moveItem(fromIndex, toIndex)
		}
	}

	// move the page's item to the pressed row, adding it back first if the X dropped it
	const handleMovePageItem = (movedPageItem: RankedItem, toIndex: number): void => {
		setRankedItems((currentOrder) => {
			const withoutPageItem = currentOrder.filter((rankedItem) => rankedItem.id !== movedPageItem.id)
			withoutPageItem.splice(toIndex, 0, movedPageItem)
			return withoutPageItem
		})
	}

	// the X on a pinned row asks first. the X on a row that is not saved yet only drops it
	const handleRemoveItem = (rankedItem: RankedItem): void => {
		if (pinnedItems.some((pinnedItem) => pinnedItem.id === rankedItem.id)) {
			setRemovingItem(rankedItem)
			return
		}
		setRankedItems(rankedItems.filter((keptItem) => keptItem.id !== rankedItem.id))
	}

	// clear the confirmed row at once and drop it from the list. the rest of the list waits for Save, and a failed
	// clear keeps the row
	const handleConfirmRemoveItem = async (removedItem: RankedItem): Promise<void> => {
		setRemovingItem(null)
		setIsSaving(true)
		try {
			await onSave([{ id: removedItem.id, position: 0 }])
			setRankedItems((currentOrder) => currentOrder.filter((keptItem) => keptItem.id !== removedItem.id))
		} catch {
			// the row stays after a failed clear
		} finally {
			setIsSaving(false)
		}
	}

	// send the order top to bottom, and close the dialog once it saves
	const handleSave = async (): Promise<void> => {
		const pinnedOrderMoves = rankedItems.map((rankedItem, index) => ({ id: rankedItem.id, position: index + 1 }))
		setIsSaving(true)
		try {
			await onSave(pinnedOrderMoves)
			onClose()
		} catch {
			// keep the dialog open after a failed save
		} finally {
			setIsSaving(false)
		}
	}

	// the items the picker offers: every candidate not in the working order, while the order is under its limit
	const isUnderLimit = limit === undefined || rankedItems.length < limit
	const addableItems = isUnderLimit
		? candidateItems.filter((candidateItem) => !rankedItems.some((rankedItem) => rankedItem.id === candidateItem.id))
		: []
	return (
		<Frame
			title={labels.title}
			onClose={onClose}
			removeConfirm={
				removingItem && (
					<RemoveConfirm
						title={labels.removeConfirmTitle}
						text={labels.toRemoveConfirmText(removingItem.label)}
						onConfirm={() => void handleConfirmRemoveItem(removingItem)}
						onClose={() => setRemovingItem(null)}
					/>
				)
			}
		>
			<List>
				{rankedItems.map((rankedItem, index) => (
					<Row
						key={rankedItem.id}
						rankedItem={rankedItem}
						position={index + 1}
						isPageItem={rankedItem.id === pageItem?.id}
						isDragged={draggedItemIndex === index}
						removeLabel={labels.toRemoveLabel(rankedItem.label)}
						onSelect={pageItem ? () => handleMovePageItem(pageItem, index) : undefined}
						onStep={(step) => handleStep(index, step)}
						onDragStart={() => setDraggedItemIndex(index)}
						onDragOver={() => handleDragOver(index)}
						onDragEnd={() => setDraggedItemIndex(null)}
						onRemove={() => handleRemoveItem(rankedItem)}
					/>
				))}
			</List>
			{/* nothing to order when the list emptied out */}
			{rankedItems.length === 0 && <EmptyText>{labels.emptyText}</EmptyText>}
			{addableItems.length > 0 && (
				<AddPicker
					label={labels.addLabel}
					addableItems={addableItems}
					onAdd={(addedItem) => setRankedItems((currentOrder) => [...currentOrder, addedItem])}
				/>
			)}
			<Footer isSaving={isSaving} onCancel={onClose} onSave={() => void handleSave()} />
		</Frame>
	)
}

// whose profile's pins the dialog orders, what it ranks, the page's own item, and what a save, a failure, and a close
// do
type ProfileRankDialogProps = {
	userId: string
	rankedNoun: RankedNoun
	pageItem: RankedItem
	onSaved?: () => void
	// a profile that did not load, or a move the api rejected
	onError: () => void
	onClose: () => void
	elements: RankDialogElements
}

/**
 * The rank dialog of a person's own profile pins, opened from the page of one of their topics, podcast episodes, or
 * Topic Posts. It reads the profile's pins first, then offers the page's item a place among them.
 */
export function ProfileRankDialog({
	userId,
	rankedNoun,
	pageItem,
	onSaved,
	onError,
	onClose,
	elements,
}: ProfileRankDialogProps) {
	const [profile, setProfile] = useState<ProfileResponse | null>(null)

	// the handlers the load reads, which a new render replaces without reloading the profile
	const handlersRef = useRef({ onError, onClose })
	handlersRef.current = { onError, onClose }

	// read the person's profile once. a profile that does not load closes the dialog
	useEffect(() => {
		let isCurrent = true
		fetchProfile(userId)
			.then((fetchedProfile) => {
				if (!fetchedProfile) {
					throw new Error("the profile is missing")
				}
				if (isCurrent) {
					setProfile(fetchedProfile)
				}
			})
			.catch(() => {
				if (isCurrent) {
					handlersRef.current.onError()
					handlersRef.current.onClose()
				}
			})
		return () => {
			isCurrent = false
		}
	}, [userId])
	if (!profile) {
		return null
	}

	// the page's item joins the order if it is pinned already or the pins are under their limit, which Topic Posts do
	// not have. a full profile adds it from the picker once a pin is removed
	const { pinnedItems, candidateItems, limit } = toProfileRankDialogItems(rankedNoun, profile)
	const isPageItemPinned = pinnedItems.some((pinnedItem) => pinnedItem.id === pageItem.id)
	const hasPageItem = isPageItemPinned || limit === undefined || pinnedItems.length < limit

	// send the moves, and report a rejected one, which keeps the dialog open
	const handleSave = async (pinnedOrderMoves: PinnedOrderMove[]): Promise<void> => {
		try {
			await sendProfileOrderMoves(rankedNoun, pinnedOrderMoves)
		} catch (error) {
			onError()
			throw error
		}
		onSaved?.()
	}
	return (
		<RankDialog
			labels={toProfileRankDialogLabels(rankedNoun)}
			pinnedItems={pinnedItems}
			candidateItems={candidateItems}
			limit={limit}
			pageItem={hasPageItem ? pageItem : undefined}
			isPageItemPinned={isPageItemPinned}
			onSave={handleSave}
			onClose={onClose}
			elements={elements}
		/>
	)
}
