import { authClient } from "@carlnotes/client/authClient"
import {
	JOURNAL_BUTTON_ICON,
	JOURNAL_BUTTON_LABEL,
	TopicMemoriesDialog as SharedTopicMemoriesDialog,
	toScanHistoryCounts,
	toTopicMemoriesTitle,
} from "@carlnotes/core/components/TopicMemoriesDialog"
import { cn } from "@carlnotes/nightshift/classNames"
import { useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import { PLAIN_PAGE_BUTTON_CLASS, PLAIN_PAGE_BUTTON_ICON_CLASS, POPOVER_HEADING_CLASS } from "@/lib/styleClasses"
import { topicMemoriesDialogElements } from "./topicMemoriesDialogElements"

type TopicMemoriesDialogProps = {
	topicId: string
	entryCount: number
	topicMemoryCount?: number
	canRateTopicMemories?: boolean
	onTopicMemoryRemoved?: () => void
}

/** Places the Journal next to the Brew diary's count and reads it on open. */
export function TopicMemoriesDialog({
	topicId,
	entryCount,
	topicMemoryCount,
	canRateTopicMemories,
	onTopicMemoryRemoved,
}: TopicMemoriesDialogProps) {
	// use the normal dialog's focus behavior and return focus to the Journal button
	const { data: session } = authClient().useSession()
	const userId = session?.user.id ?? null
	const [isOpen, setIsOpen] = useState(false)
	const triggerRef = useRef<HTMLButtonElement>(null)
	return (
		<>
			{/* The Journal button is independent of the Brew diary's accordion trigger. */}
			<div className="contents sm:flex sm:items-center sm:justify-end sm:gap-2">
				<span className="whitespace-nowrap text-muted-foreground text-right text-sm">
					{toScanHistoryCounts(entryCount, topicMemoryCount)}
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
						className="gap-0 pt-4 [&>[data-slot=dialog-close]]:top-1 [&>[data-slot=dialog-close]]:right-1"
						onCloseAutoFocus={(event) => {
							event.preventDefault()
							triggerRef.current?.focus()
						}}
					>
						<DialogTitle className={cn(POPOVER_HEADING_CLASS, "pl-8 leading-7")}>
							{toTopicMemoriesTitle(topicMemoryCount)}
						</DialogTitle>
						<div className="grid gap-4">
							<SharedTopicMemoriesDialog
								key={`${topicId}:${userId ?? ""}`}
								topicId={topicId}
								userId={userId}
								elements={topicMemoriesDialogElements}
								canRateTopicMemories={canRateTopicMemories}
								onTopicMemoryRemoved={onTopicMemoryRemoved}
							/>
						</div>
					</DialogContent>
				</Dialog>
			)}
		</>
	)
}
