// the invented people and data the stories render. every name is made up and every address is at example.com, so no
// story holds real user data
import type { authClient } from "@carlnotes/client/authClient"
import type { ProfileIdentity } from "@carlnotes/contracts/profiles"

/** The instant every fixture was created and updated, so a story renders the same dates on every run. */
export const FIXTURE_DATE = new Date("2026-10-01T12:00:00.000Z")

/** Who a story renders for: a visitor, a signed-in user, or an admin. */
export type StorySessionName = "visitor" | "user" | "admin"

/** The session Better Auth's useSession returns, with the user fields the api's auth config adds. */
export type StorySession = typeof authClient.$Infer.Session

/** The invented people a story shows, the signed-in story user first. */
export const STORY_PEOPLE = [
	{ userId: "user-vienna", username: "vienna", name: "Vienna Example" },
	{ userId: "user-carlos", username: "carlos", name: "Carlos Example" },
	{ userId: "user-evan", username: "evan", name: "Evan Example" },
] as const

/** The signed-in story user, the first of the story people. */
export const STORY_USER = STORY_PEOPLE[0]

/** The signed-in story admin. */
export const STORY_ADMIN = { userId: "user-laura", username: "laura", name: "Laura Example" } as const

/**
 * The session for each person a story can name.
 */
export const STORY_SESSIONS: Record<StorySessionName, StorySession | null> = {
	visitor: null,
	user: toStorySession({ ...STORY_USER, role: "user" }),
	admin: toStorySession({ ...STORY_ADMIN, role: "admin" }),
}

/** The LLM tooling topic. */
export const LLM_TOOLING_TOPIC_FIXTURE = {
	id: "topic-llm-tooling",
	name: "LLM tooling",
	prompt: "New LLM tooling and how teams use it",
}

/**
 * Returns an invented person's profile link identity, with the avatar drawn from their initials.
 */
export function toStoryProfile(
	storyPerson: Pick<ProfileIdentity, "userId" | "username">,
): ProfileIdentity & { avatarSource: "generated" } {
	return { userId: storyPerson.userId, username: storyPerson.username, avatarSource: "generated", avatarVersion: null }
}

/**
 * Returns an invented person's email address, at example.com.
 */
export function toStoryEmail(username: string): string {
	return `${username}@example.com`
}

// one signed-in session for a user
function toStorySession({
	userId,
	name,
	username,
	role,
}: {
	userId: string
	name: string
	username: string
	role: string
}): StorySession {
	// the user, with the extra fields the api's auth config returns
	const user = {
		id: userId,
		name,
		email: toStoryEmail(username),
		emailVerified: true,
		image: null,
		username,
		role,
		plan: "free",
		avatarSource: null,
		avatarKey: null,
		createdAt: FIXTURE_DATE,
		updatedAt: FIXTURE_DATE,
	}

	// the session row beside it
	const session = {
		id: `session-${userId}`,
		userId,
		token: "story-token",
		expiresAt: FIXTURE_DATE,
		createdAt: FIXTURE_DATE,
		updatedAt: FIXTURE_DATE,
	}
	return { user, session }
}
