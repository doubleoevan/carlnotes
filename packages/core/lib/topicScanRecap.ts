import type { scanStatuses } from "@carlnotes/contracts/enums"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import { isBudgetError } from "@carlnotes/contracts/scanFailure"
import { toTopicPath } from "@carlnotes/contracts/seo"
import type { ScanSourceResults } from "@carlnotes/contracts/topics"

// the fields a scan recap popover reads, shared by the topic page's scan history and the Activity subtable
export type ScanRecapFields = {
	// the outcome and, for a failed scan, its recorded reason, so the diary line matches what happened
	status: (typeof scanStatuses)[number]
	error: string | null
	startedAt: string
	finishedAt: string | null
	// set when the user stopped the scan, which is a different missing recap from a scan that simply had none written
	stoppedAt: string | null
	scanSummary: string | null
	// what each Source read and kept, null for a scan with no results
	sourceResults: ScanSourceResults | null
	costDollars: number | null
}

/**
 * The diary line standing in for a missing recap, in Carl's own voice: still reading while the scan runs,
 * what stopped a failed one, what a user's cancel interrupted, and for a scan that finished without notes,
 * that the findings are still there.
 */
export function toScanRecapPlaceholder(scan: Pick<ScanRecapFields, "status" | "error" | "stoppedAt">): string {
	// a failed scan shows what stopped it, naming the limit Carl hits most often
	if (scan.status === "failed") {
		return isBudgetError(scan.error) ? "Today I ran out of coffee." : "This one didn't brew."
	}

	// the user stopped this scan, so there was never a recap to write. what Carl had already kept still stands
	if (scan.stoppedAt) {
		return "Carl stopped brewing.\nThis was in the pot."
	}

	// a scan that never finished is still being read. the break renders through the placeholder's whitespace-pre-line
	if (scan.status === "running") {
		return "I'm on my fifteenth mug.\nThe internet was busy today…"
	}

	// it succeeded, so the findings are real even though writing them up failed
	return "No entry for this one.\nThe raccoon stole my keyboard.\nFindings are there though."
}

/**
 * The copied notes as Markdown for an AI: the linked topic title, the prompt, the note, and the numbered findings as Markdown links.
 */
export function toNotesMarkdown({
	topicId,
	topicName,
	prompt,
	note,
	findings,
	origin = "",
}: {
	topicId: string
	topicName: string
	prompt?: string
	note?: string | null
	findings?: TopicFinding[]
	origin?: string
}): string {
	// link the topic title to the supplied origin
	const title = `# [${topicName}](${origin}${toTopicPath({ id: topicId, name: topicName })})`
	const findingLines = (findings ?? []).map(
		(finding, index) =>
			`${index + 1}. [${finding.title ?? finding.url}](${finding.url}) — ${finding.relevanceExplanation}`,
	)
	return [title, prompt, note, findingLines.join("\n")].filter(Boolean).join("\n\n")
}
