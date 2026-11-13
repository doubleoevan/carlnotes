import { fromTopicPostBodyImagePath } from "@carlnotes/contracts/topicPostBodyImages"
import { toReportImageLabel } from "@carlnotes/core/lib/socialLabels"
import type { TopicPostBodyImageReport } from "@carlnotes/core/lib/topicPosts"
import { Flag } from "lucide-react"
import { type RefObject, useEffect, useState } from "react"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog"
import { Button } from "@/components/primitives/button"

// one body image's button: what its report names and where it sits, from the body's top right corner
type ReportButtonPlacement = { report: TopicPostBodyImageReport; top: number; right: number }

// the gap between an image's corner and its button
const CORNER_GAP_PX = 8

// what the buttons need: the rendered body they sit over, and what a report of each image names
type TopicPostBodyImageReportButtonsProps = {
	bodyRef: RefObject<HTMLDivElement | null>
	bodyImageReports: TopicPostBodyImageReport[]
	onReportClosed: () => void
}

/**
 * Puts a Report image button at the top right corner of each body image a reader may report, over the rendered body.
 */
export function TopicPostBodyImageReportButtons({
	bodyRef,
	bodyImageReports,
	onReportClosed,
}: TopicPostBodyImageReportButtonsProps) {
	const placements = useReportButtonPlacements(bodyRef, bodyImageReports)
	const [openReport, setOpenReport] = useState<TopicPostBodyImageReport | null>(null)

	// a closed dialog reads the post again
	const handleClose = (): void => {
		setOpenReport(null)
		onReportClosed()
	}
	return (
		<>
			{placements.map(({ report, top, right }, i) => (
				<Button
					// biome-ignore lint/suspicious/noArrayIndexKey: an image shown twice has a button at each place
					key={i}
					variant="secondary"
					size="icon-sm"
					aria-label={`Report ${report.subjectLabel}`}
					title={toReportImageLabel(false)}
					className="absolute rounded-full opacity-70 shadow-raised hover:opacity-100 focus-visible:opacity-100"
					style={{ top, right }}
					onClick={() => setOpenReport(report)}
				>
					<Flag />
				</Button>
			))}
			{/* the report dialog mounts only while open */}
			{openReport && (
				<ReportIssueDialog
					subjectKind={openReport.subjectKind}
					subjectId={openReport.subjectId}
					subjectLabel={openReport.subjectLabel}
					onClose={handleClose}
				/>
			)}
		</>
	)
}

// each reportable image's button placement, read again as the body renders, loads images, and resizes
function useReportButtonPlacements(
	bodyRef: RefObject<HTMLDivElement | null>,
	bodyImageReports: TopicPostBodyImageReport[],
): ReportButtonPlacement[] {
	const [placements, setPlacements] = useState<ReportButtonPlacement[]>([])
	useEffect(() => {
		const body = bodyRef.current
		if (!body || bodyImageReports.length === 0) {
			setPlacements([])
			return
		}

		// each rendered img whose src names a reportable image, placed from the body's top right corner
		const reportsByImageId = new Map(bodyImageReports.map((report) => [report.imageId, report]))
		const placeButtons = (): void => {
			const bodyRect = body.getBoundingClientRect()
			const nextPlacements = [...body.querySelectorAll("img")].flatMap((img) => {
				const imagePath = fromTopicPostBodyImagePath(new URL(img.src, window.location.origin).pathname)
				const report = imagePath && reportsByImageId.get(imagePath.imageId)
				if (!report) {
					return []
				}
				const imgRect = img.getBoundingClientRect()
				return [
					{
						report,
						top: imgRect.top - bodyRect.top + CORNER_GAP_PX,
						right: bodyRect.right - imgRect.right + CORNER_GAP_PX,
					},
				]
			})
			setPlacements(nextPlacements)
		}

		// the body renders after mount, and its images load and reflow it
		placeButtons()
		const mutationObserver = new MutationObserver(placeButtons)
		mutationObserver.observe(body, { childList: true, subtree: true })
		const resizeObserver = new ResizeObserver(placeButtons)
		resizeObserver.observe(body)
		body.addEventListener("load", placeButtons, true)
		return () => {
			mutationObserver.disconnect()
			resizeObserver.disconnect()
			body.removeEventListener("load", placeButtons, true)
		}
	}, [bodyRef, bodyImageReports])
	return placements
}
