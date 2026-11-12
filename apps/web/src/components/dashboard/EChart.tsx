// one ECharts chart in a box, drawn in the Nightshift chart theme of the page's color mode with the svg renderer, kept
// to its box's width, and redrawn in place when its option or the color mode changes. only the bar, pie, and line
// charts are registered here, so a page loads no other chart code
import { toChartTheme } from "@carlnotes/nightshift/chartTheme"
import { BarChart, LineChart, PieChart } from "echarts/charts"
import { GridComponent, TooltipComponent } from "echarts/components"
import { type EChartsCoreOption, type EChartsType, init, use } from "echarts/core"
import { SVGRenderer } from "echarts/renderers"
import { useEffect, useRef } from "react"
import { useColorMode } from "@/hooks/useColorMode"

use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, SVGRenderer])

// a chart event's handler, given the event's params and the chart. an axis label's event names its axis as the
// component and its label as the value, with the pointer's place in the event
export type EChartEventHandler = (
	params: {
		dataIndex: number
		seriesIndex?: number
		componentType?: string
		value?: unknown
		event?: { offsetX: number; offsetY: number }
	},
	chart: EChartsType,
) => void

// a pointer event's handler anywhere on the chart, given the pointer's place in pixels and the chart
export type EChartPointerHandler = (pixel: [number, number], chart: EChartsType) => void

// the chart's option, its height, or its largest height under an aspect ratio, its name for assistive tech, its events
// by name, such as click, and its pointer events by name anywhere on the chart, such as mousemove
type EChartProps = {
	option: EChartsCoreOption
	height: number
	aspectRatio?: string
	label: string
	events?: Record<string, EChartEventHandler>
	pointerEvents?: Record<string, EChartPointerHandler>
}

/**
 * Draws one chart that fills its box's width at a fixed height, or at the aspect ratio up to that height.
 */
export function EChart({ option, height, aspectRatio, label, events, pointerEvents }: EChartProps) {
	const boxRef = useRef<HTMLDivElement>(null)
	const chartRef = useRef<EChartsType | null>(null)
	// an option waiting for the box to have a size. ECharts throws an error on a map drawn into a box of no size
	const pendingOptionRef = useRef<EChartsCoreOption | null>(null)
	const colorMode = useColorMode()

	// start the chart in the color mode's theme, follow the box's size, and dispose of the chart on unmount. ECharts
	// skips a theme set before the chart's first option, and the theme effect below follows a later change
	// biome-ignore lint/correctness/useExhaustiveDependencies: the chart starts once, in the color mode it mounts in
	useEffect(() => {
		const box = boxRef.current
		if (!box) {
			return
		}
		const chart = init(box, toChartTheme(colorMode), { renderer: "svg" })
		chartRef.current = chart
		const resizeObserver = new ResizeObserver(() => {
			chart.resize()
			if (pendingOptionRef.current && box.clientWidth > 0) {
				chart.setOption(pendingOptionRef.current, { notMerge: true })
				pendingOptionRef.current = null
			}
		})
		resizeObserver.observe(box)
		return () => {
			resizeObserver.disconnect()
			chart.dispose()
			chartRef.current = null
		}
	}, [])

	// the color mode's theme, the option, and the events, each replaced in place. the option waits while the box has
	// no width
	useEffect(() => {
		chartRef.current?.setTheme(toChartTheme(colorMode))
	}, [colorMode])
	useEffect(() => {
		const chart = chartRef.current
		if (!chart || (boxRef.current?.clientWidth ?? 0) === 0) {
			pendingOptionRef.current = option
			return
		}
		pendingOptionRef.current = null
		chart.setOption(option, { notMerge: true })
	}, [option])
	useEffect(() => {
		const chart = chartRef.current
		if (!chart || !events) {
			return
		}
		const eventEntries = Object.entries(events)
		for (const [eventName, handleEvent] of eventEntries) {
			chart.on(eventName, (params) => handleEvent(params as Parameters<EChartEventHandler>[0], chart))
		}
		return () => {
			for (const [eventName] of eventEntries) {
				chart.off(eventName)
			}
		}
	}, [events])
	useEffect(() => {
		const chart = chartRef.current
		if (!chart || !pointerEvents) {
			return
		}
		const zrender = chart.getZr()
		const pointerHandlers = Object.entries(pointerEvents).map(([eventName, handlePointer]) => {
			const handleEvent = ({ offsetX, offsetY }: { offsetX: number; offsetY: number }) =>
				handlePointer([offsetX, offsetY], chart)
			zrender.on(eventName, handleEvent)
			return [eventName, handleEvent] as const
		})
		return () => {
			for (const [eventName, handleEvent] of pointerHandlers) {
				zrender.off(eventName, handleEvent)
			}
		}
	}, [pointerEvents])
	return (
		<div
			ref={boxRef}
			role="img"
			aria-label={label}
			style={aspectRatio ? { aspectRatio, maxHeight: height } : { height }}
			className="w-full"
		/>
	)
}
