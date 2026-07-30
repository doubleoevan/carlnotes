import type { TopicResponse } from "@shared/contracts"
import { Diamond, Globe, type LucideIcon, MessageCircle, Play, Plug, Puzzle, Rss } from "lucide-react"
import {
	cn,
	INFO_CARD_CLASS,
	toAgeLabel,
	toDollarLabel,
	toDurationLabel,
	toScheduleLabel,
	WEB_SOURCE,
} from "@/lib/utils"
import { CollapsibleSection } from "./CollapsibleSection"
import { InfoSection } from "./TopicInfo"

// each source's icon, keyed by the label the line renders. the web line is keyed by WEB_SOURCE's label
// rather than the "search" kind behind it. lucide carries no brand icons, so youtube and reddit take generic shapes
const SOURCE_ICON: Record<string, LucideIcon> = {
	web: Globe,
	rss: Rss,
	reddit: MessageCircle,
	youtube: Play,
	composio: Plug,
	plugin: Puzzle,
}

/**
 * The topic page's card for how the topic is brewed: where Carl looks, when he looks, and how much he keeps.
 * Who may see it reads as part of the topic itself, so visibility sits in the Topic roast card instead.
 */
export function TopicSettingsCard({ topic }: { topic: TopicResponse }) {
	// how long the last scan took, shown under the last scan age
	const lastScanDuration = toDurationLabel(topic.lastScanDurationMs)
	return (
		<CollapsibleSection value="blend" title="Artisanal Blend">
			<div className={INFO_CARD_CLASS}>
				<div className="divide-separator divide-y divide-dashed">
					<TopicSourcesSection sources={topic.sources} />

					{/* the frequency, its time and (weekly only) day, the last scan age, and how long that scan took */}
					<InfoSection label="Schedule">
						{toScheduleLabel(topic.frequency, topic.scheduledTime, topic.scheduledDayOfWeek)}
						<div className="text-muted-foreground mt-0.5 text-xs">
							last scan {topic.lastScanAt ? toAgeLabel(topic.lastScanAt) : "never"}
						</div>
						{lastScanDuration && <div className="text-muted-foreground text-xs">{lastScanDuration} taken</div>}
					</InfoSection>

					{/* how many findings a scan keeps, worded exactly like the edit modal's select */}
					<InfoSection label="Max results">{`Carl's top ${topic.maxResults}`}</InfoSection>

					{/* this month's total scan spend, visible to the owner or an admin */}
					{topic.monthCost !== null && (
						<InfoSection label="Cost this month">{toDollarLabel(topic.monthCost)}</InfoSection>
					)}
				</div>
			</div>
		</CollapsibleSection>
	)
}

// the sources section: the default web search line first, then one line per custom source
function TopicSourcesSection({ sources }: { sources: TopicResponse["sources"] }) {
	// the default source is the web search source. custom sources are everything else
	const hasSearchSource = sources.some((source) => source.kind === "search")
	const customSources = sources.filter((source) => source.kind !== "search")
	return (
		<InfoSection label="Sources">
			<div className="space-y-1">
				<TopicSource
					sourceKind={WEB_SOURCE.label}
					summary={hasSearchSource ? WEB_SOURCE.summary : "off"}
					isMuted={!hasSearchSource}
				/>
				{customSources.map((source) => (
					<TopicSource key={source.id} sourceKind={source.kind} summary={source.summary} />
				))}
			</div>
		</InfoSection>
	)
}

// one line in the sources section: the source icon, the source kind, and its config summary
function TopicSource({ sourceKind, summary, isMuted }: { sourceKind: string; summary: string; isMuted?: boolean }) {
	// a kind with no icon of its own still gets a neutral marker
	const SourceIcon = SOURCE_ICON[sourceKind] ?? Diamond
	return (
		<div className={cn("flex min-w-0 items-baseline gap-1.5", isMuted && "text-muted-foreground")}>
			{/* the icon rides the first line's baseline, so a summary that wraps keeps it beside the kind. an svg has
			    no baseline of its own, so it aligns by its box bottom and lands high. the nudge drops it onto the text */}
			<SourceIcon aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0 translate-y-0.5" />
			<span className="min-w-0 break-words">
				{sourceKind}
				{summary && <span className="text-muted-foreground"> — {summary}</span>}
			</span>
		</div>
	)
}
