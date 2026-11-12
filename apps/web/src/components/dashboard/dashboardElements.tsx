// the web's elements for the shared Dashboard: the Activity page's accordion of sections with every one open,
// table cards around the charts, and the small select and the radio buttons at each card's top right
import type { DashboardElements } from "@carlnotes/core/components/Dashboard"
import type { TeamDropdownElements } from "@carlnotes/core/components/TeamDropdown"
import {
	DASHBOARD_CHART_PLACEHOLDER_HEIGHT,
	type DashboardChartRenderers,
	dashboardChartNames,
} from "@carlnotes/core/lib/dashboardCharts"
import { cn } from "@carlnotes/nightshift/classNames"
import { createContext, type ReactNode, use, useId } from "react"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { AccordionSection } from "@/components/common/AccordionSection"
import { Accordion } from "@/components/primitives/accordion"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { TableCard } from "@/components/table/TableCard"
import { SECTIONS_UNDER_AVATAR_HEADER_CLASS, SKELETON_SHAPE_CLASS } from "@/lib/styleClasses"

// a highlighted select: the primary fill, as a page's highlighted button, with its chevron in the text over it
const HIGHLIGHTED_SELECT_CLASS =
	"bg-primary text-primary-foreground hover:bg-primary/90 border-transparent [&_svg]:text-primary-foreground! [&_svg]:opacity-100"

/**
 * Returns the web's Dashboard elements with a chart renderer set.
 */
export function toWebDashboardElements(chartRenderers: DashboardChartRenderers): DashboardElements {
	return { ...WEB_DASHBOARD_ELEMENTS, ...chartRenderers }
}

// the web's elements around the charts
const WEB_DASHBOARD_ELEMENTS: Omit<DashboardElements, keyof DashboardChartRenderers> = {
	// the accordion with every section open, and the pie beside the word cloud from 48rem
	Rows: ({ children }) => (
		<Accordion type="multiple" defaultValue={[...dashboardChartNames]} className={SECTIONS_UNDER_AVATAR_HEADER_CLASS}>
			{children}
		</Accordion>
	),
	// the pair's last section is never the page's last, so it keeps its divider while closed as the first one does
	PairRow: ({ children }) => (
		<div className="grid grid-cols-1 gap-x-6 *:min-w-0 md:grid-cols-2 [&>[data-state=closed]:last-child]:border-b">
			{children}
		</div>
	),
	Section: ({ value, title, titleEmoji, children }) => (
		<AccordionSection
			value={value}
			title={
				titleEmoji ? (
					<>
						{title} <span aria-hidden="true">{titleEmoji}</span>
					</>
				) : (
					title
				)
			}
			isContentKept
		>
			{children}
		</AccordionSection>
	),

	// the chart's card, its empty card with its line in the middle at the chart's height, and its loading card, each with
	// the chart's controls at its top right, Carl's paragraph under them if the card has it, and its body a gap below
	Card: ({ controls, paragraph, children }) => (
		<TableCard className="mb-2">
			<CardControls>{controls}</CardControls>
			{paragraph}
			<div className="mt-3">{children}</div>
		</TableCard>
	),
	EmptyCard: ({ controls, paragraph, height, children }) => (
		<TableCard className="mb-2">
			<CardControls>{controls}</CardControls>
			{paragraph}
			<p className="text-muted-foreground mt-3 flex items-center justify-center text-lg" style={{ height }}>
				{children}
			</p>
		</TableCard>
	),
	LoadingCard: ({ controls, paragraph }) => (
		<TableCard className="mb-2">
			<CardControls>{controls}</CardControls>
			{paragraph}
			<div className="mt-3">
				<ChartPlaceholder />
			</div>
		</TableCard>
	),

	// Carl's paragraph in the bar chart's card in the display font, as if in his hand, and its placeholder of three lines hidden from assistive technology
	Paragraph: ({ children }) => (
		<p className="font-display antialiased leading-relaxed tracking-wide mt-3">{children}</p>
	),
	ParagraphShape: () => (
		<div aria-hidden="true" className="mt-3">
			{PARAGRAPH_SHAPE_LINE_CLASSES.map((lineClass) => (
				<div key={lineClass} className="flex h-[1.625rem] items-center">
					<span className={cn(SKELETON_SHAPE_CLASS, "h-4", lineClass)} />
				</div>
			))}
		</div>
	),

	// the small select at a card's top right, named for assistive tech, and the team dropdown highlighted in the primary
	// color. a choice's icon shows in the list, and the button shows the chosen label alone
	Select: ({ label, value, choices, onChange, isHighlighted }) => (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger size="sm" aria-label={label} className={isHighlighted ? HIGHLIGHTED_SELECT_CLASS : undefined}>
				<SelectValue>{choices.find((choice) => choice.value === value)?.label}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{choices.map((choice) => (
					<SelectItem key={choice.value} value={choice.value}>
						{choice.icon}
						{choice.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	),

	// a podcast chart's Podcasts, Films, and Both as one row of radio buttons, the chosen one highlighted
	RadioGroup: { Group: RadioButtonGroup, Option: RadioButton },
}

// the web's team dropdown elements: the Dashboard's select, and the team's avatar at the size of the select's text
export const WEB_TEAM_DROPDOWN_ELEMENTS: TeamDropdownElements = {
	Select: WEB_DASHBOARD_ELEMENTS.Select,
	TeamAvatar: ({ team }) => <TeamAvatar team={team} className="size-5" />,
}

// the widths of the paragraph placeholder's lines, the last one short like a paragraph's end
const PARAGRAPH_SHAPE_LINE_CLASSES = ["w-full", "w-11/12", "w-2/3"]

// a card's controls, at its top right
function CardControls({ children }: { children: ReactNode }) {
	return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
}

// the radio group's name, which its options share so the arrow keys move between them
const RadioGroupNameContext = createContext("")

// the row of radio buttons, named for assistive tech by its hidden legend
function RadioButtonGroup({ label, children }: { label: string; children: ReactNode }) {
	return (
		<fieldset className="bg-card flex rounded-md border p-0.5 shadow-xs">
			<legend className="sr-only">{label}</legend>
			<RadioGroupNameContext value={useId()}>{children}</RadioGroupNameContext>
		</fieldset>
	)
}

// one radio button: the native input, hidden, under its highlighted label
function RadioButton({ label, isSelected, onSelect }: { label: string; isSelected: boolean; onSelect: () => void }) {
	return (
		<label className="cursor-pointer">
			<input
				type="radio"
				name={use(RadioGroupNameContext)}
				checked={isSelected}
				onChange={onSelect}
				className="peer sr-only"
			/>
			<span
				className={cn(
					"peer-focus-visible:ring-ring/50 block rounded px-2 py-1 text-xs font-medium peer-focus-visible:ring-2",
					isSelected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
				)}
			>
				{label}
			</span>
		</label>
	)
}

/**
 * Shows a chart's placeholder while its code or its selection loads.
 */
export function ChartPlaceholder() {
	return <div className={SKELETON_SHAPE_CLASS} style={{ height: DASHBOARD_CHART_PLACEHOLDER_HEIGHT }} />
}
