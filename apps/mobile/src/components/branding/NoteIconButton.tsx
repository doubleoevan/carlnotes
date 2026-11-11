import type { LucideIcon } from "lucide-react-native"
import type { ComponentRef, ReactNode, Ref } from "react"
import { Pressable, type View } from "react-native"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { toTouchTargetHitSlop } from "@/components/primitives/button"

// the label and hint a screen reader reads, the tile's icon, whether the sheet it opens is open, the press, the
// content the tile follows on one line, and the view the sheet returns focus to
type NoteIconButtonProps = {
	label: string
	hint?: string
	icon?: LucideIcon
	isOpen: boolean
	onPress: () => void
	children?: ReactNode
	ref?: Ref<ComponentRef<typeof View>>
}

/**
 * Draws the note tile as the button that opens a note sheet, on its own or after the title it belongs to.
 */
export function NoteIconButton({ label, hint, icon, isOpen, onPress, children, ref }: NoteIconButtonProps) {
	return (
		<Pressable
			ref={ref}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityHint={hint}
			accessibilityState={{ expanded: isOpen }}
			hitSlop={toTouchTargetHitSlop(28)}
			onPress={onPress}
			className={
				children
					? "min-h-11 min-w-0 shrink flex-row items-center gap-2 active:opacity-75"
					: "min-h-7 min-w-7 shrink-0 items-center justify-center active:opacity-75"
			}
		>
			{children}
			<NoteIcon icon={icon} />
		</Pressable>
	)
}
