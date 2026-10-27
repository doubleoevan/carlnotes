import type { TopicFinding } from "@carlnotes/contracts/findings"
import {
	type NumberedTopicFindingListComponents,
	NumberedTopicFindingList as SharedFindingList,
} from "@carlnotes/core/components/NumberedTopicFindingList"
import {
	SafeNoteLink,
	type SafeNoteLinkComponents,
	type SafeNoteLinkProps,
} from "@carlnotes/core/components/SafeNoteLink"
import {
	TopicScanFailure as SharedTopicScanFailure,
	type TopicScanFailureComponents,
} from "@carlnotes/core/components/TopicScanFailure"
import {
	TopicScanRecap as SharedTopicScanRecap,
	type TopicScanRecapComponents,
} from "@carlnotes/core/components/TopicScanRecap"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { toSafeNoteMarkdown } from "@carlnotes/core/lib/safeNoteMarkdown"
import { type ScanRecapFields, toNotesMarkdown } from "@carlnotes/core/lib/topicScanRecap"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import { astToNative } from "markdown-to-jsx/native"
import { View } from "react-native"
import { useCSSVariable } from "uniwind"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ScrollBox } from "@/components/common/ScrollBox"
import { type SourceRemoval, SourceResultsChart } from "@/components/common/SourceResultsChart"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * Presents the web's bounded diary, Source footnotes, duration, and permitted cost inside a native sheet.
 */
export function TopicScanRecap({
	scan,
	findings,
	topic,
	sourceRemoval,
}: {
	scan: ScanRecapFields
	findings: TopicFinding[]
	topic: { id: string; name: string; prompt: string; findings: TopicFinding[] }
	sourceRemoval?: SourceRemoval
}) {
	const copyMarkdown = toNotesMarkdown({
		topicId: topic.id,
		topicName: topic.name,
		prompt: topic.prompt,
		note: scan.scanSummary,
		findings,
		origin: SITE_URL,
	})
	return (
		<View>
			{scan.status === "failed" && <TopicScanFailure error={scan.error} />}
			<SharedTopicScanRecap
				scan={scan}
				findings={findings}
				allowedUrls={new Set(topic.findings.map((finding) => finding.url))}
				copyMarkdown={copyMarkdown}
				sourceRemoval={sourceRemoval}
				components={SCAN_RECAP_COMPONENTS}
			/>
		</View>
	)
}

// native text and scrolling adapt the shared diary to its sheet
const SCAN_RECAP_COMPONENTS: TopicScanRecapComponents = {
	ScrollBox,
	SafeNoteText,
	FindingList: NumberedTopicFindingList,
	SourceResultsChart,
	Placeholder: ({ children }) => <Text className="text-sm">{children}</Text>,
	Footer: ({ duration, costLabel }) => (
		<View className="mt-3 flex-row flex-wrap justify-between gap-3">
			<Text className="text-xs text-muted-foreground">{duration ? `${duration} taken` : ""}</Text>
			{costLabel !== null && <Text className="text-xs text-muted-foreground">cost: {costLabel}</Text>}
		</View>
	),
}

/**
 * Renders the web's safe Markdown subset in native text, with links restricted to stored Findings.
 */
export function SafeNoteText({ note, allowedUrls }: { note: string; allowedUrls?: ReadonlySet<string> }) {
	// use Nightshift's active colors and display headings for model-written notes
	const foreground = useCSSVariable("--color-foreground")
	const separator = useCSSVariable("--color-separator")
	const textStyle = {
		...toTypeRoleStyle("body"),
		color: typeof foreground === "string" ? foreground : undefined,
		lineHeight: 22.75,
	}
	const headingStyle = {
		...textStyle,
		fontFamily: fontFamilies.display.name,
		fontWeight: "400" as const,
		marginTop: 10,
		marginBottom: 4,
	}
	return astToNative(toSafeNoteMarkdown(note, allowedUrls), {
		disableParsingRawHTML: true,
		forceBlock: true,
		styles: {
			text: textStyle,
			paragraph: { marginVertical: 6 },
			strong: { fontWeight: "600" },
			heading1: headingStyle,
			heading2: headingStyle,
			heading3: headingStyle,
			heading4: headingStyle,
			heading5: headingStyle,
			heading6: headingStyle,
			thematicBreak: { borderColor: typeof separator === "string" ? separator : undefined, marginVertical: 10 },
		},
		overrides: { a: { component: FindingLink, props: { allowedUrls } }, img: { component: () => null } },
	})
}

// keep unsupported destinations visible as text and route allowed links through the app's link component
function FindingLink(props: SafeNoteLinkProps) {
	return <SafeNoteLink {...props} components={NOTE_LINK_COMPONENTS} />
}

// native links stay inline within Markdown paragraphs
const NOTE_LINK_COMPONENTS: SafeNoteLinkComponents = {
	Link: ({ href, children }) => (
		<AnchorLink href={href} accessibilityLabel={`Open ${href}`} asChild>
			<Text className="text-sm text-link underline">{children}</Text>
		</AnchorLink>
	),
	Text: ({ children }) => <Text className="text-sm">{children}</Text>,
}

/**
 * Shows the scan's numbered Finding links, sources, and relevance explanations.
 */
export function NumberedTopicFindingList({ findings }: { findings: TopicFinding[] }) {
	return <SharedFindingList findings={findings} components={FINDING_LIST_COMPONENTS} />
}

// platform list elements keep the shared Finding composition readable and accessible
const FINDING_LIST_COMPONENTS: NumberedTopicFindingListComponents = {
	List: ({ children }) => <View className="mt-3 gap-2.5">{children}</View>,
	Row: ({ children }) => <View>{children}</View>,
	Link: ({ href, title, children }) => (
		<AnchorLink href={href} accessibilityLabel={`Open ${title}`} className="min-h-11 justify-center active:opacity-75">
			<Text className="text-sm text-link">{children}</Text>
		</AnchorLink>
	),
	Source: ({ children }) => <Text className="text-xs text-muted-foreground">{children}</Text>,
	Explanation: ({ children }) => (
		<Text selectable className="mt-0.5 text-sm leading-relaxed">
			{children}
		</Text>
	),
}

/**
 * Shares the web's actionable failure feedback between the diary and Topic roast.
 */
export function TopicScanFailure({ error }: { error: string | null }) {
	return (
		<View className="mb-3">
			<SharedTopicScanFailure error={error} components={SCAN_FAILURE_COMPONENTS} />
		</View>
	)
}

// inline links and native button targets adapt the shared recovery actions
const SCAN_FAILURE_COMPONENTS: TopicScanFailureComponents = {
	Message: ({ isPaused, children }) => (
		<Text className={isPaused ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{children}</Text>
	),
	Budget: ({ children }) => <View className="gap-2">{children}</View>,
	UpgradeLine: ({ children }) => <View className="flex-row flex-wrap items-center gap-1">{children}</View>,
	Text: ({ children }) => <Text className="text-sm text-destructive">{children}</Text>,
	Link: ({ href, isButton, children }) =>
		isButton ? (
			<Button asChild size="sm" accessibilityLabel={String(children)}>
				<AnchorLink href={`${SITE_URL}${href}`} accessibilityLabel={String(children)}>
					<Text>{children}</Text>
				</AnchorLink>
			</Button>
		) : (
			<AnchorLink href={`${SITE_URL}${href}`} accessibilityLabel={String(children)} asChild>
				<Text className="text-sm text-link underline">{children}</Text>
			</AnchorLink>
		),
}
