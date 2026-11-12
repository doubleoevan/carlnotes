// the html of a chart's hover tooltip: a title in bold over its rows, each line with its color's swatch if it has one,
// and the total in bold at the bottom right, every title and line escaped
import type { DashboardPlayFormat } from "@carlnotes/contracts/dashboards"
import { type DashboardPoint, toDashboardPointLineGroups } from "@carlnotes/core/lib/dashboardCharts"
import { format } from "echarts/core"

/**
 * Returns a point's tooltip html: its title over its detail lines, each with its swatch if it has one, and its total.
 */
export function toPointTooltipHtml(point: DashboardPoint, playFormat: DashboardPlayFormat | null): string {
	const { lines, itemLines, totalLine } = toDashboardPointLineGroups(point, playFormat)
	const lineRows = [...lines, ...itemLines].map(
		({ line, color }) =>
			`<div style="display:flex;align-items:center;gap:8px">${color ? toSwatchHtml(color) : ""}${format.encodeHTML(line)}</div>`,
	)
	return toTooltipFrameHtml(point.title, lineRows, totalLine)
}

/**
 * Returns a tooltip's html: the title in bold over rows of html, then the total in bold at the bottom right if it has
 * one.
 */
export function toTooltipFrameHtml(title: string, rows: string[], totalLine: string | null): string {
	const totalHtml = totalLine
		? `<div style="text-align:right;font-weight:600">${format.encodeHTML(totalLine)}</div>`
		: ""
	return [`<strong>${format.encodeHTML(title)}</strong>`, ...rows, totalHtml].join("")
}

/**
 * Returns a series color's round swatch for a tooltip's line.
 */
export function toSwatchHtml(color: string): string {
	return `<span style="width:8px;height:8px;border-radius:9999px;flex-shrink:0;background:${color}"></span>`
}
