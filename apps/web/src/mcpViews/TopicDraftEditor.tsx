import { maxTopicFindingsOptions, type Visibility, visibilities } from "@carlnotes/contracts/enums"
import { CUSTOM_SOURCE_OPTIONS, DEFAULT_SOURCES } from "@carlnotes/contracts/sources"
import type { AddTopicSourcePayload, TopicDraft } from "@carlnotes/contracts/topicPayloads"
import { MAX_TOPIC_SOURCES, TOPIC_NAME_CHARS, TOPIC_PROMPT_CHARS } from "@carlnotes/contracts/topics"
import { useId, useRef } from "react"
import { FieldLabel } from "@/components/common/FieldLabel"
import { ScrollBox } from "@/components/common/ScrollBox"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Switch } from "@/components/primitives/switch"
import { Textarea } from "@/components/primitives/textarea"
import { ScheduleFields } from "@/components/topic/EditTopicFields"
import { TagPicker } from "@/components/topic/TagPicker"
import { useMcpViewData } from "./mcpViewHost"
import { countMcpTopicDraftSources } from "./topicDraftSources"

type TopicDraftEditorProps = {
	topicDraft: TopicDraft
	isDisabled: boolean
	onChange: (draft: TopicDraft) => void
	isPrivateSendDestination?: boolean
	shouldFillHeight?: boolean
}

/**
 * Edits a private MCP Topic Draft with the Topic editor's existing field controls.
 */
export function TopicDraftEditor({
	topicDraft,
	isDisabled,
	onChange,
	isPrivateSendDestination = false,
	shouldFillHeight = false,
}: TopicDraftEditorProps) {
	// associate fields with their labels across several MCP views in one host
	const id = useId()
	const { topicDraftOptions } = useMcpViewData()
	const sourceCount = countMcpTopicDraftSources(topicDraft.sources)
	const sourceIds = useRef(new WeakMap<AddTopicSourcePayload, string>())
	const toSourceId = (source: AddTopicSourcePayload): string => {
		const existingId = sourceIds.current.get(source)
		if (existingId) {
			return existingId
		}
		const sourceId = crypto.randomUUID()
		sourceIds.current.set(source, sourceId)
		return sourceId
	}
	return (
		<ScrollBox
			className={
				shouldFillHeight ? "h-full max-h-none overscroll-contain" : "h-[40rem] max-h-[40rem] overscroll-contain"
			}
			boxClassName={shouldFillHeight ? "bg-card min-h-0 flex-1" : "bg-card min-h-0"}
		>
			<fieldset disabled={isDisabled} className="min-w-0 space-y-4 p-4" aria-label="Edit Topic Draft">
				{/* identity and scoring prompt */}
				<div>
					<FieldLabel htmlFor={`${id}-name`} isRequired>
						Title
					</FieldLabel>
					<Input
						id={`${id}-name`}
						value={topicDraft.name}
						maxLength={TOPIC_NAME_CHARS}
						onChange={(event) => onChange({ ...topicDraft, name: event.target.value })}
					/>
				</div>
				<div>
					<FieldLabel htmlFor={`${id}-prompt`} isRequired>
						{"Carl's Prompt"}
					</FieldLabel>
					<Textarea
						id={`${id}-prompt`}
						className="min-h-32"
						value={topicDraft.prompt}
						maxLength={TOPIC_PROMPT_CHARS}
						onChange={(event) => onChange({ ...topicDraft, prompt: event.target.value })}
					/>
				</div>
				<div>
					<FieldLabel>Tags</FieldLabel>
					<TagPicker
						tags={topicDraft.tags}
						knownTags={[...new Set([...(topicDraftOptions?.knownTags ?? []), ...topicDraft.tags])]}
						canCreate
						onTagsChange={(tags) => onChange({ ...topicDraft, tags })}
					/>
				</div>
				{/* scheduling keeps server-side plan validation */}
				<ScheduleFields
					frequency={topicDraft.frequency}
					onFrequencyChange={(frequency) => onChange({ ...topicDraft, frequency })}
					hasDailySlot
					dailyTopicsRemaining={undefined}
					dailyTopicLimit={undefined}
					shouldShowQuota={false}
					scheduledTime={topicDraft.scheduledTime}
					onScheduledTimeChange={(scheduledTime) => onChange({ ...topicDraft, scheduledTime })}
					scheduledDayOfWeek={topicDraft.scheduledDayOfWeek}
					onScheduledDayOfWeekChange={(scheduledDayOfWeek) => onChange({ ...topicDraft, scheduledDayOfWeek })}
				/>
				<div>
					<FieldLabel htmlFor={`${id}-findings`}>Max findings</FieldLabel>
					<Select
						value={String(topicDraft.maxTopicFindings)}
						onValueChange={(value) => onChange({ ...topicDraft, maxTopicFindings: Number(value) })}
					>
						<SelectTrigger id={`${id}-findings`}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{maxTopicFindingsOptions.map((value) => (
								<SelectItem key={value} value={String(value)}>{`Carl's top ${value}`}</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center justify-between gap-3">
					<FieldLabel htmlFor={`${id}-podcast`}>Coffee Break podcast</FieldLabel>
					<Switch
						id={`${id}-podcast`}
						checked={topicDraft.isPodcastEnabled ?? false}
						onCheckedChange={(isPodcastEnabled) => onChange({ ...topicDraft, isPodcastEnabled })}
					/>
				</div>
				{/* new send destinations start private */}
				<div>
					<FieldLabel>Visibility</FieldLabel>
					{isPrivateSendDestination ? (
						<p className="text-sm">Private</p>
					) : (
						<Select
							value={topicDraft.visibility}
							onValueChange={(value) => onChange({ ...topicDraft, visibility: value as Visibility })}
						>
							<SelectTrigger aria-label="Visibility">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{visibilities.map((value) => (
									<SelectItem key={value} value={value}>
										{value}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</div>
				<div>
					<FieldLabel>{`Sources · ${sourceCount} of ${MAX_TOPIC_SOURCES}`}</FieldLabel>
					{DEFAULT_SOURCES.map((source) => (
						<p key={source.key} className="mb-2 text-sm">
							{source.label}
						</p>
					))}
					<div className="space-y-3">
						{topicDraft.sources.map((source, index) => (
							<SourceEditor
								key={toSourceId(source)}
								source={source}
								index={index}
								onChange={(nextSource) => {
									sourceIds.current.set(nextSource, toSourceId(source))
									onChange({
										...topicDraft,
										sources: topicDraft.sources.map((current, position) => (position === index ? nextSource : current)),
									})
								}}
								onRemove={() =>
									onChange({ ...topicDraft, sources: topicDraft.sources.filter((_, position) => position !== index) })
								}
							/>
						))}
					</div>
					<Button
						type="button"
						variant="outline"
						className="mt-3"
						disabled={sourceCount >= MAX_TOPIC_SOURCES}
						onClick={() =>
							onChange({ ...topicDraft, sources: [...topicDraft.sources, { sourceOption: "url", value: "" }] })
						}
					>
						Add Source
					</Button>
					{sourceCount > MAX_TOPIC_SOURCES && (
						<p role="alert" className="text-destructive mt-2 text-sm">
							Remove a Source before creating this Topic. Every chat link is kept here for your review.
						</p>
					)}
				</div>
			</fieldset>
		</ScrollBox>
	)
}

// edit custom Source options and values with the standard select, input, and button
function SourceEditor({
	source,
	index,
	onChange,
	onRemove,
}: {
	source: AddTopicSourcePayload
	index: number
	onChange: (source: AddTopicSourcePayload) => void
	onRemove: () => void
}) {
	return (
		<div className="space-y-2">
			<Select
				value={source.sourceOption}
				onValueChange={(value) => onChange({ ...source, sourceOption: value as AddTopicSourcePayload["sourceOption"] })}
			>
				<SelectTrigger aria-label={`Source ${index + 1} type`}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{CUSTOM_SOURCE_OPTIONS.map((option) => (
						<SelectItem key={option.key} value={option.key}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<div className="flex items-center gap-2">
				<Input
					aria-label={`Source ${index + 1} value`}
					value={source.value}
					onChange={(event) => onChange({ ...source, value: event.target.value })}
				/>
				<Button type="button" size="sm" variant="outline" aria-label={`Remove Source ${index + 1}`} onClick={onRemove}>
					Remove
				</Button>
			</div>
		</div>
	)
}
