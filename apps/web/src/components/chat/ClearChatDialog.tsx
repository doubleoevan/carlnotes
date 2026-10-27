import { CLEAR_CHAT_COPY } from "@carlnotes/core/lib/chatCopy"
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
	// returns whether the conversation was cleared, so a rejected clear shows nothing
	onConfirm: () => Promise<boolean>
	onClose: () => void
	// the one line naming what this chat loses, which is the only part that differs between them
	children: React.ReactNode
}) {
	return (
		<ConfirmDialog
			title={CLEAR_CHAT_COPY.title}
			confirmLabel={CLEAR_CHAT_COPY.confirm}
			cancelLabel={CLEAR_CHAT_COPY.cancel}
			onConfirm={async () => {
				if (await onConfirm()) {
					toast(CLEAR_CHAT_COPY.succeeded)
				}
				onClose()
			}}
			onClose={onClose}
		>
			{children}
		</ConfirmDialog>
	)
}
