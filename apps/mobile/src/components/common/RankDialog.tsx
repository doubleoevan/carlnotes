import { showClientError } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import {
	type RankDialogElements,
	type RankDialogRowProps,
	ProfileRankDialog as SharedProfileRankDialog,
	RankDialog as SharedRankDialog,
} from "@carlnotes/core/components/RankDialog"
import { REQUEST_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { Check, ChevronDown, ChevronUp, X } from "lucide-react-native"
import type { ComponentProps } from "react"
import { Pressable, View } from "react-native"
import { ChoiceSelect } from "@/components/common/ChoiceSelect"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

// one row in the app: the two step buttons that replace the web's drag, the position and name, and the X
function RankDialogRow({
	rankedItem,
	position,
	isPageItem,
	removeLabel,
	onSelect,
	onStep,
	onRemove,
}: RankDialogRowProps) {
	// the position, the name on one line, and the check on the page's item
	const rowLabel = (
		<>
			<Text className="w-5 text-sm text-muted-foreground tabular-nums">{position}</Text>
			<Text numberOfLines={1} className="shrink text-sm">
				{rankedItem.label}
			</Text>
			{isPageItem && <Icon as={Check} className="size-4 text-foreground" />}
		</>
	)
	return (
		<View className="min-h-12 flex-row items-center gap-1">
			{/* the step buttons move the row up or down one place */}
			<Button variant="ghost" size="icon" accessibilityLabel={`Move ${rankedItem.label} up`} onPress={() => onStep(-1)}>
				<Icon as={ChevronUp} className="size-4 text-muted-foreground" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				accessibilityLabel={`Move ${rankedItem.label} down`}
				onPress={() => onStep(1)}
			>
				<Icon as={ChevronDown} className="size-4 text-muted-foreground" />
			</Button>

			{/* pressing a row moves the page's item to this position. a dialog with no page item only names the row */}
			{onSelect ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={`${position} ${rankedItem.label}`}
					accessibilityState={{ selected: isPageItem }}
					onPress={onSelect}
					className="min-h-12 flex-1 flex-row items-center gap-2 active:opacity-75"
				>
					{rowLabel}
				</Pressable>
			) : (
				<View className="flex-1 flex-row items-center gap-2">{rowLabel}</View>
			)}

			{/* the X removes a pinned row after a confirmation, and drops a row that is not saved yet */}
			<Button variant="ghost" size="icon" accessibilityLabel={removeLabel} onPress={onRemove}>
				<Icon as={X} className="size-4 text-muted-foreground" />
			</Button>
		</View>
	)
}

// the app's elements: a sheet, the rows in one column, a choice list that adds a row, and the footer
const RANK_DIALOG_ELEMENTS: RankDialogElements = {
	Frame: ({ title, removeConfirm, onClose, children }) => (
		<Sheet title={title} onClose={onClose}>
			<View className="gap-4">{children}</View>
			{/* removing a pinned row asks first, then clears it */}
			{removeConfirm}
		</Sheet>
	),
	List: ({ children }) => <View>{children}</View>,
	Row: RankDialogRow,
	AddPicker: ({ label, addableItems, onAdd }) => (
		<ChoiceSelect
			label={label}
			value=""
			presentation="sheet"
			options={addableItems.map((addableItem) => ({ value: addableItem.id, label: addableItem.label }))}
			onChange={(addedItemId) => {
				const addedItem = addableItems.find((addableItem) => addableItem.id === addedItemId)
				if (addedItem) {
					onAdd(addedItem)
				}
			}}
		/>
	),
	EmptyText: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	Footer: ({ isSaving, onCancel, onSave }) => (
		<View className="flex-row justify-end gap-2">
			<Button variant="outline" accessibilityLabel="Cancel" disabled={isSaving} onPress={onCancel}>
				<Text>Cancel</Text>
			</Button>
			<Button accessibilityLabel="Save order" disabled={isSaving} onPress={onSave}>
				<Text>{isSaving ? "Saving…" : "Save"}</Text>
			</Button>
		</View>
	),
	RemoveConfirm: ({ title, text, onConfirm, onClose }) => (
		<ConfirmDialog title={title} confirmLabel="Remove" onConfirm={async () => onConfirm()} onClose={onClose}>
			{text}
		</ConfirmDialog>
	),
}

/**
 * The list that orders the topics, podcast episodes, or Topic Posts a person pinned to their own profile, in the
 * app. Rows move with the step buttons, and the list opens in a sheet.
 */
export function RankDialog(props: Omit<ComponentProps<typeof SharedRankDialog>, "elements">) {
	return <SharedRankDialog {...props} elements={RANK_DIALOG_ELEMENTS} />
}

/**
 * The signed-in user's own profile pins in the app, opened from the screen of one of their topics, podcast episodes,
 * or Topic Posts.
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
			onError={() => showClientError(REQUEST_FAILED_TEXT)}
			elements={RANK_DIALOG_ELEMENTS}
		/>
	)
}
