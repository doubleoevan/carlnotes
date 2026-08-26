import {
	MAX_ATTACHMENT_CONTEXT_CHARS,
	type TeamSummary,
	type TopicResponse,
	type UpdateTopicPayload,
} from "@shared/contracts"
import { maxResultsOptions, visibilities } from "@shared/enums"
import { DEFAULT_SOURCES, toCustomSourceOption, toDefaultSource } from "@shared/sources"
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import {
	fetchTeamNameTaken,
	fetchTeams,
	sendAddTopicTeam,
	sendCreateTeam,
	sendRemoveTopicFromTeam,
} from "@/clients/teamClient"
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
import { type PendingInvite, sendPendingInvites, TeamInviteFields } from "@/components/invite/TeamInviteFields"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { Input } from "@/components/primitives/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Switch } from "@/components/primitives/switch"
import { TagPicker } from "@/components/topic/TagPicker"
import { toPossibleSourceUrls } from "@/lib/topicPromptUrls"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import {
	type DayOfWeek,
	type Frequency,
	hasDailySlotLeft,
	PromptSourceUrls,
	ScheduleFields,
	SourceLimitNote,
} from "./EditTopicFields"
import { stageFiles, TopicAttachmentEditor } from "./TopicAttachmentEditor"
import { TopicPromptComposer } from "./TopicPromptComposer"
import { type AddedSource, TopicSourceEditor } from "./TopicSourceEditor"

// the field union that the visibility select offers
type Visibility = (typeof visibilities)[number]

// the topic and its callbacks
type EditTopicModalProps = {
	topic?: TopicResponse
	// opens with public already selected, staged like any other edit. nothing changes until the owner saves
	isMakingTopicPublic?: boolean
	// the team a new topic starts with, when opened from the team page.
	initialTeam?: { teamId: string; name: string }
	onClose: () => void
	onTopicSaved: (topicId: string) => Promise<void>
}

// the emoji shown for each visibility option
const VISIBILITY_EMOJI: Record<Visibility, string> = { private: "🔒", public: "🌐", invite: "✉️" }

// the visibility the modal opens on. the Share menu asks for public, and everything else opens on the topic's own
function toStartingVisibility(topic: TopicResponse | undefined, isMakingTopicPublic?: boolean): Visibility {
	if (isMakingTopicPublic) {
		return "public"
	}
	return topic?.visibility ?? "invite"
}

/**
 * The edit topic modal for editing or creating a new topic.
 */
export function EditTopicModal({
	topic,
	isMakingTopicPublic,
	initialTeam,
	onClose,
	onTopicSaved,
}: EditTopicModalProps) {
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
	// the email address invite pills to edit
	const [emailInvites, setEmailInvites] = useState(
		() => topic?.invites.flatMap((invite) => (invite.email ? [invite.email] : [])) ?? [],
	)
	// the username invite pills to edit
	const [usernameInvites, setUsernameInvites] = useState<string[]>([])
	// the list of default sources that are on by key. a new topic starts with all of them on
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

	// only attachments that have finished processing have a context to read
	const attachmentContext = keptAttachments
		.filter((attachment) => attachment.status === "ready" && attachment.context)
		.map((attachment) => attachment.context)
		.join("\n\n")
		.slice(0, MAX_ATTACHMENT_CONTEXT_CHARS)

	const [isSaving, setIsSaving] = useState(false)

	// the topic's team today and the destination this edit selects, kept in one hook beside its writes
	const topicTeam = useTopicTeamChoice(topic, initialTeam)

	// create or update the topic, then upload the new files, then send the removals
	const handleSaveTopic = async (): Promise<void> => {
		setIsSaving(true)
		try {
			// an existing topic updates in place. a new one is created and yields its id
			let topicId: string
			if (topic) {
				await sendUpdateTopic(topic.id, buildUpdatePayload())
				topicId = topic.id
			} else {
				topicId = await sendCreateTopic(buildUpdatePayload())
			}

			// upload the new attachment files one at a time, dropping each from the pending list as it uploads
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
					sendDeleteAttachment(attachment.id).catch((error) => console.error("attachment delete failed", error)),
				),
			)
			// a private topic keeps no team and names no followers
			if (visibility !== "private") {
				await sendPendingUsernameInvites(topicId, usernameInvites).catch((error) => {
					console.error("username invites failed", error)
					toast.error("The topic saved, but its invitations didn't go out.")
				})
				await topicTeam.assignTopicTeam(topicId).catch((error) => {
					console.error("team change failed", error)
					toast.error("The topic saved, but the team change didn't hold.")
				})
			}
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
		// every default source that is on is staged as its own row, and every selected one is built by its option
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

			// a resolved display name is added to the source config
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
			inviteEmails: visibility !== "private" ? emailInvites : [],
			// the urls still showing under the prompt save as Sources along with the ones added from the sources section
			sources: [
				...stagedDefaultSources,
				...keptSources.map((source) => ({ id: source.id })),
				...stagedCustomSources,
				...promptSourceUrls.map((url) => ({ sourceKind: "url" as const, config: { url } })),
			],
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
					<Input ref={titleInputRef} value={name} onChange={(event) => setName(event.target.value)} />
				</div>

				{/* the topic prompt: pasting, dropping, or selecting a file here stages it as an attachment.
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

				{/* topic team and invite section. both are hidden for a private topic. */}
				{visibility !== "private" && (
					<div className="border-y py-4">
						<TopicTeamSelect teamField={topicTeam} />
						{topicTeam.isTeamSelectable && <div className="bg-border my-4 h-px" />}

						{/* a topic that was never saved has no id, so it gets the invites without the link */}
						<InviteEditor
							emailInvites={emailInvites}
							onEmailInvitesChange={setEmailInvites}
							usernameInvites={usernameInvites}
							onUsernameInvitesChange={setUsernameInvites}
							topic={topic ? { id: topic.id, name, invites: topic.invites } : undefined}
						/>
					</div>
				)}

				{/* topic sources: kept rows, added rows, and the topic source selector */}
				<div>
					<div className="flex items-baseline gap-2">
						<FieldLabel>Sources</FieldLabel>
						<SourceLimitNote />
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

				{/* attachments: kept attachments, staged uploads and urls, and the add attachment buttons */}
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
					<Button variant="outline" onClick={onClose} disabled={isSaving}>
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

	// a stored source is a default one when it matches an entry, two stored sources can match the same entry
	return [...new Set(topic.sources.flatMap((source) => toDefaultSource(source.sourceKind)?.key ?? []))]
}

// the topic's sources that are not default ones
function toCustomSources(sources: TopicResponse["sources"]): TopicResponse["sources"] {
	return sources.filter((source) => !toDefaultSource(source.sourceKind))
}

// what the topic team choice holds
type TopicTeamField = {
	currentTeam: { teamId: string; name: string } | null
	leaderTeams: { teamId: string; name: string }[] | null
	teamChoice: string
	setTeamChoice: (choice: string) => void
	isTeamSelectable: boolean
	newTeamName: string
	setNewTeamName: (name: string) => void
	newTeamRejection: string | null
	checkNewTeamName: () => void
	isNewTeamPublic: boolean
	setNewTeamPublic: (isPublic: boolean) => void
	pendingInvites: PendingInvite[]
	setPendingInvites: (invites: PendingInvite[]) => void
	assignTopicTeam: (topicId: string) => Promise<void>
}

// the team after a topic edit. "none" deletes, a team id sets, and "new" creates the team after the save
function useTopicTeamChoice(
	topic: TopicResponse | undefined,
	initialTeam?: { teamId: string; name: string },
): TopicTeamField {
	const currentTeam = topic?.teamLink ?? (topic?.team ? { teamId: topic.team.teamId, name: topic.team.name } : null)
	const [teams, setTeams] = useState<TeamSummary[] | null>(null)
	// a create opened from a team page sets that team
	const [teamChoice, setTeamChoice] = useState(currentTeam?.teamId ?? initialTeam?.teamId ?? "none")
	// a new team's fields: its name, its visibility, and the invitations sent once it exists
	const [newTeamName, setNewTeamName] = useState("")
	const [isNewTeamPublic, setNewTeamPublic] = useState(false)
	const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
	const [newTeamRejection, setNewTeamRejection] = useState<string | null>(null)

	// the team memberships load with the modal to set the available team choices
	useEffect(() => {
		fetchTeams()
			.then((index) => setTeams(index.teams.filter((team) => team.role === "leader")))
			.catch(() => setTeams([]))
	}, [])

	// a topic on a team the user does not lead is not theirs to move, so the field stays hidden
	const isTeamSelectable = teams !== null && (!currentTeam || teams.some((team) => team.teamId === currentTeam.teamId))
	const leaderTeams = (teams ?? []).some((team) => team.teamId === initialTeam?.teamId)
		? (teams ?? [])
		: [...(teams ?? []), ...(initialTeam ? [initialTeam] : [])]

	// apply the selected team once the topic is saved. a failed team assignment is shown in the toast
	const assignTopicTeam = async (topicId: string): Promise<void> => {
		const currentTeamId = currentTeam?.teamId ?? "none"
		if (!isTeamSelectable || teamChoice === currentTeamId) {
			return
		}
		if (teamChoice === "new") {
			await createNewTeam(topicId, { name: newTeamName, isPublic: isNewTeamPublic, pendingInvites })
			return
		}
		if (teamChoice === "none" && currentTeam) {
			await sendRemoveTopicFromTeam(currentTeam.teamId, topicId)
			return
		}

		// show a toast if there was an api error
		const addTopicTeamRejection = teamChoice === "none" ? null : await sendAddTopicTeam(teamChoice, topicId)
		if (addTopicTeamRejection) {
			toast.error(addTopicTeamRejection)
		}
	}

	// the blur check runs before the save does, and typing again clears the note
	const checkNewTeamName = (): void => {
		const teamName = newTeamName.trim()
		if (teamName === "") {
			return
		}
		void fetchTeamNameTaken(teamName)
			.then((isTeamNameTaken) => {
				setNewTeamRejection(isTeamNameTaken ? "A team already has that name." : null)
			})
			.catch(() => setNewTeamRejection(null))
	}
	return {
		currentTeam,
		leaderTeams,
		teamChoice,
		setTeamChoice,
		isTeamSelectable,
		newTeamName,
		setNewTeamName,
		newTeamRejection,
		checkNewTeamName,
		isNewTeamPublic,
		setNewTeamPublic,
		pendingInvites,
		setPendingInvites,
		assignTopicTeam,
	}
}

// create the new team holding the saved topic and send its queued invitations
async function createNewTeam(
	topicId: string,
	newTeam: { name: string; isPublic: boolean; pendingInvites: PendingInvite[] },
): Promise<void> {
	if (!newTeam.name.trim()) {
		return
	}
	const createTeamResponse = await sendCreateTeam({
		name: newTeam.name.trim(),
		description: null,
		topicIds: [topicId],
		isPublic: newTeam.isPublic,
	})
	if ("rejection" in createTeamResponse) {
		toast.error(
			createTeamResponse.rejection === "name-taken"
				? "A team already holds that name."
				: "That's a lot of teams for one day. Try again tomorrow.",
		)
		return
	}
	await sendPendingInvites(createTeamResponse.teamId, newTeam.pendingInvites)
}

// the topic team select: no team, the teams the user is a leader for, or a new team created on save
function TopicTeamSelect({ teamField }: { teamField: TopicTeamField }) {
	if (!teamField.isTeamSelectable) {
		return null
	}
	return (
		<div className={teamField.teamChoice === "new" ? "space-y-3" : undefined}>
			<FieldLabel>Team</FieldLabel>
			<Select value={teamField.teamChoice} onValueChange={teamField.setTeamChoice}>
				<SelectTrigger className="w-full" aria-label="Team">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">No team</SelectItem>
					{(teamField.currentTeam ? [] : (teamField.leaderTeams ?? [])).map((team) => (
						<SelectItem key={team.teamId} value={team.teamId}>
							{team.name}
						</SelectItem>
					))}
					{teamField.currentTeam && (
						<SelectItem value={teamField.currentTeam.teamId}>{teamField.currentTeam.name}</SelectItem>
					)}
					{!teamField.currentTeam && <SelectItem value="new">New team…</SelectItem>}
				</SelectContent>
			</Select>
			{teamField.teamChoice === "new" && (
				<>
					<div>
						<FieldLabel>Name</FieldLabel>
						<Input
							value={teamField.newTeamName}
							placeholder="what to call it…"
							onChange={(event) => teamField.setNewTeamName(event.target.value)}
							onBlur={teamField.checkNewTeamName}
						/>
						{teamField.newTeamRejection && (
							<p className="text-destructive mt-1 text-xs">{teamField.newTeamRejection}</p>
						)}
					</div>
					<TeamInviteFields
						teamId={null}
						teamName={teamField.newTeamName}
						pendingInvites={teamField.pendingInvites}
						onPendingInvitesChange={teamField.setPendingInvites}
					/>
					<div className="flex items-center gap-2 text-sm">
						<Switch
							checked={teamField.isNewTeamPublic}
							onCheckedChange={teamField.setNewTeamPublic}
							aria-label="Public"
						/>
						Public
					</div>
				</>
			)}
		</div>
	)
}
