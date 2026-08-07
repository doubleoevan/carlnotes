import {
	MAX_ATTACHMENT_CONTEXT_CHARS,
	MAX_TOPIC_SOURCES,
	type TopicResponse,
	type UpdateTopicPayload,
} from "@shared/contracts"
import { daysOfWeek, type frequencies, isDailyFrequency, maxResultsOptions, visibilities } from "@shared/enums"
import { ADMIN_QUOTA } from "@shared/plans"
import { Coffee, X } from "lucide-react"
import type * as React from "react"
import { useRef, useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { Input } from "@/components/primitives/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { ScanQuotaLink } from "@/components/topic/ScanQuotaLink"
import { TagPicker, TagPill } from "@/components/topic/TagPicker"
import { TimePicker } from "@/components/topic/TimePicker"
import {
	DailyTopicLimitError,
	sendAttachmentContext,
	sendAttachmentDelete,
	sendTopicCreate,
	sendTopicUpdate,
	uploadTopicAttachment,
} from "@/lib/topicClient"
import { capitalize, toBrewsWord, toPossibleSourceUrls } from "@/lib/utils"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { stageFiles, TopicAttachmentEditor } from "./TopicAttachmentEditor"
import { TopicPromptComposer } from "./TopicPromptComposer"
import { type EditableSourceKind, FULL_SOURCES_NOTE, TopicSourceEditor } from "./TopicSourceEditor"

// the field unions that the frequency, day-of-week, and visibility selects offer
type Frequency = (typeof frequencies)[number]
type DayOfWeek = (typeof daysOfWeek)[number]
type Visibility = (typeof visibilities)[number]

// the topic and its callbacks
type EditTopicModalProps = {
	topic?: TopicResponse
	onClose: () => void
	onTopicSaved: (topicId: string) => Promise<void>
}

// the emoji shown for each visibility option
const VISIBILITY_EMOJI: Record<Visibility, string> = { private: "🔒", public: "🌐", invite: "✉️" }

// the topic scan frequencies in the order the menu offers them, cheapest first
const FREQUENCY_OPTIONS = ["weekly", "weekdays", "daily"] as const satisfies readonly Frequency[]

/**
 * The edit topic modal for editing or creating a new topic.
 */
export function EditTopicModal({ topic, onClose, onTopicSaved }: EditTopicModalProps) {
	// the title input ref to focus it on open
	const titleInputRef = useRef<HTMLInputElement>(null)
	// sends the user to pricing when a daily schedule is at the plan's limit
	const navigate = useNavigate()
	// every tag across the loaded feed to seed the tag picker's suggestions, and the topicFeed which has the daily slots left
	const { knownTags, topicFeed } = useTopicFeed()
	// the editable topic fields which are empty for a new topic
	const [name, setName] = useState(topic?.name ?? "")
	const [prompt, setPrompt] = useState(topic?.prompt ?? "")
	const [tags, setTags] = useState(topic?.tags ?? [])
	const [frequency, setFrequency] = useState<Frequency>(topic?.frequency ?? "weekly")
	const [scheduledTime, setScheduledTime] = useState(topic?.scheduledTime ?? "09:00")
	const [scheduledDayOfWeek, setScheduledDayOfWeek] = useState<DayOfWeek>(topic?.scheduledDayOfWeek ?? "monday")
	const [visibility, setVisibility] = useState<Visibility>(topic?.visibility ?? "private")
	const [maxResults, setMaxResults] = useState(topic?.maxResults ?? 10)
	const [invitees, setInvitees] = useState(topic?.invitees ?? [])
	// the kept and added source and attachment lists. a new topic starts with the default web source on
	const [keptSources, setKeptSources] = useState(topic?.sources ?? [])
	const [addedSources, setAddedSources] = useState<{ sourceKind: EditableSourceKind; value: string }[]>(
		topic ? [] : [{ sourceKind: "search", value: "" }],
	)
	const [keptAttachments, setKeptAttachments] = useState(topic?.attachments ?? [])
	const [pendingFiles, setPendingFiles] = useState<File[]>([])

	// the urls this edit will not turn into Sources
	const [dismissedSourceUrls, setDismissedSourceUrls] = useState<string[]>(() =>
		toPossibleSourceUrls(topic?.prompt ?? "", topic?.sources ?? [], []),
	)

	// a url written in the prompt becomes a Source on save unless it is dismissed here first
	const promptSourceUrls = toPossibleSourceUrls(prompt, keptSources, addedSources).filter(
		(url) => !dismissedSourceUrls.includes(url),
	)

	// only attachments that have finished processing have a context to read, so a staged or failed attachment is not included.
	// the joined contexts are clipped to what the request accepts, since each attachment may carry that much on its own
	const attachmentContext = keptAttachments
		.filter((attachment) => attachment.status === "ready" && attachment.context)
		.map((attachment) => attachment.context)
		.join("\n\n")
		.slice(0, MAX_ATTACHMENT_CONTEXT_CHARS)

	const [isSaving, setIsSaving] = useState(false)

	// handleSave creates or updates the topic first, then stages uploads, then stages removals
	const handleSave = async (): Promise<void> => {
		setIsSaving(true)
		try {
			// an existing topic updates in place. a new one is created and yields its id
			let topicId: string
			if (topic) {
				await sendTopicUpdate(topic.id, buildUpdatePayload())
				topicId = topic.id
			} else {
				topicId = await sendTopicCreate(buildUpdatePayload())
			}

			// upload the new attachment files one at a time, dropping each from the pending list as it lands
			for (const file of [...pendingFiles]) {
				await uploadTopicAttachment(topicId, file)
				setPendingFiles((current) => current.filter((pending) => pending !== file))
			}

			// update every attachment that the owner edited for the next topic scan
			const editedAttachments = keptAttachments.filter((attachment) => isAttachmentContextEdited(attachment))
			for (const attachment of editedAttachments) {
				await sendAttachmentContext(attachment.id, attachment.context ?? "")
			}

			// best-effort attachment removals. the reloaded page shows whatever truly remains
			const keptAttachmentIds = new Set(keptAttachments.map((attachment) => attachment.id))
			const removedAttachments = (topic?.attachments ?? []).filter(
				(attachment) => !keptAttachmentIds.has(attachment.id),
			)
			await Promise.all(
				removedAttachments.map((attachment) =>
					sendAttachmentDelete(attachment.id).catch((error) => console.error("attachment delete failed", error)),
				),
			)
			await onTopicSaved(topicId)
		} catch (error) {
			// surface an error as a toast. the modal stays open so a failed upload retries on the next Save
			console.error("topic save failed", error)
			showSaveError(error)
		} finally {
			setIsSaving(false)
		}
	}

	// show a toast to tell the reader why a topics save failed
	const showSaveError = (error: unknown): void => {
		if (error instanceof DailyTopicLimitError) {
			toast.error(`${error.message}\n Move a topic to weekly, or get a bigger pot.`, {
				action: { label: "See plans", onClick: () => navigate("/pricing") },
			})
			return
		}
		toast.error(error instanceof Error ? error.message : "Save failed. Carl suggests trying again.")
	}

	// whether this attachment's context differs from the one the page loaded, so an untouched attachment does not get updated
	const isAttachmentContextEdited = (attachment: TopicResponse["attachments"][number]): boolean => {
		const loadedAttachment = topic?.attachments.find((loaded) => loaded.id === attachment.id)
		return loadedAttachment !== undefined && attachment.context !== loadedAttachment.context
	}

	// the update payload: the topic fields plus the desired invitee and source lists
	const buildUpdatePayload = (): UpdateTopicPayload => ({
		name,
		prompt,
		tags,
		frequency,
		scheduledTime,
		scheduledDayOfWeek,
		visibility,
		maxResults,
		invitees: visibility === "invite" ? invitees : [],
		// the urls still showing under the prompt save as Sources along with the ones added from the sources section
		sources: [
			...keptSources.map((source) => ({ id: source.id })),
			...addedSources.map((source) => ({
				sourceKind: source.sourceKind,
				config: toSourceConfig(source.sourceKind, source.value),
			})),
			...promptSourceUrls.map((url) => ({ sourceKind: "url" as const, config: toSourceConfig("url", url) })),
		],
	})

	// use the dialog's autofocus to select the title input when the modal opens
	const handleOpenAutoFocus = (event: Event): void => {
		event.preventDefault()
		titleInputRef.current?.focus()
	}

	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			{/* min-w-0 on each grid field lets a long url or filename truncate instead of widening the modal */}
			<DialogContent aria-describedby={undefined} onOpenAutoFocus={handleOpenAutoFocus} className="[&>*]:min-w-0">
				<DialogTitle>{topic ? "Edit your topic" : "Your new topic"}</DialogTitle>

				{/* title */}
				<div>
					<FieldLabel isRequired>Title</FieldLabel>
					<Input ref={titleInputRef} value={name} onChange={(event) => setName(event.target.value)} />
				</div>

				{/* the topic prompt: pasting, dropping, or picking a file here stages it as an attachment.
				    a url written here becomes a Source that the PromptSourceUrls component can be used to remove */}
				<div>
					<FieldLabel isRequired>{"Carl's Prompt"}</FieldLabel>
					<TopicPromptComposer
						prompt={prompt}
						topicName={name}
						pendingFiles={pendingFiles}
						onPromptChange={setPrompt}
						onAddFiles={(files) => stageFiles(pendingFiles, files, setPendingFiles)}
						onRemoveFile={(file) => setPendingFiles(pendingFiles.filter((pending) => pending !== file))}
					/>
					<PromptSourceUrls
						urls={promptSourceUrls}
						onDismiss={(url) => setDismissedSourceUrls([...dismissedSourceUrls, url])}
					/>
				</div>

				{/* tags pill editor */}
				<div>
					<FieldLabel>Tags</FieldLabel>
					<TagPicker tags={tags} knownTags={knownTags} canCreate onTagsChange={setTags} />
				</div>

				{/* topic scan frequency, its scheduled time, and the day (weekly only) */}
				<ScheduleFields
					frequency={frequency}
					onFrequencyChange={setFrequency}
					hasDailySlot={hasDailySlotLeft(topicFeed?.dailyTopicsRemaining, topic?.frequency)}
					dailyTopicsRemaining={topicFeed?.dailyTopicsRemaining}
					dailyTopicLimit={topicFeed?.dailyTopicLimit}
					scheduledTime={scheduledTime}
					onScheduledTimeChange={setScheduledTime}
					scheduledDayOfWeek={scheduledDayOfWeek}
					onScheduledDayOfWeekChange={setScheduledDayOfWeek}
				/>

				{/* max results and visibility side by side */}
				<div className="grid grid-cols-2 gap-3">
					<div>
						<FieldLabel>Max results</FieldLabel>
						<Select value={String(maxResults)} onValueChange={(value) => setMaxResults(Number(value))}>
							<SelectTrigger className="w-full" aria-label="Max results">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{maxResultsOptions.map((maxResultsOption) => (
									<SelectItem key={maxResultsOption} value={String(maxResultsOption)}>
										{`Carl's top ${maxResultsOption}`}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div>
						<FieldLabel>Visibility</FieldLabel>
						<Select value={visibility} onValueChange={(value) => setVisibility(value as Visibility)}>
							<SelectTrigger className="w-full" aria-label="Visibility">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{visibilities.map((visibilityOption) => (
									<SelectItem key={visibilityOption} value={visibilityOption}>
										{VISIBILITY_EMOJI[visibilityOption]} {visibilityOption}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				{/* invitees only shown while visibility is invite */}
				{visibility === "invite" && <InviteeEditor invitees={invitees} onChange={setInvitees} />}

				{/* topic sources: kept rows, added rows, and the add source picker */}
				<div>
					<div className="flex items-baseline gap-2">
						<FieldLabel>Sources</FieldLabel>
						<SourceCapNote />
					</div>
					<TopicSourceEditor
						keptSources={keptSources}
						addedSources={addedSources}
						topicName={name}
						topicPrompt={prompt}
						topicAttachmentContext={attachmentContext}
						promptSourceUrls={promptSourceUrls}
						onKeptChange={setKeptSources}
						onAddedChange={setAddedSources}
					/>
				</div>

				{/* attachments: kept attachments, staged uploads and urls, and the add attachments controls */}
				<div>
					<FieldLabel>Attachments</FieldLabel>
					<TopicAttachmentEditor
						keptAttachments={keptAttachments}
						pendingFiles={pendingFiles}
						onKeptChange={setKeptAttachments}
						onPendingChange={setPendingFiles}
					/>
				</div>

				{/* the footer actions */}
				<DialogFooter>
					<Button variant="ghost" onClick={onClose} disabled={isSaving}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={isSaving || !name.trim() || !prompt.trim()}>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// the frequency select, the scheduled-time picker, and the day select (weekly only)
function ScheduleFields({
	frequency,
	onFrequencyChange,
	hasDailySlot,
	dailyTopicsRemaining,
	dailyTopicLimit,
	scheduledTime,
	onScheduledTimeChange,
	scheduledDayOfWeek,
	onScheduledDayOfWeekChange,
}: {
	frequency: Frequency
	onFrequencyChange: (frequency: Frequency) => void
	hasDailySlot: boolean
	dailyTopicsRemaining: number | undefined
	dailyTopicLimit: number | undefined
	scheduledTime: string
	onScheduledTimeChange: (scheduledTime: string) => void
	scheduledDayOfWeek: DayOfWeek
	onScheduledDayOfWeekChange: (dayOfWeek: DayOfWeek) => void
}) {
	return (
		<div>
			{/* how many daily slots the plan has left, so the user sees their limit before they pick a frequency */}
			<div className="flex items-baseline gap-2">
				<FieldLabel>Frequency</FieldLabel>
				<DailyTopicQuotaLink dailyTopicsRemaining={dailyTopicsRemaining} dailyTopicLimit={dailyTopicLimit} />
			</div>
			<div className="flex flex-wrap gap-2">
				<Select value={frequency} onValueChange={(value) => onFrequencyChange(value as Frequency)}>
					<SelectTrigger className="w-32" aria-label="Scan frequency">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{FREQUENCY_OPTIONS.map((frequencyOption) => (
							<FrequencyOption
								key={frequencyOption}
								frequency={frequencyOption}
								isOutOfSlots={isDailyFrequency(frequencyOption) && !hasDailySlot}
							/>
						))}
					</SelectContent>
				</Select>
				<TimePicker scheduledTime={scheduledTime} onChange={onScheduledTimeChange} />
				{/* the day only matters for a weekly scan, so it's hidden otherwise */}
				{frequency === "weekly" && (
					<Select value={scheduledDayOfWeek} onValueChange={(day) => onScheduledDayOfWeekChange(day as DayOfWeek)}>
						<SelectTrigger className="w-32" aria-label="Scheduled day of week">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{daysOfWeek.map((dayOption) => (
								<SelectItem key={dayOption} value={dayOption}>
									{capitalize(dayOption)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</div>
		</div>
	)
}

// how many Sources a topic may hold
function SourceCapNote() {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="text-link mr-2.5 text-xs">{`up to ${MAX_TOPIC_SOURCES}`}</span>
			</TooltipTrigger>
			<TooltipContent>{FULL_SOURCES_NOTE}</TooltipContent>
		</Tooltip>
	)
}

// how many Topics the plan can run on a daily schedule, linked to the pricing page.
// the label shows what is left, and the tooltip shows the plan's limit.
function DailyTopicQuotaLink({
	dailyTopicsRemaining,
	dailyTopicLimit,
}: {
	dailyTopicsRemaining: number | undefined
	dailyTopicLimit: number | undefined
}) {
	const remainingDailyTopics = dailyTopicsRemaining ?? 0
	const limit = dailyTopicLimit ?? 0
	return (
		<ScanQuotaLink
			isLoading={dailyTopicsRemaining === undefined}
			isUnlimited={remainingDailyTopics >= ADMIN_QUOTA}
			label={`${remainingDailyTopics} daily ${toBrewsWord(remainingDailyTopics)} left`}
			href="/pricing"
			tooltip={`Your plan gets ${limit} ${limit === 1 ? "pot" : "pots"} daily`}
		/>
	)
}

// whether the plan has a daily frequency slot left
function hasDailySlotLeft(dailyTopicsRemaining: number | undefined, topicFrequency: string | undefined): boolean {
	return (dailyTopicsRemaining ?? 1) > 0 || isDailyFrequency(topicFrequency ?? "")
}

// one select frequency option. a frequency that the plan has no room for is replaced by a button that takes the user to the pricing page
function FrequencyOption({ frequency, isOutOfSlots }: { frequency: Frequency; isOutOfSlots: boolean }) {
	const navigate = useNavigate()
	if (!isOutOfSlots) {
		return <SelectItem value={frequency}>{capitalize(frequency)}</SelectItem>
	}
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button type="button" className="w-full cursor-pointer text-left" onClick={() => navigate("/pricing")}>
					<SelectItem value={frequency} disabled>
						{capitalize(frequency)}
						{/* a coffee cup where the check mark sits on the option that is selected, since this one is
						    not chosen but bought */}
						<span className="absolute right-2 flex size-3.5 items-center justify-center">
							<Coffee className="size-4" />
						</span>
					</SelectItem>
				</button>
			</TooltipTrigger>
			{/* beside the list instead of above it, so the tooltip never covers the option the reader can still pick */}
			<TooltipContent side="right">Pick up some coffee for more daily scans.</TooltipContent>
		</Tooltip>
	)
}

// the uppercase display-font label above each field. isRequired marks the field with a trailing asterisk
function FieldLabel({ children, isRequired }: { children: React.ReactNode; isRequired?: boolean }) {
	return (
		<div className="text-muted-foreground font-display mb-1.5 text-xs tracking-wide uppercase">
			{children}
			{isRequired && <span className="text-destructive"> *</span>}
		</div>
	)
}

// the invitee editor: email pills, the add-by-email input, and the visibility line
function InviteeEditor({ invitees, onChange }: { invitees: string[]; onChange: (invitees: string[]) => void }) {
	const [emailInput, setEmailInput] = useState("")

	// validate the email, lowercased and deduped. the api enforces real validation on save
	const handleInvite = (): void => {
		const email = emailInput.trim().toLowerCase()
		if (email.includes("@") && !invitees.includes(email)) {
			onChange([...invitees, email])
		}
		setEmailInput("")
	}

	return (
		<div>
			<FieldLabel>Invitees</FieldLabel>
			{invitees.length > 0 && (
				<div className="mb-2 flex flex-wrap gap-1.5">
					{invitees.map((email) => (
						<TagPill key={email} label={email} onRemove={() => onChange(invitees.filter((kept) => kept !== email))} />
					))}
				</div>
			)}
			{/* the add-by-email input and its button */}
			<div className="flex gap-2">
				<Input
					type="email"
					placeholder="add by email…"
					value={emailInput}
					onChange={(event) => setEmailInput(event.target.value)}
					onKeyDown={(event) => event.key === "Enter" && handleInvite()}
				/>
				<Button variant="outline" onClick={handleInvite}>
					Invite
				</Button>
			</div>
			<p className="text-muted-foreground mt-1.5 text-xs italic">
				{`A fresh subscription to pour will be waiting on their `}
				<AnchorLink href="/activity" className="text-link hover:underline">
					Activity page
				</AnchorLink>
			</p>
		</div>
	)
}

// build a new source's config from the selector field
function toSourceConfig(sourceKind: EditableSourceKind, value: string): Record<string, unknown> {
	// a page and a feed are both named by their url. what differs is the ingester that reads it
	if (sourceKind === "url" || sourceKind === "rss") {
		return { url: value }
	}

	// the web search needs no config. its ingester derives queries from the topic prompt
	if (sourceKind === "search") {
		return {}
	}

	// a reddit source takes its subreddit with any leading r/ stripped
	if (sourceKind === "reddit") {
		return { subreddit: value.replace(/^r\//, "") }
	}

	// YouTube playlist ids start with PL by convention. everything else is treated as a channel id
	return value.startsWith("PL") ? { playlistId: value } : { channelId: value }
}

/**
 * The urls written in the prompt, each saved as a Source unless its ✕ takes it off the list.
 * A url is opt-out instead of opt-in
 */
function PromptSourceUrls({ urls, onDismiss }: { urls: string[]; onDismiss: (url: string) => void }) {
	if (urls.length === 0) {
		return null
	}
	return (
		<div className="mt-1.5 flex flex-wrap items-center gap-1.5">
			<span className="text-muted-foreground text-xs">Reading as a source:</span>
			{urls.map((url) => (
				<span
					key={url}
					className="border-separator flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
				>
					<span className="truncate">{url}</span>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								aria-label={`Don't read ${url}`}
								onClick={() => onDismiss(url)}
								className="text-muted-foreground hover:text-foreground shrink-0"
							>
								<X className="size-3" />
							</button>
						</TooltipTrigger>
						<TooltipContent>{`Don't read ${url}`}</TooltipContent>
					</Tooltip>
				</span>
			))}
		</div>
	)
}
