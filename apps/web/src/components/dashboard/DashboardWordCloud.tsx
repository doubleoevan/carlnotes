// the web's word cloud for a Dashboard page: svg words laid out by the shared spiral, each sized by the count of the
// items whose titles hold it. the words spread out from the middle as the cloud draws, and a hover shows a word's count
// in a tooltip in the charts' tooltip colors
import type { DashboardWord } from "@carlnotes/contracts/dashboards"
import {
	DASHBOARD_CHART_HEIGHTS,
	DASHBOARD_CHART_IMAGE_LABELS,
	type DashboardChartProps,
	toDashboardPointLineGroups,
	toDashboardSeriesColor,
	toDashboardWordPoint,
} from "@carlnotes/core/lib/dashboardCharts"
import { type PlacedWord, toPlacedWords } from "@carlnotes/core/lib/wordCloud"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

// the cloud's height, and the width it lays out at before its box is measured
const WORD_CLOUD_HEIGHT = DASHBOARD_CHART_HEIGHTS.wordCloud
const STARTING_WIDTH = 480

// how long each word waits after the heavier word before it spreads out, in milliseconds
const SPREAD_STAGGER_MS = 25

/**
 * Draws the words heaviest first from the middle, in the series colors in turn.
 */
export function DashboardWordCloud({ data, playFormat, seriesColors }: DashboardChartProps<DashboardWord[]>) {
	// the box's width, followed as it changes
	const boxRef = useRef<HTMLDivElement>(null)
	const [width, setWidth] = useState(STARTING_WIDTH)
	useLayoutEffect(() => {
		if (!boxRef.current) {
			return
		}
		const resizeObserver = new ResizeObserver(([entry]) => entry && setWidth(Math.round(entry.contentRect.width)))
		resizeObserver.observe(boxRef.current)
		return () => resizeObserver.disconnect()
	}, [])

	// the laid out words
	const placedWords = useMemo(() => toPlacedWords(data, width, WORD_CLOUD_HEIGHT), [data, width])

	// the words start in the middle and spread to their places two frames later, again whenever the words change
	const [isSpread, setIsSpread] = useState(false)
	useEffect(() => {
		setIsSpread(false)
		const frame = requestAnimationFrame(() => requestAnimationFrame(() => setIsSpread(data.length > 0)))
		return () => cancelAnimationFrame(frame)
	}, [data])

	// the word under the pointer, whose tooltip shows its counts
	const [hoveredWord, setHoveredWord] = useState<PlacedWord | null>(null)
	const hoveredLineGroups = hoveredWord
		? toDashboardPointLineGroups(toDashboardWordPoint(data, hoveredWord.word), playFormat)
		: null
	return (
		<div className="relative w-full">
			{/* the cloud clips a word mid-spread, and the tooltip sits outside the clip so a top word's tooltip shows */}
			<div ref={boxRef} className="w-full overflow-hidden">
				<svg
					width={width}
					height={WORD_CLOUD_HEIGHT}
					viewBox={`0 0 ${width} ${WORD_CLOUD_HEIGHT}`}
					role="img"
					aria-label={DASHBOARD_CHART_IMAGE_LABELS.wordCloud}
					className="font-sans"
				>
					{placedWords.map((placedWord, i) => {
						const { word, x, y, fontSize } = placedWord
						const transform = isSpread
							? `translate(${x}px, ${y}px)`
							: `translate(${width / 2}px, ${WORD_CLOUD_HEIGHT / 2}px) scale(0.2)`
						return (
							// biome-ignore lint/a11y/noStaticElementInteractions: a pointer hover inside the svg, which names the image
							<text
								key={word}
								fontSize={fontSize}
								textAnchor="middle"
								dominantBaseline="central"
								fill={toDashboardSeriesColor(seriesColors, i)}
								className="cursor-default transition-[transform,opacity] duration-700 ease-out motion-reduce:transition-none"
								style={{ transform, opacity: isSpread ? 1 : 0, transitionDelay: `${i * SPREAD_STAGGER_MS}ms` }}
								onMouseEnter={() => setHoveredWord(placedWord)}
								onMouseLeave={() => setHoveredWord(null)}
							>
								{word}
							</text>
						)
					})}
				</svg>
			</div>

			{/* the hovered word's tooltip above it, its word over its counts, with the total plays under Both */}
			{hoveredWord && hoveredLineGroups && (
				<div
					role="tooltip"
					className="bg-popover text-popover-foreground pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border px-2.5 py-1.5 text-sm whitespace-nowrap shadow-md"
					style={{ left: hoveredWord.x, top: hoveredWord.y - hoveredWord.height / 2 - 4 }}
				>
					<strong className="block">{hoveredWord.word}</strong>
					{hoveredLineGroups.lines.map(({ line }) => (
						<span key={line} className="block">
							{line}
						</span>
					))}
					{hoveredLineGroups.totalLine && <span className="block font-semibold">{hoveredLineGroups.totalLine}</span>}
				</div>
			)}
		</div>
	)
}
