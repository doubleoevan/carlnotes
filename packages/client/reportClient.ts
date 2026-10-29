// the admin console's report calls: the open reports, and resolving one
import { type AdminReport, adminReportsResponse, type ReportResolution } from "@carlnotes/contracts/reports"
import { apiClient } from "./apiClient"

/**
 * Reads the open reports, newest first. Throws an error on a rejection.
 */
export async function fetchAdminReports(): Promise<AdminReport[]> {
	const response = await apiClient().api.admin.reports.$get()
	if (!response.ok) {
		throw new Error(`reports failed: ${response.status}`)
	}
	return adminReportsResponse.parse(await response.json()).reports
}

/**
 * Resolves one report by removing its content or keeping it. Throws an error on a rejection.
 */
export async function sendReportResolution(reportId: string, resolution: ReportResolution): Promise<void> {
	const response = await apiClient().api.admin.reports[":id"].resolve.$post({
		param: { id: reportId },
		json: { resolution },
	})
	if (!response.ok) {
		throw new Error(`report resolution failed: ${response.status}`)
	}
}
