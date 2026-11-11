import { authClient } from "@carlnotes/client/authClient"
import {
	type RankDialogElements,
	type RankDialogRowProps,
	ProfileRankDialog as SharedProfileRankDialog,
	RankDialog as SharedRankDialog,
} from "@carlnotes/core/components/RankDialog"
import { REQUEST_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { cn } from "@carlnotes/nightshift/classNames"
import { Check, GripVertical, X } from "lucide-react"
import type { ComponentProps } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

// one row on the web: the drag button, the position and name, and the X
function RankDialogRow({
	rankedItem,
	position,
	isPageItem,
	isDragged,
	removeLabel,
	onSelect,
	onStep,
	onDragStart,
	onDragOver,
	onDragEnd,
	onRemove,
}: RankDialogRowProps) {
	// the position, the name with its tooltip for a name too long for the row, and the check on the page's item
	const rowLabel = (
		<>
			<span className="text-muted-foreground w-4 shrink-0 tabular-nums">{position}</span>
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="min-w-0 truncate">{rankedItem.label}</span>
				</TooltipTrigger>
				<TooltipContent>{rankedItem.label}</TooltipContent>
			</Tooltip>
			{isPageItem && <Check className="size-4 shrink-0" />}
		</>
	)
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the drag button is the keyboard path
		<div
			draggable
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onDragOver={(event) => {
				event.preventDefault()
				onDragOver()
			}}
			className={cn(
				"hover:bg-accent flex min-h-11 cursor-grab items-center rounded-md sm:min-h-9",
				isDragged && "bg-accent opacity-70",
			)}
		>
			{/* the drag button drags with a pointer and steps with the arrow keys */}
			<button
				type="button"
				aria-label={`Move ${rankedItem.label}`}
				onKeyDown={(event) => {
					if (event.key === "ArrowUp" || event.key === "ArrowDown") {
						event.preventDefault()
						onStep(event.key === "ArrowUp" ? -1 : 1)
					}
				}}
				className="text-muted-foreground grid size-9 shrink-0 cursor-grab place-items-center"
			>
				<GripVertical className="size-4" />
			</button>

			{/* pressing a row moves the page's item to this position. a dialog with no page item only names the row */}
			{onSelect ? (
				<button
					type="button"
					onClick={onSelect}
					aria-pressed={isPageItem}
					className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
				>
					{rowLabel}
				</button>
			) : (
				<span className="flex min-w-0 flex-1 items-center gap-2 text-sm">{rowLabel}</span>
			)}

			{/* the X removes a pinned row after a confirmation, and drops a row that is not saved yet */}
			<button
				type="button"
				aria-label={removeLabel}
				onClick={onRemove}
				className="text-muted-foreground hover:text-foreground grid size-9 shrink-0 place-items-center"
			>
				<X className="size-4" />
			</button>
		</div>
	)
}

// the web's elements: a dialog, the rows bled by the icons' own inset, a select that adds a row, and the footer
const RANK_DIALOG_ELEMENTS: RankDialogElements = {
	Frame: ({ title, removeConfirm, onClose, children }) => (
		<Dialog open onOpenChange={onClose}>
			<DialogContent className="sm:max-w-md">
				<DialogTitle>{title}</DialogTitle>
				{children}
			</DialogContent>
			{/* removing a pinned row asks first, then clears it */}
			{removeConfirm}
		</Dialog>
	),
	// the rows bleed by the icons' own inset so the drag button and the X line up with the title and its close button.
	// min-w-0 lets a long name truncate
	List: ({ children }) => <div className="-mx-2.5 min-w-0">{children}</div>,
	Row: RankDialogRow,
	AddPicker: ({ label, addableItems, onAdd }) => (
		<Select
			value=""
			onValueChange={(addedItemId) => {
				const addedItem = addableItems.find((addableItem) => addableItem.id === addedItemId)
				if (addedItem) {
					onAdd(addedItem)
				}
			}}
		>
			<SelectTrigger aria-label={label} className="w-full">
				<SelectValue placeholder={label} />
			</SelectTrigger>
			<SelectContent>
				{addableItems.map((addableItem) => (
					<SelectItem key={addableItem.id} value={addableItem.id}>
						{addableItem.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	),
	EmptyText: ({ children }) => <p className="text-muted-foreground text-sm">{children}</p>,
	Footer: ({ isSaving, onCancel, onSave }) => (
		<DialogFooter>
			<Button variant="outline" onClick={onCancel} disabled={isSaving}>
				Cancel
			</Button>
			<Button onClick={onSave} disabled={isSaving}>
				Save
			</Button>
		</DialogFooter>
	),
	RemoveConfirm: ({ title, text, onConfirm, onClose }) => (
		<ConfirmDialog title={title} confirmLabel="Remove" cancelLabel="Cancel" onConfirm={onConfirm} onClose={onClose}>
			{text}
		</ConfirmDialog>
	),
}

/**
 * The list that orders pinned topics, films, podcast episodes, or Topic Posts on the web: the admin's home pins,
 * opened from a topic's, a podcast episode's, or a Topic Post's page or from the home page, and a person's own pins,
 * opened from their profile page.
 */
export function RankDialog(props: Omit<ComponentProps<typeof SharedRankDialog>, "elements">) {
	return <SharedRankDialog {...props} elements={RANK_DIALOG_ELEMENTS} />
}

/**
 * The signed-in user's own profile pins on the web, opened from the page of one of their topics, podcast episodes, or
 * Topic Posts.
 */
export function ProfileRankDialog(
	props: Omit<ComponentProps<typeof SharedProfileRankDialog>, "elements" | "userId" | "onError">,
) {
	const { data: session } = authClient().useSession()
	if (!session) {
		return null
	}
	return (
		<SharedProfileRankDialog
			{...props}
			userId={session.user.id}
			onError={() => toast.error(REQUEST_FAILED_TEXT)}
			elements={RANK_DIALOG_ELEMENTS}
		/>
	)
}
