// a topic's viewers and a podcast episode's listeners, counted as unique people in one Redis HyperLogLog counter
// each. a changed counter is listed in a set that the scheduled sync takes
import { runWithRedis } from "./redis"

// the topic or the podcast episode a counter counts
export type ViewerCountRef = { kind: "topic" | "podcastEpisode"; id: string }

// what a rebuilt Redis counts for one topic or podcast episode. its saved counter, and the signed-in people Postgres
// records as its viewers or listeners
export type SavedViewerCounter = { viewerCountRef: ViewerCountRef; counter: Uint8Array }
export type ViewerCountSeed = { viewerCountRef: ViewerCountRef; elements: string[] }

// how many elements one PFADD sends, so a long list never makes one huge command
const SEED_ELEMENTS_PER_ADD = 500

// the set of topics and podcast episodes whose counter changed since the sync last took it
const CHANGED_REFS_KEY = "viewer-counts:changed"

// set once the sync has merged the saved counters back into Redis. a Redis restart comes back without it
const RESTORED_KEY = "viewer-counts:restored"

// the temporary key a saved counter is written to before it merges into the live counter
const RESTORE_KEY_PREFIX = "viewer-counts:restoring:"

// add the element to the counter, and list the counter's ref as changed if the add changed the counter
const ADD_VIEWER_SCRIPT =
	"if redis.call('PFADD', KEYS[1], ARGV[1]) == 1 then redis.call('SADD', KEYS[2], ARGV[2]) end return 1"

// return every changed ref and empty the set in one step, so a ref added meanwhile waits for the next take
const TAKE_CHANGED_REFS_SCRIPT =
	"local members = redis.call('SMEMBERS', KEYS[1]) redis.call('DEL', KEYS[1]) return members"

/**
 * Counts the element among a topic's viewers or a podcast episode's listeners. A Redis failure loses the count.
 */
export async function addViewer(viewerCountRef: ViewerCountRef, element: string): Promise<void> {
	// the script's two keys, the counter and the changed set, then the element and the ref's member
	const scriptArguments = [toCounterKey(viewerCountRef), CHANGED_REFS_KEY, element, toChangedSetMember(viewerCountRef)]
	await runWithRedis("viewer count add", (client) => client.send("EVAL", [ADD_VIEWER_SCRIPT, "2", ...scriptArguments]))
}

/**
 * Returns the estimated viewers or listeners, 0 if nobody was counted, or null if Redis fails.
 */
export async function readViewerEstimate(viewerCountRef: ViewerCountRef): Promise<number | null> {
	const estimate = await runWithRedis("viewer count read", (client) =>
		client.send("PFCOUNT", [toCounterKey(viewerCountRef)]),
	)
	return typeof estimate === "number" ? estimate : null
}

/**
 * Takes every ref whose counter changed since the last take, or null if Redis fails.
 */
export async function takeChangedViewerCountRefs(): Promise<ViewerCountRef[] | null> {
	const members = await runWithRedis("viewer count take", (client) =>
		client.send("EVAL", [TAKE_CHANGED_REFS_SCRIPT, "1", CHANGED_REFS_KEY]),
	)
	if (!Array.isArray(members)) {
		return null
	}

	// read each member back as its ref, skipping any this module never wrote
	return members.flatMap((member) => {
		const viewerCountRef = typeof member === "string" ? toViewerCountRef(member) : null
		return viewerCountRef ? [viewerCountRef] : []
	})
}

/**
 * Lists the refs as changed again, for a sync that could not save them.
 */
export async function markViewerCountRefsChanged(viewerCountRefs: ViewerCountRef[]): Promise<void> {
	await runWithRedis("viewer count mark", (client) =>
		client.send("SADD", [CHANGED_REFS_KEY, ...viewerCountRefs.map(toChangedSetMember)]),
	)
}

/**
 * Returns the counter as the bytes Redis stores, or null if it has none or Redis fails.
 */
export async function readViewerCounter(viewerCountRef: ViewerCountRef): Promise<Uint8Array | null> {
	return runWithRedis("viewer counter read", (client) => client.getBuffer(toCounterKey(viewerCountRef)))
}

/**
 * Returns whether Redis still holds the saved counters the sync merged back, or null if Redis fails.
 */
export async function hasRestoredViewerCounters(): Promise<boolean | null> {
	const restoredKeyCount = await runWithRedis("viewer count restored read", (client) =>
		client.send("EXISTS", [RESTORED_KEY]),
	)
	return typeof restoredKeyCount === "number" ? restoredKeyCount > 0 : null
}

/**
 * Rebuilds the counters in Redis from Postgres: merges each saved counter into its live counter, keeping what was
 * counted since a restart, adds each signed-in person Postgres records, lists every seeded ref as changed, then marks
 * the counters restored. Adding a person again changes nothing, so a rerun is safe. Returns false if Redis fails
 * partway, so the next sync tries again.
 */
export async function restoreViewerCounters({
	savedCounters,
	viewerCountSeeds,
}: {
	savedCounters: SavedViewerCounter[]
	viewerCountSeeds: ViewerCountSeed[]
}): Promise<boolean> {
	for (const { viewerCountRef, counter } of savedCounters) {
		// write the saved bytes to a temporary key, merge them into the live counter, and drop the temporary key
		const restoreKey = `${RESTORE_KEY_PREFIX}${toChangedSetMember(viewerCountRef)}`
		const isMerged = await runWithRedis("viewer counter restore", async (client) => {
			await client.set(restoreKey, counter)
			await client.send("PFMERGE", [toCounterKey(viewerCountRef), toCounterKey(viewerCountRef), restoreKey])
			await client.del(restoreKey)
			return true
		})

		// stop the restore if a counter fails to merge, and the next sync runs it again from the start
		if (!isMerged) {
			return false
		}
	}

	// add the signed-in people, and stop if Redis fails
	if (!(await seedViewerCounters(viewerCountSeeds))) {
		return false
	}

	// mark the counters restored
	return (await runWithRedis("viewer count restored write", (client) => client.set(RESTORED_KEY, "1"))) !== null
}

// add each seed's elements to its counter a batch at a time, and list each seeded ref as changed
async function seedViewerCounters(viewerCountSeeds: ViewerCountSeed[]): Promise<boolean> {
	for (const { viewerCountRef, elements } of viewerCountSeeds) {
		for (let start = 0; start < elements.length; start += SEED_ELEMENTS_PER_ADD) {
			const elementBatch = elements.slice(start, start + SEED_ELEMENTS_PER_ADD)
			const addResult = await runWithRedis("viewer count seed", (client) =>
				client.send("PFADD", [toCounterKey(viewerCountRef), ...elementBatch]),
			)
			if (addResult === null) {
				return false
			}
		}
	}

	// list the seeded refs as changed
	const seededRefs = viewerCountSeeds.filter(({ elements }) => elements.length > 0)
	if (seededRefs.length === 0) {
		return true
	}
	const changedResult = await runWithRedis("viewer count seed mark", (client) =>
		client.send("SADD", [
			CHANGED_REFS_KEY,
			...seededRefs.map(({ viewerCountRef }) => toChangedSetMember(viewerCountRef)),
		]),
	)
	return changedResult !== null
}

// the Redis key of the ref's counter
function toCounterKey(viewerCountRef: ViewerCountRef): string {
	return viewerCountRef.kind === "topic"
		? `viewers:topic:${viewerCountRef.id}`
		: `listeners:podcastEpisode:${viewerCountRef.id}`
}

/**
 * Returns the ref as a member of the changed set, which also keys a ref in a map.
 */
export function toChangedSetMember(viewerCountRef: ViewerCountRef): string {
	return `${viewerCountRef.kind}:${viewerCountRef.id}`
}

// a changed set member read back as its ref, or null for one this module never wrote
function toViewerCountRef(member: string): ViewerCountRef | null {
	// the kind comes before the first colon, and the id is everything after it
	const [kind, ...idParts] = member.split(":")
	const id = idParts.join(":")
	if ((kind !== "topic" && kind !== "podcastEpisode") || !id) {
		return null
	}
	return { kind, id }
}
