// a page's Share dialog: the platforms to post on, then the options that send the page to one person, then the copy
// link, each group under a divider
import { Link, Share } from "lucide-react"
import type { ReactNode } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import { MENU_DIVIDER_CLASS } from "@/lib/styleClasses"
import {
	COPY_PAGE_LABEL,
	CopyLinkOption,
	DisabledShareOption,
	POST_PLATFORM_TARGETS,
	SEND_TARGETS,
	SHARE_OPTION_CLASS,
	SHARE_OPTION_ICON_CLASS,
	ShareTargetOptions,
} from "./ShareOptions"
import type { usePageShare } from "./usePageShare"

// the dialog's heading, why posting and the share sheet are off or null while they are on, the page's share, and what
// closing does. the children are the options above the share sheet, such as a team's invite
type PageShareDialogProps = {
	heading: string
	disabledReason: string | null
	pageShare: ReturnType<typeof usePageShare>
	onClose: () => void
	children?: ReactNode
}

/**
 * Shows a page's Share dialog: the platforms, the options that send the page to one person, and the copy link.
 */
export function PageShareDialog({ heading, disabledReason, pageShare, onClose, children }: PageShareDialogProps) {
	const { title, url, onShareOptionClick, copiedLabel, isShareSheetAvailable, copyLink, sharePage } = pageShare

	// the url and title a platform needs, encoded once for use inside a query string, and whether the options are on
	const targetOptionProps = {
		isEnabled: disabledReason === null,
		encodedUrl: encodeURIComponent(url),
		encodedTitle: encodeURIComponent(title),
		reason: disabledReason ?? "",
		onPlatformOptionClick: onShareOptionClick,
	}
	return (
		<Dialog open onOpenChange={onClose}>
			{/* the tighter padding and gap keep the dialog to the topic share popover's own density */}
			<DialogContent className="gap-2 p-4 sm:max-w-xs">
				<DialogTitle>{heading}</DialogTitle>
				{/* one list, so the dialog's grid gap never falls between the options */}
				<div className="grid">
					<ShareTargetOptions shareTargets={POST_PLATFORM_TARGETS} {...targetOptionProps} />
					{/* a divider above the options that send the page to one person */}
					<div className={MENU_DIVIDER_CLASS} />
					{children}
					{/* the device's share sheet is above the send options if one can open */}
					{isShareSheetAvailable &&
						(disabledReason === null ? (
							<button type="button" onClick={() => void sharePage()} className={SHARE_OPTION_CLASS}>
								<Share className={SHARE_OPTION_ICON_CLASS} />
								Share…
							</button>
						) : (
							<DisabledShareOption
								label="Share…"
								icon={<Share className={SHARE_OPTION_ICON_CLASS} />}
								disabledReason={disabledReason}
							/>
						))}
					<ShareTargetOptions shareTargets={SEND_TARGETS} {...targetOptionProps} />
					{/* the copy link option sits under a divider */}
					<div className={MENU_DIVIDER_CLASS} />
					<CopyLinkOption
						label={COPY_PAGE_LABEL}
						icon={<Link className="size-4" />}
						className={SHARE_OPTION_CLASS}
						isCopied={copiedLabel === COPY_PAGE_LABEL}
						onCopy={() => copyLink(COPY_PAGE_LABEL, url)}
					/>
				</div>
			</DialogContent>
		</Dialog>
	)
}
