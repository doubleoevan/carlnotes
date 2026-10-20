// the pgEnums and the column helpers that every schema file shares
import {
	attachmentStatuses,
	avatarSources,
	billingIntervals,
	chatAttachmentKinds,
	chatTurnKinds,
	daysOfWeek,
	frequencies,
	inviteAccesses,
	noteVisibilities,
	plans,
	podcastEpisodeSpeakers,
	podcastEpisodeStatuses,
	promptVersionOrigins,
	ratings,
	resourceKinds,
	scanStatuses,
	sourceKinds,
	sourceVisibilities,
	teamRoles,
	visibilities,
} from "@shared/enums"
import { pgEnum, text, timestamp } from "drizzle-orm/pg-core"

// domain pgEnums built from the shared value sets
export const sourceKind = pgEnum("source_kind", sourceKinds)
export const resourceKind = pgEnum("resource_kind", resourceKinds)
export const visibility = pgEnum("visibility", visibilities)
export const frequency = pgEnum("frequency", frequencies)
export const dayOfWeek = pgEnum("day_of_week", daysOfWeek)
// the enums for a scan's outcome, a podcast episode's status, a finding, and a user's account
export const scanStatus = pgEnum("scan_status", scanStatuses)
export const podcastEpisodeStatus = pgEnum("episode_status", podcastEpisodeStatuses)
// who speaks a podcast episode's turn, and who answered a question asked from the podcast player
export const podcastEpisodeSpeaker = pgEnum("episode_speaker", podcastEpisodeSpeakers)
export const sourceVisibility = pgEnum("source_visibility", sourceVisibilities)
export const rating = pgEnum("rating", ratings)
export const plan = pgEnum("plan", plans)
// how often a subscription bills, this determines its plan limits and whether it supports metered overage
export const billingInterval = pgEnum("billing_interval", billingIntervals)
// the attachment async-processing status enum, shared by topic attachments and kept chat attachments
export const attachmentStatus = pgEnum("attachment_status", attachmentStatuses)
// a source's llm-guard screening status, its own type so the column's type names what it holds
export const sourceStatus = pgEnum("source_status", attachmentStatuses)
// what a kept chat attachment originally was
export const chatAttachmentKind = pgEnum("chat_attachment_kind", chatAttachmentKinds)
// what a chat turn row records
export const chatTurnKind = pgEnum("chat_turn_kind", chatTurnKinds)
// where a user's public avatar image comes from. only oauth and upload have a stored object
export const avatarSource = pgEnum("avatar_source", avatarSources)
// a member's team role, and who may address an invite to a user
export const teamRole = pgEnum("team_role", teamRoles)
export const inviteAccess = pgEnum("invite_access", inviteAccesses)
// who may see a note
export const noteVisibility = pgEnum("note_visibility", noteVisibilities)
// where a topic prompt version was saved from
export const promptVersionOrigin = pgEnum("prompt_version_origin", promptVersionOrigins)

/**
 * Returns every table's text primary key column, defaulted by our code and overridden by Better Auth on its own inserts.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's column builder type is generated, and naming it here would break on an upgrade
export function primaryId() {
	return text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID())
}

/**
 * Returns the created and updated column pair with time zones, for the app tables that keep both.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's column builder types are generated, and naming them here would break on an upgrade
export function timestamps() {
	return {
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		// updated_at auto-touches on every table row write
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	}
}
