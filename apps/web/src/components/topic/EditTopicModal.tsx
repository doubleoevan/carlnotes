import { maxTopicFindingsOptions, visibilities } from "@carlnotes/contracts/enums"
import type { TopicPodcast } from "@carlnotes/contracts/podcast"
import { FULL_PODCAST_EPISODE_MINUTES, SHORT_PODCAST_EPISODE_MINUTES } from "@carlnotes/contracts/podcastEpisodes"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { cn } from "@carlnotes/nightshift/classNames"
import { useNavigate } from "@tanstack/react-router"
import { useId, useRef, useState } from "react"
import { toast } from "sonner"
import { AnchorLink } from "@/components/common/AnchorLink"
import { FieldLabel } from "@/components/common/FieldLabel"
import { InviteEditor } from "@/components/invite/InviteEditor"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { Input } from "@/components/primitives/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Switch } from "@/components/primitives/switch"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { hasDailySlotLeft, PromptSourceUrls, ScheduleFields, SourceLimitNote } from "./EditTopicFields"
import { MISSING_FIELD_NOTES, saveTopic, showSaveError } from "./saveTopic"
import { TagPicker } from "./TagPicker"
import { stageFiles, TopicAttachmentEditor } from "./TopicAttachmentEditor"
import { TopicPromptComposer } from "./TopicPromptComposer"
import { TopicSourceEditor } from "./TopicSourceEditor"
import { TopicTeamSelect, useTopicTeamChoice } from "./TopicTeamSelect"
import { useTopicFields, type Visibility } from "./useTopicFields"

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
	// the ids that tie each field label to its field
	const titleInputId = useId()
	const promptInputId = useId()
	const maxTopicFindingsSelectId = useId()
	const visibilitySelectId = useId()
	const podcastSwitchId = useId()
	// sends the user to the plans page when a daily schedule is at the plan's limit
	const navigate = useNavigate()
	// every tag across the loaded feed seeds the tag picker, and the topicFeed has the daily slots left
	const { knownTags, topicFeed } = useTopicFeed()
	// the editable fields and the topic's team
	const fields = useTopicFields(topic, isMakingTopicPublic)
	const topicTeam = useTopicTeamChoice(topic, initialTeam)
	const [isSaving, setIsSaving] = useState(false)
	// the id a failed Save already created, which the retry updates
	const createdTopicIdRef = useRef<string | null>(null)

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
			const topicId = await saveTopic({ topic, createdTopicId: createdTopicIdRef, fields, topicTeam })
			await onTopicSaved(topicId, topicName)
		} catch (error) {
			// surface an error as a toast. the modal stays open so a failed upload retries on the next Save
			console.error("topic save failed", error)
			showSaveError(error, navigate)
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
					<FieldLabel htmlFor={titleInputId} isRequired>
						Title
					</FieldLabel>
					<Input
						id={titleInputId}
						ref={titleInputRef}
						aria-required
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
					<FieldLabel htmlFor={promptInputId} isRequired>
						{"Carl's Prompt"}
					</FieldLabel>
					<TopicPromptComposer
						promptInputId={promptInputId}
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

				{/* max findings and visibility side by side */}
				<div className="grid grid-cols-2 gap-3">
					<div>
						<FieldLabel htmlFor={maxTopicFindingsSelectId}>Max findings</FieldLabel>
						<Select
							value={String(fields.maxTopicFindings)}
							onValueChange={(value) => fields.setMaxTopicFindings(Number(value))}
						>
							<SelectTrigger id={maxTopicFindingsSelectId} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{maxTopicFindingsOptions.map((maxTopicFindingsOption) => (
									<SelectItem key={maxTopicFindingsOption} value={String(maxTopicFindingsOption)}>
										{`Carl's top ${maxTopicFindingsOption}`}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div>
						<FieldLabel htmlFor={visibilitySelectId}>Visibility</FieldLabel>
						<Select value={fields.visibility} onValueChange={(value) => fields.setVisibility(value as Visibility)}>
							<SelectTrigger id={visibilitySelectId} className="w-full">
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

				{/* the podcast switch, for a saved topic that has a podcast */}
				{topic?.podcast && (
					<div>
						<FieldLabel htmlFor={podcastSwitchId}>Podcast</FieldLabel>
						<PodcastSwitch
							podcastSwitchId={podcastSwitchId}
							topicPodcast={topic.podcast}
							isPodcastEnabled={fields.isPodcastEnabled}
							isTopicOwner={topic.isTopicOwner}
							onPodcastChange={fields.setIsPodcastEnabled}
						/>
					</div>
				)}

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

// the switch's id for its field label, the topic's podcast, whether the switch is on, whether the user owns the topic,
// and the switch's change callback
type PodcastSwitchProps = {
	podcastSwitchId: string
	topicPodcast: TopicPodcast
	isPodcastEnabled: boolean
	isTopicOwner: boolean
	onPodcastChange: (isPodcastEnabled: boolean) => void
}

/**
 * The podcast switch, with the free plan's short episode and the owner's plans link if the topic lacks full episodes.
 */
export function PodcastSwitch({
	podcastSwitchId,
	topicPodcast,
	isPodcastEnabled,
	isTopicOwner,
	onPodcastChange,
}: PodcastSwitchProps) {
	return (
		<div className="flex items-center justify-between gap-3">
			<div className="flex flex-col gap-0.5">
				{/* whether the podcast is on */}
				<span className="text-muted-foreground">
					{isPodcastEnabled ? "Coffee Break episode after every brew" : "Coffee Break is off"}
				</span>
				{/* the free plan's short episode, and the owner's link to the plans page */}
				{!topicPodcast.hasFullPodcastEpisodes && (
					<span className="text-muted-foreground text-xs">
						{`The free plan keeps each topic's latest ${SHORT_PODCAST_EPISODE_MINUTES}-minute episode`}
					</span>
				)}
				{!topicPodcast.hasFullPodcastEpisodes && isTopicOwner && (
					<AnchorLink href="/plans" className={cn(STANDALONE_LINK_CLASS, "text-xs")}>
						{`Upgrade for ${FULL_PODCAST_EPISODE_MINUTES}-minute episodes, every one kept`}
					</AnchorLink>
				)}
			</div>
			{/* the switch */}
			<Switch
				id={podcastSwitchId}
				checked={isPodcastEnabled}
				onCheckedChange={onPodcastChange}
				className="h-7.5 w-13 [&>span]:size-6"
			/>
		</div>
	)
}
