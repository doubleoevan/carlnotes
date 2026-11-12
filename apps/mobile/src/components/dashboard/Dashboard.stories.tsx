// a Dashboard screen's body with the app's elements, with the web stories' names: Carl's paragraph and the chart
// sections, every one open, with the pie and the trend on Skia and the map on react-native-maps
import { Dashboard, type DashboardProps } from "@carlnotes/core/components/Dashboard"
import {
	STORY_DASHBOARD_USER,
	STORY_PODCAST_DASHBOARD,
	STORY_TOPIC_DASHBOARD,
} from "@carlnotes/core/lib/dashboardStories"
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { useColorMode } from "@/theme"
import { MOBILE_DASHBOARD_ELEMENTS } from "./dashboardElements"

const meta = {
	title: "Dashboard/Dashboard",
	component: Dashboard,
	parameters: { webReference: "apps/web/src/components/dashboard/Dashboard.stories.tsx at 375px" },
	args: {
		dashboardKind: "topicDashboard",
		subjectId: STORY_DASHBOARD_USER.userId,
		hasFullAccess: false,
		isOwner: false,
		initialDashboard: STORY_TOPIC_DASHBOARD,
		seriesColors: toChartSeriesColors("light"),
		captureVisitEvent: () => {},
		onItemPress: () => {},
		elements: MOBILE_DASHBOARD_ELEMENTS,
	},
	render: (args) => <ThemedDashboard {...args} />,
} satisfies Meta<typeof Dashboard>

export default meta
type Story = StoryObj<typeof meta>

/** Topic Dashboard as a visitor reads it, with every chart section open and an item select at each card's top right. */
export const TopicDashboard: Story = {}

/** Podcast Dashboard, whose charts switch between Podcasts, Films, and Both. */
export const PodcastDashboard: Story = {
	args: { dashboardKind: "podcastDashboard", initialDashboard: STORY_PODCAST_DASHBOARD },
}

/** A Dashboard not built yet: each chart's empty card. The map still draws. */
export const NoVisitorsYet: Story = {
	args: {
		initialDashboard: {
			...STORY_TOPIC_DASHBOARD,
			paragraph: null,
			series: { bars: [], slices: [], trends: {}, words: [], pins: [] },
		},
	},
}

// the Dashboard in a scroll the width of the frame, its series in the toggle's theme
function ThemedDashboard(props: DashboardProps) {
	const colorMode = useColorMode()
	return (
		<ScrollView className="w-full">
			<Dashboard {...props} seriesColors={toChartSeriesColors(colorMode)} />
		</ScrollView>
	)
}
