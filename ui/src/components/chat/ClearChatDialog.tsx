// the clear confirmation both chat panels open from their ... menu
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"

/**
 * The confirmation standing between the Clear chat row and an emptied conversation. What clearing
 * costs differs by chat, so each panel writes its own warning, and the toast only reports a clear
 * the server confirmed.
 */
export function ClearChatDialog({
	onConfirm,
	onClose,
	children,
}: {
	// returns whether the conversation was cleared, so a refused clear says nothing
	onConfirm: () => Promise<boolean>
	onClose: () => void
	// the one line naming what this chat loses, which is the only part that differs between them
	children: React.ReactNode
}) {
	return (
		<ConfirmDialog
			title="Clear this chat?"
			confirmLabel="Clear it"
			cancelLabel="Keep it"
			onConfirm={async () => {
				if (await onConfirm()) {
					toast("Chat cleared.")
				}
				onClose()
			}}
			onClose={onClose}
		>
			{children}
		</ConfirmDialog>
	)
}
