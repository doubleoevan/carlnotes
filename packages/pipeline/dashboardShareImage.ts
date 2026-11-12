// a public Dashboard's share image. ECharts' server-side SVG renderer draws its bar chart in the Nightshift chart theme
// on a card, and resvg rasterizes it into the 1200 by 630 png the page head's og:image names
import { fileURLToPath } from "node:url"
import { DASHBOARD_PAGE_NAMES, type DashboardBar, type DashboardKind } from "@carlnotes/contracts/dashboards"
import { toCutText } from "@carlnotes/contracts/text"
import { toChartTheme } from "@carlnotes/nightshift/chartTheme"
import { latte } from "@carlnotes/nightshift/colors"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import { renderAsync } from "@resvg/resvg-js"
import * as echarts from "echarts"

// the image's size, the open graph image size
export const DASHBOARD_SHARE_IMAGE_WIDTH = 1200
export const DASHBOARD_SHARE_IMAGE_HEIGHT = 630

// how many bars the image draws, and how long a bar's title may run
const MAX_SHARE_IMAGE_BARS = 8
const MAX_BAR_TITLE_CHARS = 42

// the fonts resvg draws the svg's text in, read from the pipeline's font files
const FONTS_URL = new URL("./assets/fonts/", import.meta.url)
const FONT_FILES = ["ArchitectsDaughter-Regular.ttf", "Karla-Regular.ttf", "Karla-SemiBold.ttf"].map((fontFile) =>
	fileURLToPath(new URL(fontFile, FONTS_URL)),
)

// the page the image shares, and that page's bars at the public level
type ToDashboardShareImagePngOptions = { dashboardKind: DashboardKind; bars: DashboardBar[] }

/**
 * Draws a public Dashboard's share image from its bars and returns it as a png, or null for a Dashboard with no bars.
 */
export async function toDashboardShareImagePng({
	dashboardKind,
	bars,
}: ToDashboardShareImagePngOptions): Promise<Uint8Array | null> {
	if (bars.length === 0) {
		return null
	}

	// the svg, rasterized on a worker thread in the app's fonts alone
	const chartSvg = toDashboardShareImageSvg({ dashboardKind, bars })
	const renderedImage = await renderAsync(chartSvg, {
		fitTo: { mode: "width", value: DASHBOARD_SHARE_IMAGE_WIDTH },
		font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: fontFamilies.sans.name },
	})
	return renderedImage.asPng()
}

// the page's name above its top bars, largest first, on the light card
function toDashboardShareImageSvg({ dashboardKind, bars }: ToDashboardShareImagePngOptions): string {
	// the top bars, each title cut to fit beside its bar
	const topBars = bars.slice(0, MAX_SHARE_IMAGE_BARS)
	const chart = echarts.init(null, toChartTheme("light"), {
		renderer: "svg",
		ssr: true,
		width: DASHBOARD_SHARE_IMAGE_WIDTH,
		height: DASHBOARD_SHARE_IMAGE_HEIGHT,
	})

	// the page's name, then one horizontal bar per item with its count at its end
	chart.setOption({
		animation: false,
		backgroundColor: latte.card,
		title: {
			text: DASHBOARD_PAGE_NAMES[dashboardKind],
			left: 56,
			top: 40,
			textStyle: { fontFamily: fontFamilies.display.name, fontSize: 44, fontWeight: "normal", color: latte.foreground },
		},
		grid: { left: 56, right: 96, top: 130, bottom: 48, containLabel: true },
		xAxis: { type: "value", splitLine: { show: false }, axisLabel: { show: false } },
		yAxis: {
			type: "category",
			inverse: true,
			axisTick: { show: false },
			data: topBars.map(({ title }) => toCutText(title, MAX_BAR_TITLE_CHARS)),
			axisLabel: { fontSize: 22, color: latte.cardForeground },
		},
		series: [
			{
				type: "bar",
				barMaxWidth: 40,
				itemStyle: { borderRadius: [0, 6, 6, 0] },
				label: { show: true, position: "right", fontSize: 22, color: latte.mutedForeground },
				data: topBars.map(({ count }) => count),
			},
		],
	})

	// the svg string, with the chart's memory freed
	const chartSvg = chart.renderToSVGString()
	chart.dispose()
	return chartSvg
}
