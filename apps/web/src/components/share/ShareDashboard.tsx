import { type DashboardKind, toDashboardPath } from "@carlnotes/contracts/dashboards"
import { useOrigin } from "@/hooks/useBrowserValue"
import { captureVisitEvent } from "@/lib/visitAnalytics"
import { PageShareDialog } from "./PageShareDialog"
import { usePageShare } from "./usePageShare"

/**
 * Shows a Dashboard page's Share dialog: the platforms, the device's share sheet, the send options, and the copy link,
 * each sharing the page's url, whose card is the page's share image.
 */
export function ShareDashboard({
	dashboardKind,
	subjectId,
	title,
	onClose,
}: {
	dashboardKind: DashboardKind
	subjectId: string
	title: string
	onClose: () => void
}) {
	// the page's absolute url, which a platform needs
	const pageUrl = `${useOrigin()}${toDashboardPath({ dashboardKind, subjectId })}`

	// report a share by its channel with the Dashboard's kind and subject id
	const handleShareOptionClick = (channel: string): void =>
		captureVisitEvent("social_dashboard_share", { dashboardKind, subjectId, channel })

	// the copy and the share sheet for the page's url
	const pageShare = usePageShare({ title, url: pageUrl, onShareOptionClick: handleShareOptionClick })

	// every option on, with no invite
	return <PageShareDialog heading={`Share ${title}`} disabledReason={null} pageShare={pageShare} onClose={onClose} />
}
