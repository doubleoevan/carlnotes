// the signed-in user's report of a subject: whether they reported it, sending a report, and removing it
import { showClientError, showClientMessage } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import { fetchIsSubjectReported, sendFlagContent, sendReportRemoval } from "@carlnotes/client/flagContentClient"
import type { FlagContentPayload, ReportedSubjectQuery } from "@carlnotes/contracts/payloads"
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { REPORT_DIALOG_COPY } from "../lib/reportCopy"
import { toReportLabel } from "../lib/socialLabels"

// the query key of one subject's reported state
function toReportedSubjectKey(subject?: ReportedSubjectQuery): unknown[] {
	return ["reportedSubject", subject?.subjectKind, subject?.subjectId]
}

/**
 * Returns whether the user reported a subject as far as this session knows, or undefined if it has not sent, removed,
 * or read a report of it. A row that lists its own reported state prefers this, without a read from the api.
 */
export function useKnownSubjectReport(subject: ReportedSubjectQuery): boolean | undefined {
	const { data: isReported } = useQuery<boolean>({ queryKey: toReportedSubjectKey(subject), queryFn: skipToken })
	return isReported
}

/**
 * Returns whether the signed-in user reported a subject. A page with no subject skips the read.
 */
function useIsSubjectReported(subject?: ReportedSubjectQuery): boolean {
	const { data: session } = authClient().useSession()

	// this session's sends and removals write the same key, so the first read stays current
	const { data: isReported = false } = useQuery({
		queryKey: toReportedSubjectKey(subject),
		queryFn: subject && session ? () => fetchIsSubjectReported(subject) : skipToken,
		staleTime: Number.POSITIVE_INFINITY,
	})
	return isReported
}

/**
 * Returns the call that sends a report and marks its subject reported. The call throws an error on a rejection.
 */
export function useSendReport(): (payload: FlagContentPayload) => Promise<void> {
	const queryClient = useQueryClient()
	return async (payload) => {
		await sendFlagContent(payload)
		queryClient.setQueryData(toReportedSubjectKey(payload), true)
	}
}

/**
 * Returns the press of a report flag: it removes the user's report if the flag is filled, and otherwise opens the
 * report dialog.
 */
export function useReportPress(
	subject: ReportedSubjectQuery | undefined,
	onReport: () => void,
): (isReported: boolean) => void {
	const queryClient = useQueryClient()
	return (isReported) => {
		if (!isReported || !subject) {
			onReport()
			return
		}

		// the flag empties and a toast confirms once the api removed the report. a failure leaves the flag filled
		const { subjectKind, subjectId } = subject
		sendReportRemoval({ subjectKind, subjectId })
			.then(() => {
				// clear the cached report flag
				queryClient.setQueryData(toReportedSubjectKey(subject), false)
				showClientMessage(REPORT_DIALOG_COPY.removed)
			})
			.catch(() => showClientError(REPORT_DIALOG_COPY.removeFailed))
	}
}

/**
 * Returns a report flag's state, label, and press. The press opens the report dialog through isReporting, or through
 * onReport for a caller that keeps that state itself.
 */
export function useSubjectReportFlag(
	subject?: ReportedSubjectQuery,
	onReport?: () => void,
): { isReported: boolean; label: string; press: () => void; isReporting: boolean; closeReport: () => void } {
	const [isReporting, setIsReporting] = useState(false)
	const isReported = useIsSubjectReported(subject)
	const handleReportPress = useReportPress(subject, onReport ?? (() => setIsReporting(true)))
	return {
		isReported,
		label: toReportLabel(isReported),
		press: () => handleReportPress(isReported),
		isReporting,
		closeReport: () => setIsReporting(false),
	}
}
