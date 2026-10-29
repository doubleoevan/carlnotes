import {
	type TermsAcceptanceElements,
	TermsAcceptanceNotice,
	useIsTermsAcceptanceDialogOpen,
} from "@carlnotes/core/components/TermsAcceptanceNotice"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"

// the dialog's elements around the shared notice. closing it puts the acceptance off, as Not now does
const ELEMENTS: TermsAcceptanceElements = {
	Root: ({ title, onClose, children }) => (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent aria-describedby={undefined}>
				<DialogTitle>{title}</DialogTitle>
				{children}
			</DialogContent>
		</Dialog>
	),
	Text: ({ children }) => <p className="text-muted-foreground text-sm">{children}</p>,
	Links: ({ children }) => <div className="flex gap-4 text-sm">{children}</div>,
	Link: ({ href, children }) => (
		<AnchorLink href={href} className="sentence-link" isNewTab>
			{children}
		</AnchorLink>
	),
	Error: ({ children }) => <p className="text-destructive text-sm">{children}</p>,
	Actions: ({ children }) => <DialogFooter>{children}</DialogFooter>,
	Button: ({ label, onPress, isDisabled, isPrimary }) => (
		<Button variant={isPrimary ? "default" : "ghost"} onClick={onPress} disabled={isDisabled}>
			{label}
		</Button>
	),
}

/**
 * Asks a signed-in user whose accepted Terms version is older than the published one to accept it, or to put it off
 * until their next post. Mounted in the app shell, it shows on whichever page the session loads.
 */
export function TermsAcceptanceDialog() {
	const isNeeded = useIsTermsAcceptanceDialogOpen()
	if (!isNeeded) {
		return null
	}
	return <TermsAcceptanceNotice elements={ELEMENTS} />
}
