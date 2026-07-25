import type { TopicResponse, UpdateTopicPayload } from "@shared/contracts"
import { frequencies, visibilities } from "@shared/enums"
import type * as React from "react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { Input } from "@/components/primitives/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Textarea } from "@/components/primitives/textarea"
import { TagPicker, TagPill } from "@/components/TagPicker"
import {
	sendAttachmentDelete,
	sendAttachmentUrl,
	sendTopicCreate,
	sendTopicUpdate,
	uploadTopicAttachment,
} from "@/lib/topicClient"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { AttachmentEditor } from "./AttachmentEditor"
import { type EditableSourceKind, SourceEditor } from "./SourceEditor"

// the field unions that the frequency and visibility selects offer
type Frequency = (typeof frequencies)[number]
type Visibility = (typeof visibilities)[number]

// the topic and its callbacks
type EditTopicModalProps = {
	topic?: TopicResponse
	onClose: () => void
	onTopicSaved: (topicId: string) => Promise<void>
}

/**
 * The edit topic modal for editing or creating a new topic.
 */
export function EditTopicModal({ topic, onClose, onTopicSaved }: EditTopicModalProps) {
	// the title input ref to focus it on open
	const titleInputRef = useRef<HTMLInputElement>(null)
	// every tag across the loaded feed to seed the tag picker's suggestions
	const { knownTags } = useTopicFeed()
	// the editable topic fields which are empty for a new topic
	const [name, setName] = useState(topic?.name ?? "")
	const [prompt, setPrompt] = useState(topic?.prompt ?? "")
	const [tags, setTags] = useState(topic?.tags ?? [])
	const [frequency, setFrequency] = useState<Frequency>(topic?.frequency ?? "daily")
	const [visibility, setVisibility] = useState<Visibility>(topic?.visibility ?? "private")
	const [invitees, setInvitees] = useState(topic?.invitees ?? [])
	// the kept and added source and attachment lists. a new topic starts with the default web source on
	const [keptSources, setKeptSources] = useState(topic?.sources ?? [])
	const [addedSources, setAddedSources] = useState<{ kind: EditableSourceKind; value: string }[]>(
		topic ? [] : [{ kind: "search", value: "" }],
	)
	const [keptAttachments, setKeptAttachments] = useState(topic?.attachments ?? [])
	const [pendingFiles, setPendingFiles] = useState<File[]>([])
	const [pendingUrls, setPendingUrls] = useState<string[]>([])
	// the saving topic state
	const [isSaving, setIsSaving] = useState(false)

	// handleSave creates or updates the topic first, then stages uploads, then stages removals
	const handleSave = async () => {
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

			// fetch and ingest the newly added urls one at a time, dropping each from the pending list as it lands
			for (const url of [...pendingUrls]) {
				await sendAttachmentUrl(topicId, url)
				setPendingUrls((current) => current.filter((pending) => pending !== url))
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
			toast.error(error instanceof Error ? error.message : "Save failed. Carl suggests trying again.")
		} finally {
			setIsSaving(false)
		}
	}

	// the update payload: the topic fields plus the desired invitee and source lists
	const buildUpdatePayload = (): UpdateTopicPayload => ({
		name,
		prompt,
		tags,
		frequency,
		visibility,
		invitees: visibility === "invite" ? invitees : [],
		sources: [
			...keptSources.map((source) => ({ id: source.id })),
			...addedSources.map((source) => ({ kind: source.kind, config: toSourceConfig(source.kind, source.value) })),
		],
	})

	// use the dialog's autofocus to select the title input when the modal opens
	const handleOpenAutoFocus = (event: Event) => {
		event.preventDefault()
		titleInputRef.current?.focus()
	}

	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			{/* min-w-0 on each grid field lets a long url or filename truncate instead of widening the modal */}
			<DialogContent aria-describedby={undefined} onOpenAutoFocus={handleOpenAutoFocus} className="[&>*]:min-w-0">
				<DialogTitle>{topic ? "Edit topic" : "Add topic"}</DialogTitle>

				{/* title */}
				<div>
					<FieldLabel isRequired>Title</FieldLabel>
					<Input ref={titleInputRef} value={name} onChange={(event) => setName(event.target.value)} />
				</div>

				{/* topic prompt */}
				<div>
					<FieldLabel isRequired>{"Carl's Prompt"}</FieldLabel>
					<Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="min-h-24" />
				</div>

				{/* tags pill editor */}
				<div>
					<FieldLabel>Tags</FieldLabel>
					<TagPicker tags={tags} knownTags={knownTags} canCreate onTagsChange={setTags} />
				</div>

				{/* frequency and visibility side by side */}
				<div className="grid grid-cols-2 gap-3">
					<div>
						<FieldLabel>Frequency</FieldLabel>
						<Select value={frequency} onValueChange={(value) => setFrequency(value as Frequency)}>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{frequencies.map((frequencyOption) => (
									<SelectItem key={frequencyOption} value={frequencyOption}>
										{frequencyOption}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div>
						<FieldLabel>Visibility</FieldLabel>
						<Select value={visibility} onValueChange={(value) => setVisibility(value as Visibility)}>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{visibilities.map((visibilityOption) => (
									<SelectItem key={visibilityOption} value={visibilityOption}>
										{VISIBILITY_GLYPH[visibilityOption]} {visibilityOption}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				{/* invitees only shown while visibility is invite */}
				{visibility === "invite" && <InviteeEditor invitees={invitees} onChange={setInvitees} />}

				{/* topic sources: kept rows, added rows, and the add picker */}
				<div>
					<FieldLabel>Sources</FieldLabel>
					<SourceEditor
						keptSources={keptSources}
						addedSources={addedSources}
						onKeptChange={setKeptSources}
						onAddedChange={setAddedSources}
					/>
				</div>

				{/* attachments: kept pills, staged uploads and urls, and the add attachments controls */}
				<div>
					<FieldLabel>Attachments</FieldLabel>
					<AttachmentEditor
						keptAttachments={keptAttachments}
						pendingFiles={pendingFiles}
						pendingUrls={pendingUrls}
						onKeptChange={setKeptAttachments}
						onPendingChange={setPendingFiles}
						onPendingUrlsChange={setPendingUrls}
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

// the glyph shown beside each visibility option
const VISIBILITY_GLYPH: Record<Visibility, string> = { private: "🔒", public: "🌐", invite: "✉️" }

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
	const handleInvite = () => {
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
				shown only when visibility is invite — invitees can view and subscribe
			</p>
		</div>
	)
}

// build a new source's config from the selector field
function toSourceConfig(sourceKind: EditableSourceKind, value: string): Record<string, unknown> {
	if (sourceKind === "rss") {
		return { url: value }
	}

	// the web scout needs no config. its adapter derives queries from the topic prompt
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
