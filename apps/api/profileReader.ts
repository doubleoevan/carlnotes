// who reads a person's profile and news, and the Topics of the person's own that each reader opens

import { toConvertedPersonalSourcesFilter } from "@carlnotes/db/personalSourcesAuthority"
import { topics } from "@carlnotes/db/schema/topics"
import { and, eq, ne, or, type SQL } from "drizzle-orm"
import { isAllowed } from "./authorization"

// the person, an admin who is not the person, or anyone else, who reads what a visitor reads
export type ProfileReader = "person" | "admin" | "visitor"

/**
 * Loads who reads a person's profile: the person, an admin, or anyone else as a visitor.
 */
export async function loadProfileReader(profileUserId: string, userId: string | null): Promise<ProfileReader> {
	if (userId === profileUserId) {
		return "person"
	}
	return userId !== null && (await isAllowed(userId, "admin:console")) ? "admin" : "visitor"
}

/**
 * Returns the filter of the Topics a person owns that a reader opens. The person opens every one, an admin every one
 * but a private Topic whose Personal sources text is not converted, and a visitor the public ones.
 */
export function toOwnTopicFilter(profileUserId: string, profileReader: ProfileReader): SQL | undefined {
	const visibleTopicFilter = {
		person: undefined,
		admin: or(ne(topics.visibility, "private"), toConvertedPersonalSourcesFilter()),
		visitor: eq(topics.visibility, "public"),
	}[profileReader]
	return and(eq(topics.ownerId, profileUserId), visibleTopicFilter)
}
