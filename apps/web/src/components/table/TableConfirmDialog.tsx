import type { ConfirmationProps } from "@carlnotes/core/lib/tableElements"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"

/**
 * A table's delete confirmation in the confirm dialog, with its target linked to its page or else in bold.
 */
export function TableConfirmDialog({ title, confirmLabel, cancelLabel, body, onConfirm, onClose }: ConfirmationProps) {
	return (
		<ConfirmDialog
			title={title}
			confirmLabel={confirmLabel}
			cancelLabel={cancelLabel}
			onConfirm={onConfirm}
			onClose={onClose}
		>
			{body.beforeTarget}
			{body.targetHref ? (
				<AnchorLink href={body.targetHref} className="sentence-link">
					{body.target}
				</AnchorLink>
			) : (
				<span className="font-semibold">{body.target}</span>
			)}
			{body.afterTarget}
		</ConfirmDialog>
	)
}
