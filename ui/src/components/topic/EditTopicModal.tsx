import type { TopicResponse } from "@shared/contracts"
import { maxResultsOptions, visibilities } from "@shared/enums"
import { useRef, useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import {
	DailyTopicLimitError,
	sendAttachmentContext,
	sendCreateTopic,
	sendDeleteAttachment,
	sendUpdateTopic,
	uploadTopicAttachment,
} from "@/clients/topicClient"
import { FieldLabel } from "@/components/common/FieldLabel"
import { InviteEditor, sendPendingUsernameInvites } from "@/components/invite/InviteEditor"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { Input } from "@/components/primitives/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { TagPicker } from "@/components/topic/TagPicker"
import { cn } from "@/lib/utils"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { hasDailySlotLeft, PromptSourceUrls, ScheduleFields, SourceLimitNote } from "./EditTopicFields"
import { stageFiles, TopicAttachmentEditor } from "./TopicAttachmentEditor"
import { TopicPromptComposer } from "./TopicPromptComposer"
import { TopicSourceEditor } from "./TopicSourceEditor"
import { type TopicTeamField, TopicTeamSelect, useTopicTeamChoice } from "./TopicTeamSelect"
import { type TopicFields, toUpdateTopicPayload, useTopicFields, type Visibility } from "./useTopicFields"

// the emoji shown for each visibility option
const VISIBILITY_EMOJI: Record<Visibility, string> = { private: "🔒", public: "🌐", invite: "✉️" }

/**
 * The edit topic modal for editing or creating a new topic.
 */
export function EditTopicModal({
	topic,
	isMakingTopicPublic,
	initialTeam,
	onClose,
	onTopicSaved,
}: {
	topic?: TopicResponse
	// opens with public already selected, staged like any other edit. nothing changes until the owner saves
	isMakingTopicPublic?: boolean
	// the team a new topic starts with, when opened from the team page.
	initialTeam?: { teamId: string; name: string }
	onClose: () => void
	onTopicSaved: (topicId: string, topicName: string) => Promise<void>
}) {
	// the title input ref to focus it on open
	const titleInputRef = useRef<HTMLInputElement>(null)
	// sends the user to the plans page when a daily schedule is at the plan's limit
	const navigate = useNavigate()
	// every tag across the loaded feed seeds the tag picker, and the topicFeed has the daily slots left
	const { knownTags, topicFeed } = useTopicFeed()
	// the editable fields and the topic's team
	const fields = useTopicFields(topic, isMakingTopicPublic)
	const topicTeam = useTopicTeamChoice(topic, initialTeam)
	const [isSaving, setIsSaving] = useState(false)

	// a topic that is not private lives on a team
	const isTeamMissing = fields.visibility !== "private" && !topicTeam.isTeamChosen

	// the required field the last save click found empty. the mark clears as soon as it is filled
	const [missingField, setMissingField] = useState<"name" | "prompt" | "team" | null>(null)
	const promptFieldRef = useRef<HTMLDivElement>(null)
	const teamFieldRef = useRef<HTMLDivElement>(null)

	// the first required field still empty, in the order the form shows them
	const toMissingRequiredField = (): "name" | "prompt" | "team" | null => {
		if (!fields.name.trim()) {
			return "name"
		}
		if (!fields.prompt.trim()) {
			return "prompt"
		}
		if (isTeamMissing) {
			return "team"
		}
		return null
	}

	// save the topic, then tell the page that opened this modal to reload behind it
	const handleSaveTopic = async (): Promise<void> => {
		// a missing required field stops the save. the screen scrolls to it and a toast names it
		const missingRequiredField = toMissingRequiredField()
		if (missingRequiredField) {
			setMissingField(missingRequiredField)
			const fieldTargets = { name: titleInputRef.current, prompt: promptFieldRef.current, team: teamFieldRef.current }
			fieldTargets[missingRequiredField]?.scrollIntoView({ behavior: "smooth", block: "center" })
			toast.error(MISSING_FIELD_NOTES[missingRequiredField])
			return
		}
		setMissingField(null)
		setIsSaving(true)
		try {
			const topicName = fields.name
			const topicId = await saveTopic({ topic, fields, topicTeam })
			await onTopicSaved(topicId, topicName)
		} catch (error) {
			// surface an error as a toast. the modal stays open so a failed upload retries on the next Save
			console.error("topic save failed", error)
			showSaveError(error, () => navigate("/plans"))
		} finally {
			setIsSaving(false)
		}
	}

	// use the dialog's autofocus to focus the title input when the modal opens
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
					<Input
						ref={titleInputRef}
						value={fields.name}
						onChange={(event) => fields.setName(event.target.value)}
						className={cn(missingField === "name" && !fields.name.trim() && "border-destructive")}
					/>
				</div>

				{/* the topic prompt: pasting, dropping, or selecting a file here stages it as an attachment.
				    a url written here becomes a Source that the PromptSourceUrls component can be used to remove */}
				<div
					ref={promptFieldRef}
					className={cn(missingField === "prompt" && !fields.prompt.trim() && "rounded-md ring-1 ring-destructive")}
				>
					<FieldLabel isRequired>{"Carl's Prompt"}</FieldLabel>
					<TopicPromptComposer
						prompt={fields.prompt}
						topicName={fields.name}
						pendingFiles={fields.pendingFiles}
						onPromptChange={fields.setPrompt}
						onAddFiles={(files) => stageFiles(fields.pendingFiles, files, fields.setPendingFiles)}
						onRemoveFile={(file) => fields.setPendingFiles(fields.pendingFiles.filter((pending) => pending !== file))}
					/>
					<PromptSourceUrls urls={fields.promptSourceUrls} onDismiss={fields.dismissSourceUrl} />
				</div>

				{/* tags pill editor */}
				<div>
					<FieldLabel>Tags</FieldLabel>
					<TagPicker tags={fields.tags} knownTags={knownTags} canCreate onTagsChange={fields.setTags} />
				</div>

				{/* topic scan frequency, its scheduled time, and the day (weekly only) */}
				<ScheduleFields
					frequency={fields.frequency}
					onFrequencyChange={fields.setFrequency}
					hasDailySlot={hasDailySlotLeft(topicFeed?.dailyTopicsRemaining, topic?.frequency)}
					dailyTopicsRemaining={topicFeed?.dailyTopicsRemaining}
					dailyTopicLimit={topicFeed?.dailyTopicLimit}
					scheduledTime={fields.scheduledTime}
					onScheduledTimeChange={fields.setScheduledTime}
					scheduledDayOfWeek={fields.scheduledDayOfWeek}
					onScheduledDayOfWeekChange={fields.setScheduledDayOfWeek}
				/>

				{/* max results and visibility side by side */}
				<div className="grid grid-cols-2 gap-3">
					<div>
						<FieldLabel>Max results</FieldLabel>
						<Select value={String(fields.maxResults)} onValueChange={(value) => fields.setMaxResults(Number(value))}>
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
						<Select value={fields.visibility} onValueChange={(value) => fields.setVisibility(value as Visibility)}>
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

				{/* topic team and invite section. both are hidden for a private topic. */}
				{fields.visibility !== "private" && (
					<div ref={teamFieldRef} className="border-y py-4">
						<TopicTeamSelect teamField={topicTeam} isTeamMissing={missingField === "team" && isTeamMissing} />
						<div className="bg-border my-4 h-px" />

						{/* a topic that was never saved has no id, so it gets the invites without the link */}
						<InviteEditor
							emailInvites={fields.emailInvites}
							onEmailInvitesChange={fields.setEmailInvites}
							usernameInvites={fields.usernameInvites}
							onUsernameInvitesChange={fields.setUsernameInvites}
							topic={topic ? { id: topic.id, name: fields.name } : undefined}
						/>
					</div>
				)}

				{/* topic sources: kept rows, added rows, and the topic source selector */}
				<div>
					<div className="flex items-baseline gap-2">
						<FieldLabel>Sources</FieldLabel>
						<SourceLimitNote />
					</div>
					<TopicSourceEditor fields={fields} />
				</div>

				{/* attachments: kept attachments, staged uploads and urls, and the add attachment buttons */}
				<div>
					<FieldLabel>Attachments</FieldLabel>
					<TopicAttachmentEditor
						keptAttachments={fields.keptAttachments}
						pendingFiles={fields.pendingFiles}
						onKeptChange={fields.setKeptAttachments}
						onPendingChange={fields.setPendingFiles}
					/>
				</div>

				{/* the footer actions */}
				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={isSaving}>
						Cancel
					</Button>
					{/* the save stays clickable. a click with a required field empty scrolls to it and names it */}
					<Button onClick={handleSaveTopic} disabled={isSaving}>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

/**
 * Create or update the topic, then upload the new files, send the attachment edits, and send the attachment removals.
 * Returns the saved topic's id. Throws only if the save itself fails, and shows lesser failures as toasts.
 */
async function saveTopic({
	topic,
	fields,
	topicTeam,
}: {
	topic: TopicResponse | undefined
	fields: TopicFields
	topicTeam: TopicTeamField
}): Promise<string> {
	// an existing topic updates in place. a new one is created and yields its id
	const payload = toUpdateTopicPayload(fields)
	let topicId: string
	if (topic) {
		await sendUpdateTopic(topic.id, payload)
		topicId = topic.id
	} else {
		topicId = await sendCreateTopic(payload)
	}

	// upload the new attachment files one at a time, dropping each from the pending list as it uploads
	for (const file of [...fields.pendingFiles]) {
		await uploadTopicAttachment(topicId, file)
		fields.setPendingFiles((current) => current.filter((pending) => pending !== file))
	}

	// update every attachment whose context the owner edited, for the next topic scan
	const editedAttachments = fields.keptAttachments.filter((attachment) => {
		const loadedAttachment = topic?.attachments.find((loaded) => loaded.id === attachment.id)
		return loadedAttachment !== undefined && attachment.context !== loadedAttachment.context
	})
	for (const attachment of editedAttachments) {
		await sendAttachmentContext(attachment.id, attachment.context ?? "")
	}

	// best-effort attachment removals. the reloaded page shows whatever truly remains
	const keptAttachmentIds = new Set(fields.keptAttachments.map((attachment) => attachment.id))
	const removedAttachments = (topic?.attachments ?? []).filter((attachment) => !keptAttachmentIds.has(attachment.id))
	await Promise.all(
		removedAttachments.map((attachment) =>
			sendDeleteAttachment(attachment.id).catch((error) => console.error("attachment delete failed", error)),
		),
	)

	// a private topic keeps no team and names no followers
	if (fields.visibility !== "private") {
		await sendPendingUsernameInvites(topicId, fields.usernameInvites).catch((error) => {
			console.error("username invites failed", error)
			toast.error("The topic saved, but its invitations didn't go out.")
		})
		await topicTeam.assignTopicTeam(topicId).catch((error) => {
			console.error("team change failed", error)
			toast.error("The topic saved, but the team change didn't hold.")
		})
	}
	return topicId
}

// what the toast shows for each required field a save click found empty
const MISSING_FIELD_NOTES = {
	name: "Please give the topic a title.",
	prompt: "Please write Carl's prompt first.",
	team: "Pick a team, create one, or set Visibility to private.",
} as const

// show a toast to tell the user why a topic save failed
function showSaveError(error: unknown, onSeePlans: () => void): void {
	if (error instanceof DailyTopicLimitError) {
		toast.error(`${error.message}\n Move a topic to weekly, or get a bigger pot.`, {
			action: { label: "See plans", onClick: onSeePlans },
		})
		return
	}
	toast.error(error instanceof Error ? error.message : "Save failed. Carl suggests trying again.")
}
