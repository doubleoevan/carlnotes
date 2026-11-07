// the flag on a comment, filled if the user reported the row, and pressing it filled removes that report
import type { ReportedSubjectQuery } from "@carlnotes/contracts/payloads"
import type { JSX } from "react"
import { useKnownSubjectReport, useReportPress } from "../hooks/useSubjectReport"
import type { SocialElements } from "../lib/socialElements"
import { toReportLabel } from "../lib/socialLabels"

// the platform's flag, the row it reports, whether the row's read found the user's report, and opening the report dialog
type SocialReportControlProps = {
	Report: SocialElements["Report"]
	subject: ReportedSubjectQuery
	isReported: boolean
	onReport: () => void
}

/**
 * Renders the flag of one row. What this session sent or removed outranks the row's read.
 */
export function SocialReportControl({ Report, subject, isReported, onReport }: SocialReportControlProps): JSX.Element {
	const isFlagFilled = useKnownSubjectReport(subject) ?? isReported
	const handleReportPress = useReportPress(subject, onReport)
	return (
		<Report
			label={toReportLabel(isFlagFilled)}
			isReported={isFlagFilled}
			onPress={() => handleReportPress(isFlagFilled)}
		/>
	)
}
