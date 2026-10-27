import type { TopicDetails } from "@carlnotes/contracts/topics"
import { type TopicSourceRow, toTopicSourceRows } from "@carlnotes/core/lib/topicSources"
import { AudioLines, Diamond, Globe, Link, Plug, Puzzle, Rss } from "lucide-react-native"
import { Text, View } from "react-native"
import { Path } from "react-native-svg"
import { siBluesky, siReddit, siX, siYoutube } from "simple-icons"
import { ClassNameSvg } from "@/components/common/ClassNameSvg"
import { Icon } from "@/components/primitives/icon"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"
import { toTypeRoleStyle } from "@/typeRoleStyles"

// source marks match the web's neutral icons and provider logos
const SOURCE_ICONS = { web: Globe, url: Link, rss: Rss, podcast: AudioLines, composio: Plug, plugin: Puzzle }
const SOURCE_BRANDS = { reddit: siReddit, youtube: siYoutube, x: siX, bluesky: siBluesky }

/**
 * Lists the default and custom Sources with the web's summaries and processing states.
 */
export function TopicSources({ sources }: { sources: TopicDetails["sources"] }) {
	return (
		<View className="gap-1">
			{toTopicSourceRows(sources).map((source) => (
				<TopicSource key={source.id} {...source} />
			))}
		</View>
	)
}

// wrap long source summaries so the complete value stays available on a phone
function TopicSource({ sourceKind, summary, screeningMessage, isMuted }: TopicSourceRow) {
	return (
		<View className="flex-row items-start gap-1.5">
			<SourceIcon kind={sourceKind} />
			<Text
				style={toTypeRoleStyle("body")}
				className={isMuted || screeningMessage ? "shrink text-muted-foreground" : "shrink text-foreground"}
			>
				{sourceKind}
				<Text className="text-muted-foreground">
					{summary ? ` — ${summary}` : ""}
					{screeningMessage ? ` · ${screeningMessage}` : ""}
				</Text>
			</Text>
		</View>
	)
}

/**
 * Draws a Source provider's brand mark or fallback icon.
 */
export function SourceIcon({ kind }: { kind: string }) {
	// scale both kinds of source marks with the native text size
	const size = useFontScaledSize(14)
	const brand = SOURCE_BRANDS[kind as keyof typeof SOURCE_BRANDS]
	const sourceIcon = SOURCE_ICONS[kind as keyof typeof SOURCE_ICONS] ?? Diamond
	return (
		<View className="pt-1">
			{brand ? (
				<ClassNameSvg width={size} height={size} viewBox="0 0 24 24" className="text-muted-foreground">
					<Path d={brand.path} fill="currentColor" />
				</ClassNameSvg>
			) : (
				<Icon as={sourceIcon} className="size-3.5 text-muted-foreground" />
			)}
		</View>
	)
}
