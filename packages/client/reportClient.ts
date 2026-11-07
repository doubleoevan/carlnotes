// the admin console's report calls: the open reports, their count for the badge, and resolving one
import {
	type AdminReport,
	adminReportCountResponse,
	adminReportsResponse,
	type ReportResolution,
} from "@carlnotes/contracts/reports"
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
 * Reads the open report count. Throws an error on a rejection.
 */
export async function fetchOpenReportCount(): Promise<number> {
	const response = await apiClient().api.admin.reports.count.$get()
	if (!response.ok) {
		throw new Error(`report count failed: ${response.status}`)
	}
	return adminReportCountResponse.parse(await response.json()).openReportCount
}

/**
 * Resolves one report by removing its content, putting an admin block on its author, or clearing it. Throws an error on a rejection.
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
