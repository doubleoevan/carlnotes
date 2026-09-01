// the editable topic fields for the edit modal, and the payload they save as
import { MAX_ATTACHMENT_CONTEXT_CHARS, type TopicResponse, type UpdateTopicPayload } from "@shared/contracts"
import type { visibilities } from "@shared/enums"
import { DEFAULT_SOURCES, toCustomSourceOption, toDefaultSource } from "@shared/sources"
import { type Dispatch, type SetStateAction, useState } from "react"
import { toPossibleSourceUrls } from "@/lib/topicPromptUrls"
import type { DayOfWeek, Frequency } from "./EditTopicFields"
import type { AddedSource } from "./TopicSourceEditor"

// the field union that the visibility select offers
export type Visibility = (typeof visibilities)[number]

// every editable field with its setter, plus what the modal derives from them
export type TopicFields = {
	name: string
	setName: (name: string) => void
	prompt: string
	setPrompt: (prompt: string) => void
	tags: string[]
	setTags: (tags: string[]) => void
	// the schedule: how often, at what time, and on which day for weekly
	frequency: Frequency
	setFrequency: (frequency: Frequency) => void
	scheduledTime: string
	setScheduledTime: (scheduledTime: string) => void
	scheduledDayOfWeek: DayOfWeek
	setScheduledDayOfWeek: (scheduledDayOfWeek: DayOfWeek) => void
	// who may see the topic and how many findings a scan keeps
	visibility: Visibility
	setVisibility: (visibility: Visibility) => void
	maxResults: number
	setMaxResults: (maxResults: number) => void
	// the follower invites queued for the save
	emailInvites: string[]
	setEmailInvites: (emailInvites: string[]) => void
	usernameInvites: string[]
	setUsernameInvites: (usernameInvites: string[]) => void
	// the sources: the default ones toggled on, the custom ones kept, and the ones newly added
	defaultSourceKeys: string[]
	setDefaultSourceKeys: (defaultSourceKeys: string[]) => void
	keptSources: TopicResponse["sources"]
	setKeptSources: (keptSources: TopicResponse["sources"]) => void
	addedSources: AddedSource[]
	setAddedSources: (addedSources: AddedSource[]) => void
	// the attachments already stored and the files staged to upload with the save
	keptAttachments: TopicResponse["attachments"]
	setKeptAttachments: (keptAttachments: TopicResponse["attachments"]) => void
	pendingFiles: File[]
	setPendingFiles: Dispatch<SetStateAction<File[]>>
	// the urls written in the prompt that are still set to become Sources, and the way to drop one
	promptSourceUrls: string[]
	dismissSourceUrl: (url: string) => void
	// what the ready attachments say
	attachmentContext: string
}

/**
 * The edit modal's own copy of a topic, seeded from the one being edited or left empty for a new one.
 * The fields stay here next to the payload they build.
 */
export function useTopicFields(topic: TopicResponse | undefined, isMakingTopicPublic?: boolean): TopicFields {
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

	return {
		name,
		setName,
		prompt,
		setPrompt,
		tags,
		setTags,
		frequency,
		setFrequency,
		scheduledTime,
		setScheduledTime,
		scheduledDayOfWeek,
		setScheduledDayOfWeek,
		visibility,
		setVisibility,
		maxResults,
		setMaxResults,
		emailInvites,
		setEmailInvites,
		usernameInvites,
		setUsernameInvites,
		defaultSourceKeys,
		setDefaultSourceKeys,
		keptSources,
		setKeptSources,
		addedSources,
		setAddedSources,
		keptAttachments,
		setKeptAttachments,
		pendingFiles,
		setPendingFiles,
		promptSourceUrls,
		dismissSourceUrl: (url: string) => setDismissedSourceUrls([...dismissedSourceUrls, url]),
		attachmentContext,
	}
}

/**
 * The update topic payload: the topic fields plus the desired invitee and source lists.
 */
export function toUpdateTopicPayload(fields: TopicFields): UpdateTopicPayload {
	// every default source that is on is staged as its own row, and every selected one is built by its option
	const defaultSources = DEFAULT_SOURCES.filter((defaultSource) => fields.defaultSourceKeys.includes(defaultSource.key))
	const stagedDefaultSources = defaultSources.map((defaultSource) => ({
		sourceKind: defaultSource.sourceKind,
		config: defaultSource.toConfig(),
	}))
	const stagedCustomSources = fields.addedSources.flatMap((addedSource) => {
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
		name: fields.name,
		prompt: fields.prompt,
		tags: fields.tags,
		frequency: fields.frequency,
		scheduledTime: fields.scheduledTime,
		scheduledDayOfWeek: fields.scheduledDayOfWeek,
		visibility: fields.visibility,
		maxResults: fields.maxResults,
		inviteEmails: fields.visibility !== "private" ? fields.emailInvites : [],
		// the urls still showing under the prompt save as Sources along with the ones added from the sources section
		sources: [
			...stagedDefaultSources,
			...fields.keptSources.map((source) => ({ id: source.id })),
			...stagedCustomSources,
			...fields.promptSourceUrls.map((url) => ({ sourceKind: "url" as const, config: { url } })),
		],
	}
}

// the visibility the modal opens on. the Share menu asks for public, and everything else opens on the topic's own
function toStartingVisibility(topic: TopicResponse | undefined, isMakingTopicPublic?: boolean): Visibility {
	if (isMakingTopicPublic) {
		return "public"
	}
	return topic?.visibility ?? "invite"
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
