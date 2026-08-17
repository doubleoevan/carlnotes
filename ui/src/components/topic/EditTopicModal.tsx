import { MAX_ATTACHMENT_CONTEXT_CHARS, type TopicResponse, type UpdateTopicPayload } from "@shared/contracts"
import { maxResultsOptions, visibilities } from "@shared/enums"
import { DEFAULT_SOURCES, toCustomSourceOption, toDefaultSource } from "@shared/sources"
import { useRef, useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { Input } from "@/components/primitives/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { TagPicker } from "@/components/topic/TagPicker"
import {
	DailyTopicLimitError,
	sendAttachmentContext,
	sendAttachmentDelete,
	sendTopicCreate,
	sendTopicUpdate,
	uploadTopicAttachment,
} from "@/lib/topicClient"
import { toPossibleSourceUrls } from "@/lib/utils"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import {
	type DayOfWeek,
	FieldLabel,
	type Frequency,
	hasDailySlotLeft,
	InviteeEditor,
	PromptSourceUrls,
	ScheduleFields,
	SourceCapNote,
} from "./EditTopicFields"
import { stageFiles, TopicAttachmentEditor } from "./TopicAttachmentEditor"
import { TopicPromptComposer } from "./TopicPromptComposer"
import { type AddedSource, TopicSourceEditor } from "./TopicSourceEditor"

// the field union that the visibility select offers
type Visibility = (typeof visibilities)[number]

// the topic and its callbacks
type EditTopicModalProps = {
	topic?: TopicResponse
	// opens with public already selected, staged like any other edit so nothing changes until the owner saves
	isMakingTopicPublic?: boolean
	onClose: () => void
	onTopicSaved: (topicId: string) => Promise<void>
}

// the emoji shown for each visibility option
const VISIBILITY_EMOJI: Record<Visibility, string> = { private: "🔒", public: "🌐", invite: "✉️" }

// the visibility the modal opens on. a share control asks for public, and everything else opens on the topic's own
function toStartingVisibility(topic: TopicResponse | undefined, isMakingTopicPublic?: boolean): Visibility {
	if (isMakingTopicPublic) {
		return "public"
	}
	return topic?.visibility ?? "invite"
}

/**
 * The edit topic modal for editing or creating a new topic.
 */
export function EditTopicModal({ topic, isMakingTopicPublic, onClose, onTopicSaved }: EditTopicModalProps) {
	// the title input ref to focus it on open
	const titleInputRef = useRef<HTMLInputElement>(null)
	// sends the user to the plans page when a daily schedule is at the plan's limit
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
	// a new topic defaults to invite for sharing without showing up automatically in the popular section
	const [visibility, setVisibility] = useState<Visibility>(toStartingVisibility(topic, isMakingTopicPublic))
	const [maxResults, setMaxResults] = useState(topic?.maxResults ?? 10)
	const [invitees, setInvitees] = useState(topic?.invitees ?? [])
	// which default sources are on, by key. a new topic starts with all of them on
	const [defaultSourceKeys, setDefaultSourceKeys] = useState(() => toDefaultSourceKeys(topic))
	// the kept and added source and attachment lists. a stored default source is included by the array above
	const [keptSources, setKeptSources] = useState(toCustomSources(topic?.sources ?? []))
	const [addedSources, setAddedSources] = useState<AddedSource[]>([])
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

	// handleSaveTopic creates or updates the topic first, then stages uploads, then stages removals
	const handleSaveTopic = async (): Promise<void> => {
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

	// show a toast to tell the user why a topics save failed
	const showSaveError = (error: unknown): void => {
		if (error instanceof DailyTopicLimitError) {
			toast.error(`${error.message}\n Move a topic to weekly, or get a bigger pot.`, {
				action: { label: "See plans", onClick: () => navigate("/plans") },
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
	const buildUpdatePayload = (): UpdateTopicPayload => {
		// every default source that is on is staged as its own row, and every picked one is built by its option.
		// an option that cannot build a config from what was typed is left out
		const defaultSources = DEFAULT_SOURCES.filter((defaultSource) => defaultSourceKeys.includes(defaultSource.key))
		const stagedDefaultSources = defaultSources.map((defaultSource) => ({
			sourceKind: defaultSource.sourceKind,
			config: defaultSource.toConfig(),
		}))
		const stagedCustomSources = addedSources.flatMap((addedSource) => {
			const sourceOption = toCustomSourceOption(addedSource.optionKey)
			const sourceConfig = sourceOption?.toConfig(addedSource.value)
			if (!sourceOption || !sourceConfig) {
				return []
			}

			// a resolved display name is included into the source config
			const isNamedSource = sourceOption.sourceKind === "podcast" || sourceOption.sourceKind === "youtube"
			return [
				{
					sourceKind: sourceOption.sourceKind,
					config: addedSource.name && isNamedSource ? { ...sourceConfig, name: addedSource.name } : sourceConfig,
				},
			]
		})

		return {
			name,
			prompt,
			tags,
			frequency,
			scheduledTime,
			scheduledDayOfWeek,
			visibility,
			maxResults,
			invitees: visibility !== "private" ? invitees : [],
			// the urls still showing under the prompt save as Sources along with the ones added from the sources section
			sources: [
				...stagedDefaultSources,
				...keptSources.map((source) => ({ id: source.id })),
				...stagedCustomSources,
				...promptSourceUrls.map((url) => ({ sourceKind: "url" as const, config: { url } })),
			],
		}
	}

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

				{/* invitees shown unless the topic is private. a public topic invites too, the email is the reach */}
				{visibility !== "private" && <InviteeEditor invitees={invitees} onChange={setInvitees} />}

				{/* topic sources: kept rows, added rows, and the add source picker */}
				<div>
					<div className="flex items-baseline gap-2">
						<FieldLabel>Sources</FieldLabel>
						<SourceCapNote />
					</div>
					<TopicSourceEditor
						defaultSourceKeys={defaultSourceKeys}
						keptSources={keptSources}
						addedSources={addedSources}
						topicName={name}
						topicPrompt={prompt}
						topicAttachmentContext={attachmentContext}
						promptSourceUrls={promptSourceUrls}
						onDefaultKeysChange={setDefaultSourceKeys}
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
					<Button onClick={handleSaveTopic} disabled={isSaving || !name.trim() || !prompt.trim()}>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// which default sources a topic has on. a new topic starts with each one of them
function toDefaultSourceKeys(topic?: TopicResponse): string[] {
	if (!topic) {
		return DEFAULT_SOURCES.map((defaultSource) => defaultSource.key)
	}

	// a stored source is a default one when it matches an entry,
	// two stored sources can match the same entry, so the keys are deduped
	return [...new Set(topic.sources.flatMap((source) => toDefaultSource(source.sourceKind)?.key ?? []))]
}

// the topic's sources that are not default ones
function toCustomSources(sources: TopicResponse["sources"]): TopicResponse["sources"] {
	return sources.filter((source) => !toDefaultSource(source.sourceKind))
}
