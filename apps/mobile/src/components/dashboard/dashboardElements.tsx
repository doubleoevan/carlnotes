// the app's elements for the shared Dashboard: the Activity screen's open-by-default sections, table cards
// around the charts, the choice select and the radio buttons at each card's top right, and a bottom sheet for a tapped
// point with its page's button
import { toTeamAvatarImagePath } from "@carlnotes/contracts/avatars"
import type { DashboardElements } from "@carlnotes/core/components/Dashboard"
import {
	DashboardPointDetail,
	type DashboardPointDetailElements,
} from "@carlnotes/core/components/DashboardPointDetail"
import type { TeamDropdownElements } from "@carlnotes/core/components/TeamDropdown"
import { DASHBOARD_CHART_PLACEHOLDER_HEIGHT } from "@carlnotes/core/lib/dashboardCharts"
import { cn } from "@carlnotes/nightshift/classNames"
import { Children, type ReactNode } from "react"
import { Pressable, View } from "react-native"
import { Avatar } from "@/components/branding/Avatar"
import { ChoiceSelect } from "@/components/common/ChoiceSelect"
import { ScrollBox } from "@/components/common/ScrollBox"
import { Sheet } from "@/components/common/Sheet"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { TableCard } from "@/components/table/TableCard"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { SKELETON_SHAPE_CLASS } from "@/sectionClasses"
import { DashboardBarChart } from "./DashboardBarChart"
import { DashboardPieChart } from "./DashboardPieChart"
import { DashboardTrendChart } from "./DashboardTrendChart"
import { DashboardWordCloud } from "./DashboardWordCloud"
import { PlaceMap } from "./PlaceMap"

// the drawn height of a radio button, which its hit slop raises to the touch target
const RADIO_BUTTON_HEIGHT = 28

/**
 * The app's Dashboard elements: the sections, cards, controls, and the sheet a tapped point opens.
 */
export const MOBILE_DASHBOARD_ELEMENTS: DashboardElements = {
	// the app's chart renderers
	BarChart: DashboardBarChart,
	PieChart: DashboardPieChart,
	WordCloud: DashboardWordCloud,
	TrendChart: DashboardTrendChart,
	PlaceMap,

	// the sections, each open, and the pie beside the word cloud on a wide screen
	Rows: ({ children }) => <View className="mt-2">{children}</View>,
	PairRow: ({ children }) => (
		<View className="md:flex-row md:gap-6">
			{Children.map(children, (child) => (
				<View className="md:min-w-0 md:flex-1">{child}</View>
			))}
		</View>
	),
	// every section but the map, the last, keeps a divider under it while closed, as on the web
	Section: ({ value, title, titleEmoji, children }) => (
		<CollapsibleSection title={title} titleEmoji={titleEmoji} isContentKept hasClosedDivider={value !== "map"}>
			{children}
		</CollapsibleSection>
	),

	// the chart's card, its empty card with its line in the middle at the chart's height, and its loading card, each with
	// Carl's paragraph under the controls if the card has it
	Card: ({ controls, paragraph, children }) => (
		<ChartCard controls={controls} paragraph={paragraph}>
			{children}
		</ChartCard>
	),
	EmptyCard: ({ controls, paragraph, height, children }) => (
		<ChartCard controls={controls} paragraph={paragraph}>
			<View className="items-center justify-center" style={{ height }}>
				<Text className="text-lg text-muted-foreground">{children}</Text>
			</View>
		</ChartCard>
	),
	LoadingCard: ({ controls, paragraph }) => (
		<ChartCard controls={controls} paragraph={paragraph}>
			<SkeletonPulse>
				<View className={SKELETON_SHAPE_CLASS} style={{ height: DASHBOARD_CHART_PLACEHOLDER_HEIGHT }} />
			</SkeletonPulse>
		</ChartCard>
	),

	// Carl's paragraph in the bar chart's card in the display font, as if in his hand, and its placeholder of three lines hidden from assistive technology
	Paragraph: ({ children }) => (
		<Text className="mt-3 font-display font-normal leading-relaxed tracking-wide">{children}</Text>
	),
	ParagraphShape: () => (
		<SkeletonPulse>
			<View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="mt-3">
				{PARAGRAPH_SHAPE_LINE_CLASSES.map((lineClass) => (
					<View key={lineClass} className="h-[1.625rem] justify-center">
						<View className={cn(SKELETON_SHAPE_CLASS, "h-4", lineClass)} />
					</View>
				))}
			</View>
		</SkeletonPulse>
	),

	// the choice select at a card's top right, and the team dropdown highlighted in the primary color. a choice's icon
	// shows in the list, and the button shows the chosen label alone
	Select: ({ label, value, choices, onChange, isHighlighted }) => (
		<ChoiceSelect
			label={label}
			value={value}
			options={choices}
			isHighlighted={isHighlighted}
			isTriggerIconShown={false}
			onChange={onChange}
		/>
	),

	// a podcast chart's Podcasts, Films, and Both as one row of radio buttons, the chosen one highlighted
	RadioGroup: {
		Group: ({ label, children }) => (
			<View
				accessibilityRole="radiogroup"
				accessibilityLabel={label}
				className="flex-row rounded-md border border-border bg-card p-0.5"
			>
				{children}
			</View>
		),
		Option: ({ label, isSelected, onSelect }) => (
			<Pressable
				accessibilityRole="radio"
				accessibilityLabel={label}
				accessibilityState={{ checked: isSelected }}
				hitSlop={toTouchTargetHitSlop(RADIO_BUTTON_HEIGHT)}
				onPress={onSelect}
				className={cn("min-h-7 justify-center rounded px-2 py-1", isSelected && "bg-primary")}
			>
				<Text className={cn("text-xs font-medium", isSelected ? "text-primary-foreground" : "text-muted-foreground")}>
					{label}
				</Text>
			</Pressable>
		),
	},

	// a tapped point's detail in a bottom sheet titled with the point, its lines, and its page's button
	PointDetail: ({ point, playFormat, onClose, onItemPress }) =>
		point && (
			<Sheet title={point.title} onClose={onClose}>
				<DashboardPointDetail
					point={point}
					playFormat={playFormat}
					onItemPress={(path) => {
						onClose()
						onItemPress(path)
					}}
					elements={POINT_DETAIL_ELEMENTS}
				/>
			</Sheet>
		),
}

/**
 * The app's team dropdown elements: the Dashboard's select, and the team's avatar at the size of the select's text.
 */
export const MOBILE_TEAM_DROPDOWN_ELEMENTS: TeamDropdownElements = {
	Select: MOBILE_DASHBOARD_ELEMENTS.Select,
	TeamAvatar: ({ team }) => (
		<Avatar
			ownerId={team.teamId}
			name={team.name}
			imageUrl={team.avatarVersion ? toTeamAvatarImagePath(team.teamId, team.avatarVersion) : null}
			size={20}
		/>
	),
}

// the web's max-h-56 for the items' scroll box
const DETAIL_ITEMS_MAX_HEIGHT = 224

// the sheet's detail, with its title in the sheet's header and its items in a scroll box. a line and an item show their
// swatch, and an item opens its page if it has one
const POINT_DETAIL_ELEMENTS: DashboardPointDetailElements = {
	Title: () => null,
	Line: ({ children, color }) => (
		<View className="flex-row items-center gap-2">
			{color && <View className="size-2 rounded-full" style={{ backgroundColor: color }} />}
			<Text className="text-sm text-popover-foreground">{children}</Text>
		</View>
	),
	Items: ({ children }) => (
		<View className="my-1">
			<ScrollBox maxHeight={DETAIL_ITEMS_MAX_HEIGHT}>{children}</ScrollBox>
		</View>
	),
	Item: ({ children, countLine, color, onPress }) => (
		<View className="flex-row items-baseline gap-3 py-1">
			{color && <View className="size-2 self-center rounded-full" style={{ backgroundColor: color }} />}
			{onPress ? (
				<Pressable accessibilityRole="link" onPress={onPress} hitSlop={8} className="min-w-0 flex-1">
					<Text numberOfLines={1} className="text-sm text-link">
						{children}
					</Text>
				</Pressable>
			) : (
				<Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-popover-foreground">
					{children}
				</Text>
			)}
			<Text className="text-sm text-muted-foreground">{countLine}</Text>
		</View>
	),
	Total: ({ children, isStartAligned }) => (
		<Text
			className={cn("mt-1 text-sm font-semibold text-popover-foreground", isStartAligned ? "self-start" : "self-end")}
		>
			{children}
		</Text>
	),
	OpenButton: ({ children, label, onPress }) => (
		<Button variant="outline" className="mt-3 self-start" accessibilityLabel={label} onPress={onPress}>
			<Text>{children}</Text>
		</Button>
	),
}

// the widths of the paragraph placeholder's lines, the last one short like a paragraph's end
const PARAGRAPH_SHAPE_LINE_CLASSES = ["w-full", "w-11/12", "w-2/3"]

// a chart's card, with the chart's controls at its top right, Carl's paragraph under them if the card has it, and its
// body a gap below
function ChartCard({
	controls,
	paragraph,
	children,
}: {
	controls: ReactNode
	paragraph?: ReactNode
	children: ReactNode
}) {
	return (
		<TableCard className="mb-2 p-4">
			<View className="flex-row flex-wrap items-center justify-end gap-2">{controls}</View>
			{paragraph}
			<View className="mt-3">{children}</View>
		</TableCard>
	)
}
