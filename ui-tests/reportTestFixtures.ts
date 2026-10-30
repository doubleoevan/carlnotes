// the report entries that the report and approval tests build their fixture reports from
import type { ReportEntry } from "./imageCaptures"

/**
 * Returns a report entry for a web story in Latte at the phone size, with the given status and fields.
 */
export function toWebReportEntry(
	storyId: string,
	outcome: Partial<ReportEntry> & Pick<ReportEntry, "status">,
): ReportEntry {
	return {
		platform: "web",
		storyId,
		paletteName: "latte",
		sizeName: "phone",
		blockedUrls: [],
		imagePaths: {},
		accessibilityResult: { status: "checked", violations: [] },
		...outcome,
	} as ReportEntry
}
