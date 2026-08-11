import { FLAG_REASON_MAX_CHARS } from "@shared/contracts"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { Textarea } from "@/components/primitives/textarea"
import { sendFlagContent } from "@/lib/flagContentClient"

/**
 * The flag dialog for a Topic or profile
 */
export function FlagContentDialog({
	subjectKind,
	subjectId,
	subjectLabel,
	onClose,
}: {
	subjectKind: "topic" | "profile"
	subjectId: string
	subjectLabel: string
	onClose: () => void
}) {
	const [reason, setReason] = useState("")
	const [isSending, setIsSending] = useState(false)

	// send the flag message, then close on success. a failure keeps the dialog open the show the rejection reason
	const handleSend = async (): Promise<void> => {
		setIsSending(true)
		try {
			await sendFlagContent({ subjectKind, subjectId, reason: reason.trim() })
			toast.success("Thanks for your report. Someone will take a look.")
			onClose()
		} catch (error) {
			console.error("flag failed", error)
			toast.error(error instanceof Error ? error.message : "The report did not send. Try again.")
		} finally {
			setIsSending(false)
		}
	}

	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent aria-describedby={undefined}>
				<DialogTitle>Report {subjectLabel}</DialogTitle>
				<p className="text-muted-foreground text-sm">What is wrong with it?</p>
				<Textarea
					value={reason}
					onChange={(event) => setReason(event.target.value)}
					maxLength={FLAG_REASON_MAX_CHARS}
					rows={4}
					aria-label="Why you are reporting this"
				/>
				<DialogFooter>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={handleSend} disabled={isSending || reason.trim().length === 0}>
						{isSending ? "Sending…" : "Send report"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
