import { FLAG_REASON_MAX_CHARS } from "@carlnotes/contracts/chat"
import type { FlagContentPayload } from "@carlnotes/contracts/payloads"
import type { UserIdentity } from "@carlnotes/contracts/profiles"
import { useSendReport } from "@carlnotes/core/hooks/useSubjectReport"
import { REPORT_DIALOG_COPY, toReportDialogTitle } from "@carlnotes/core/lib/reportCopy"
import { toUserBlockAuthorLabel } from "@carlnotes/core/lib/userBlocks"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { Label } from "@/components/primitives/label"
import { Switch } from "@/components/primitives/switch"
import { Textarea } from "@/components/primitives/textarea"

// what a report names: its subject, and the subject's author if a report can block them
export type ReportSubject = {
	subjectKind: FlagContentPayload["subjectKind"]
	subjectId: string
	subjectLabel: string
	author?: UserIdentity
}

/**
 * The report dialog for a Topic, profile, Team, chat room message, note, or note comment, with the author blocked in
 * the same submission if the reporter asks.
 */
export function ReportIssueDialog({
	subjectKind,
	subjectId,
	subjectLabel,
	author,
	onClose,
}: ReportSubject & { onClose: () => void }) {
	const [reason, setReason] = useState("")
	const [shouldBlockAuthor, setShouldBlockAuthor] = useState(false)
	const [isSending, setIsSending] = useState(false)
	const sendReport = useSendReport()

	// send the report, then close on success. a failure keeps the dialog open to show the rejection reason
	const handleSend = async (): Promise<void> => {
		setIsSending(true)
		try {
			await sendReport({ subjectKind, subjectId, reason: reason.trim(), shouldBlockAuthor })
			toast.success(shouldBlockAuthor ? REPORT_DIALOG_COPY.sentWithUserBlock : REPORT_DIALOG_COPY.sent)
			onClose()
		} catch (error) {
			console.error("flag failed", error)
			toast.error(error instanceof Error ? error.message : REPORT_DIALOG_COPY.failed)
		} finally {
			setIsSending(false)
		}
	}

	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent aria-describedby={undefined}>
				<DialogTitle>{toReportDialogTitle(subjectLabel)}</DialogTitle>
				<p className="text-muted-foreground text-sm">{REPORT_DIALOG_COPY.question}</p>
				<Textarea
					value={reason}
					onChange={(event) => setReason(event.target.value)}
					maxLength={FLAG_REASON_MAX_CHARS}
					aria-label={REPORT_DIALOG_COPY.reasonLabel}
					// four lines tall before it grows with the reason. the field sizes to its content, which ignores rows
					className="min-h-24"
				/>
				{/* the author's user block, in the same submission */}
				{author && (
					<div className="flex items-center gap-2">
						<Switch id="block-author" checked={shouldBlockAuthor} onCheckedChange={setShouldBlockAuthor} />
						<Label htmlFor="block-author">{toUserBlockAuthorLabel(author.username)}</Label>
					</div>
				)}
				<DialogFooter>
					<Button variant="ghost" onClick={onClose}>
						{REPORT_DIALOG_COPY.cancel}
					</Button>
					<Button onClick={handleSend} disabled={isSending}>
						{isSending ? REPORT_DIALOG_COPY.sending : REPORT_DIALOG_COPY.send}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
