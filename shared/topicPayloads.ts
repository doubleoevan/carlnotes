// the topic request payloads: the draft, the create, the prompt and field updates, the proposed edit, the sources,
// the attachments, the podcast switch, and the feature order
import { z } from "zod"
import {
	MAX_ATTACHMENT_CONTEXT_CHARS,
	MAX_DRAFT_INVITES,
	MAX_TOPIC_DRAFT_TAGS,
	MAX_TOPIC_SOURCES,
	TOPIC_DRAFT_TAG_CHARS,
	TOPIC_NAME_CHARS,
	TOPIC_PROMPT_CHARS,
	updateTopicSource,
} from "./contracts"
import { daysOfWeek, frequencies, maxTopicFindingsOptions, visibilities } from "./enums"
import { customSourceKeys, defaultSourceKeys } from "./sources"

// the topic tool payloads
export const updateTopicPromptPayload = z.object({ prompt: z.string().trim().min(1).max(TOPIC_PROMPT_CHARS) })

export const addTopicSourcePayload = z.object({
	// a source option key and its value. a default source takes no value
	sourceOption: z.enum([...defaultSourceKeys, ...customSourceKeys]),
	value: z.string().trim().max(2000).default(""),
})

export const removeTopicSourcePayload = z.object({ sourceId: z.string().min(1) })

export type AddTopicSourcePayload = z.infer<typeof addTopicSourcePayload>

// the tags a chat writes, and the results count as one of the editor's choices
const topicDraftTagsPayload = z.array(z.string().trim().min(1).max(TOPIC_DRAFT_TAG_CHARS)).max(MAX_TOPIC_DRAFT_TAGS)

const maxTopicFindingsPayload = z
	.number()
	.refine((value) => (maxTopicFindingsOptions as readonly number[]).includes(value))

// the time of day a scan runs, as HH:MM
export const scheduledTimePayload = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM")

// the settings that a topic and a topic draft both have. each is optional, so a call names only the settings it changes
export const topicSettingsShape = {
	name: z.string().trim().min(1).max(TOPIC_NAME_CHARS).optional(),
	tags: topicDraftTagsPayload.optional(),
	visibility: z.enum(visibilities).optional(),
	frequency: z.enum(frequencies).optional(),
	scheduledTime: scheduledTimePayload.optional(),
	scheduledDayOfWeek: z.enum(daysOfWeek).optional(),
	maxTopicFindings: maxTopicFindingsPayload.optional(),
}

// a change to a saved topic's settings. the settings that a topic draft shares, and whether the topic's podcast is on
export const updateTopicFieldsPayload = z
	.object({ ...topicSettingsShape, isPodcastEnabled: z.boolean().optional() })
	.refine((fields) => Object.values(fields).some((value) => value !== undefined), "name at least one field")

export type UpdateTopicFieldsPayload = z.infer<typeof updateTopicFieldsPayload>

// what carl proposes changing, which the card previews over the topic as it stands. sources are named as the two
// acts the saving tools take, one adding and one dropping, so a source he does not name is never read as a removal
export const proposeTopicEditPayload = updateTopicFieldsPayload.extend({
	prompt: z.string().trim().min(1).max(TOPIC_PROMPT_CHARS).optional(),
	addSources: z.array(addTopicSourcePayload).max(MAX_TOPIC_SOURCES).optional(),
	removeSourceIds: z.array(z.string().min(1)).max(MAX_TOPIC_SOURCES).optional(),
})

export type ProposeTopicEditPayload = z.infer<typeof proposeTopicEditPayload>

// a team the topic draft names: its id for the save, its name for the card and for carl
export const topicDraftTeamPayload = z.object({
	teamId: z.string().trim().min(1),
	name: z.string().trim().min(1).max(200),
})

export type TopicDraftTeam = z.infer<typeof topicDraftTeamPayload>

// the topic draft the new-topic chat holds: what carl has written down so far, every field starting empty
export const topicDraftPayload = z.object({
	name: z.string().trim().max(TOPIC_NAME_CHARS).default(""),
	prompt: z.string().trim().max(TOPIC_PROMPT_CHARS).default(""),
	sources: z.array(addTopicSourcePayload).max(MAX_TOPIC_SOURCES).default([]),
	inviteEmails: z.array(z.string().trim().toLowerCase().pipe(z.email())).max(MAX_DRAFT_INVITES).default([]),
	// who may read the topic, shared by invite unless the topic draft says otherwise
	visibility: z.enum(visibilities).default("invite"),
	// the team the topic joins at the save, one the user leads, or none
	team: topicDraftTeamPayload.nullable().default(null),
	// the settings a new topic draft starts with: no tags, a weekly scan on Wednesday morning, and ten findings kept
	tags: topicDraftTagsPayload.default([]),
	frequency: z.enum(frequencies).default("weekly"),
	scheduledTime: scheduledTimePayload.default("09:00"),
	scheduledDayOfWeek: z.enum(daysOfWeek).default("wednesday"),
	maxTopicFindings: maxTopicFindingsPayload.default(10),
	// whether the topic's podcast is on. absent on an instance with no speech model, which has no podcast
	isPodcastEnabled: z.boolean().optional(),
})

export type TopicDraft = z.infer<typeof topicDraftPayload>

// a topic draft with nothing written yet, every field at the payload's own default
export const EMPTY_TOPIC_DRAFT: TopicDraft = Object.freeze(topicDraftPayload.parse({}))

// the create_topic tool's input over mcp: a draft whose name and prompt are required
export const createTopicPayload = topicDraftPayload.extend({
	name: z.string().trim().min(1).max(TOPIC_NAME_CHARS),
	prompt: z.string().trim().min(1).max(TOPIC_PROMPT_CHARS),
})

// the body that turns a topic's podcast switch on or off
export const topicPodcastPayload = z.object({ isPodcastEnabled: z.boolean() })

// the source suggestions body
export const suggestSourcesPayload = z.object({
	name: z.string().trim(),
	prompt: z.string().trim(),
	attachmentContext: z.string().trim().max(MAX_ATTACHMENT_CONTEXT_CHARS).default(""),
	excludeSources: z
		.array(z.object({ sourceOption: z.enum(customSourceKeys), value: z.string() }))
		.max(MAX_TOPIC_SOURCES),
	limit: z.number().int().min(1).max(MAX_TOPIC_SOURCES),
})

export type SuggestSourcesPayload = z.infer<typeof suggestSourcesPayload>

// the topic update body the edit modal saves. invites and sources are lists that the api reconciles
export const updateTopicPayload = z.object({
	// the editable topic fields
	name: z.string().trim().min(1),
	prompt: z.string().trim().min(1),
	tags: z.array(z.string().trim().min(1)),
	frequency: z.enum(frequencies),
	scheduledTime: scheduledTimePayload,
	scheduledDayOfWeek: z.enum(daysOfWeek),
	visibility: z.enum(visibilities),
	// how many findings a scan is set to keep for this topic
	maxTopicFindings: maxTopicFindingsPayload,
	// the full list of a topic's invited email addresses
	inviteEmails: z.array(z.string().trim().toLowerCase().pipe(z.email())),
	// stored, staged, and prompt-derived Sources are combined into one array and limited to MAX_TOPIC_SOURCES
	sources: z.array(updateTopicSource).max(MAX_TOPIC_SOURCES),
})

export type UpdateTopicPayload = z.infer<typeof updateTopicPayload>

// the edited attachment context body
export const attachmentContextPayload = z.object({ context: z.string().trim().max(MAX_ATTACHMENT_CONTEXT_CHARS) })

// the payload for attaching a page by url
export const attachmentUrlPayload = z.object({ url: z.string().trim().min(1).max(2000) })

// the admin's featured topics order choice
export const topicFeatureOrderPayload = z.object({ position: z.number().int().min(0) })
