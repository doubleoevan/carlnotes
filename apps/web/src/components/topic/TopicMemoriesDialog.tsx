import { authClient } from "@carlnotes/client/authClient"
import {
	JOURNAL_BUTTON_ICON,
	JOURNAL_BUTTON_LABEL,
	TopicMemoriesDialog as SharedTopicMemoriesDialog,
	TAKEAWAYS_TITLE,
	toScanHistoryCounts,
} from "@carlnotes/core/components/TopicMemoriesDialog"
import { useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import { PLAIN_PAGE_BUTTON_CLASS, PLAIN_PAGE_BUTTON_ICON_CLASS } from "@/lib/styleClasses"
import { topicMemoriesDialogElements } from "./topicMemoriesDialogElements"

type TopicMemoriesDialogProps = {
	topicId: string
	entryCount: number
	takeawayCount?: number
	canRateTakeaways?: boolean
	onTakeawayRemoved?: () => void
}

/** Places the Journal next to the Brew diary's count and reads it on open. */
export function TopicMemoriesDialog({
	topicId,
	entryCount,
	takeawayCount,
	canRateTakeaways,
	onTakeawayRemoved,
}: TopicMemoriesDialogProps) {
	// use the normal dialog's focus behavior and return focus to the Journal button
	const { data: session } = authClient().useSession()
	const userId = session?.user.id ?? null
	const [isOpen, setIsOpen] = useState(false)
	const triggerRef = useRef<HTMLButtonElement>(null)
	return (
		<>
			{/* The Journal button is independent of the Brew diary's accordion trigger. */}
			<div className="flex min-w-0 max-w-[60%] flex-wrap items-center justify-end gap-2 sm:max-w-none">
				<span className="text-muted-foreground text-right text-sm">
					{toScanHistoryCounts(entryCount, takeawayCount)}
				</span>
				<button
					ref={triggerRef}
					type="button"
					aria-haspopup="dialog"
					aria-expanded={isOpen}
					className={PLAIN_PAGE_BUTTON_CLASS}
					onClick={() => setIsOpen(true)}
				>
					<span aria-hidden="true" className={PLAIN_PAGE_BUTTON_ICON_CLASS}>
						{JOURNAL_BUTTON_ICON}
					</span>
					{JOURNAL_BUTTON_LABEL}
				</button>
			</div>
			{isOpen && (
				<Dialog open onOpenChange={setIsOpen}>
					<DialogContent
						aria-describedby={undefined}
						onCloseAutoFocus={(event) => {
							event.preventDefault()
							triggerRef.current?.focus()
						}}
					>
						<DialogTitle>{TAKEAWAYS_TITLE}</DialogTitle>
						<SharedTopicMemoriesDialog
							key={`${topicId}:${userId ?? ""}`}
							topicId={topicId}
							userId={userId}
							elements={topicMemoriesDialogElements}
							canRateTakeaways={canRateTakeaways}
							onTakeawayRemoved={onTakeawayRemoved}
						/>
					</DialogContent>
				</Dialog>
			)}
		</>
	)
}
