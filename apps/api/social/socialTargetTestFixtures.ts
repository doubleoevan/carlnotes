// the resolved social targets and shared comment slots that the social tests read
import type { ResolvedSocialTarget } from "./socialTargets"

// a public Topic
const PUBLIC_TOPIC: ResolvedSocialTarget["topic"] = {
	id: "topic-1",
	ownerId: "owner-1",
	visibility: "public",
	teamId: null,
	name: "Coffee",
}

// a Finding on the public Topic
export const RESOLVED_FINDING: ResolvedSocialTarget = {
	commentTarget: { kind: "finding", id: "finding-1" },
	topic: PUBLIC_TOPIC,
	path: "/topics/topic-1/coffee?finding=finding-1",
	label: "A Good Page",
}

// a Podcast Episode on the public Topic
export const RESOLVED_PODCAST_EPISODE: ResolvedSocialTarget = {
	commentTarget: { kind: "podcastEpisode", id: "episode-1" },
	topic: PUBLIC_TOPIC,
	path: "/topics/topic-1/coffee/episodes/2026/1",
	label: "Episode One",
}

// a Topic's shared comment slots as an editor reads them
export const EDITOR_SHARED_COMMENT_SLOTS = { usedCount: 1, slotCount: 3 }
