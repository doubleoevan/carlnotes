// the Dashboard's events: the view and the trend's range each send the Dashboard's properties and the choice alone,
// never an item's title. Carl's paragraph sits in the bar chart's card, with its placeholder there while it loads
import { expect, spyOn, test } from "bun:test"
import type { AnalyticsEventProperties, VisitAnalyticsEvent } from "@carlnotes/contracts/analyticsEvents"
import { Dashboard, type DashboardElements } from "@carlnotes/core/components/Dashboard"
import { STORY_TOPIC_DASHBOARD } from "@carlnotes/core/lib/dashboardStories"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

// a chart renderer that draws its name, so the test sees which charts drew
const toChartStub = (name: string) => () => <div data-chart={name} />

// plain elements a test can drive: native selects and divs for the rest
const ELEMENTS: DashboardElements = {
	BarChart: toChartStub("bar"),
	PieChart: toChartStub("pie"),
	WordCloud: toChartStub("wordCloud"),
	TrendChart: toChartStub("trend"),
	PlaceMap: toChartStub("map"),
	Rows: ({ children }) => <div>{children}</div>,
	PairRow: ({ children }) => <div>{children}</div>,
	Section: ({ value, children }) => <section data-section={value}>{children}</section>,
	Card: ({ controls, paragraph, children }) => (
		<div>
			{controls}
			{paragraph}
			{children}
		</div>
	),
	EmptyCard: ({ controls, paragraph, children }) => (
		<div>
			{controls}
			{paragraph}
			<p>{children}</p>
		</div>
	),
	LoadingCard: ({ controls, paragraph }) => (
		<div>
			{controls}
			{paragraph}
			<p>Loading</p>
		</div>
	),
	Paragraph: ({ children }) => <p data-paragraph>{children}</p>,
	ParagraphShape: () => <p data-paragraph-shape />,
	Select: ({ label, value, choices, onChange }) => (
		<select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
			{choices.map((choice) => (
				<option key={choice.value} value={choice.value}>
					{choice.label}
				</option>
			))}
		</select>
	),
	RadioGroup: { Group: ({ children }) => <div>{children}</div>, Option: () => null },
}

test("each control sends its event with the Dashboard's properties and its choice alone", async () => {
	// the events sent
	const sentEvents: [VisitAnalyticsEvent, AnalyticsEventProperties][] = []
	const harness = await renderTestHook(
		() => null,
		() => (
			<Dashboard
				dashboardKind="topicDashboard"
				subjectId="user-vienna"
				hasFullAccess={false}
				isOwner={false}
				initialDashboard={STORY_TOPIC_DASHBOARD}
				seriesColors={["#000"]}
				captureVisitEvent={(event, properties) => sentEvents.push([event, properties])}
				onItemPress={() => {}}
				elements={ELEMENTS}
			/>
		),
	)
	try {
		// the five charts draw from the server's read
		const { container } = harness
		expect([...container.querySelectorAll("[data-chart]")].map((chart) => chart.getAttribute("data-chart"))).toEqual([
			"bar",
			"pie",
			"wordCloud",
			"trend",
			"map",
		])
		// Carl's paragraph shows once, in the bar chart's card
		const paragraphs = [...container.querySelectorAll("[data-paragraph]")]
		expect(paragraphs.map((paragraph) => paragraph.closest("[data-section]")?.getAttribute("data-section"))).toEqual([
			"bar",
		])
		expect(paragraphs[0]?.textContent).toBe(STORY_TOPIC_DASHBOARD.paragraph ?? "")

		// the view is sent once
		const eventProperties = { dashboardKind: "topicDashboard", subjectId: "user-vienna", isOwner: false }
		expect(sentEvents).toEqual([["social_dashboard_view", eventProperties]])

		// the trend's range
		const rangeSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Trend range"]')
		await act(async () => {
			if (rangeSelect) {
				rangeSelect.value = "90"
				rangeSelect.dispatchEvent(new window.Event("change", { bubbles: true }) as unknown as Event)
			}
		})
		expect(sentEvents.slice(1)).toEqual([
			["social_dashboard_range_change", { ...eventProperties, chart: "trend", rangeDays: "90" }],
		])

		// no event names an item
		expect(JSON.stringify(sentEvents)).not.toContain("LLM tooling")
	} finally {
		await harness.close()
	}
})

test("the bar chart's loading card holds the paragraph's placeholder while the snapshot loads", async () => {
	// a snapshot read that never returns
	const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
		(() => new Promise(() => {})) as unknown as typeof fetch,
	)
	const harness = await renderTestHook(
		() => null,
		() => (
			<Dashboard
				dashboardKind="topicDashboard"
				subjectId="user-vienna"
				hasFullAccess={false}
				isOwner={false}
				initialDashboard={null}
				seriesColors={["#000"]}
				captureVisitEvent={() => {}}
				onItemPress={() => {}}
				elements={ELEMENTS}
			/>
		),
	)
	try {
		// one placeholder, in the bar chart's section
		const shapes = [...harness.container.querySelectorAll("[data-paragraph-shape]")]
		expect(shapes.map((shape) => shape.closest("[data-section]")?.getAttribute("data-section"))).toEqual(["bar"])
	} finally {
		await harness.close()
		fetchSpy.mockRestore()
	}
})
