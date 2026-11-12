// the Redis day buffer for the daily view and play counts. a view counts once per person, item, and UTC day, and a play
// once per person, podcast episode, and format in five minutes. a person reaches Redis only as a keyed hash. each daily
// count row's count waits in one Redis hash and its people in one HyperLogLog sketch, until the minute sweep takes them
// into Postgres
import { createHash } from "node:crypto"
import { toChunks } from "@carlnotes/contracts/arrays"
import type { Place, ViewItemKind } from "@carlnotes/contracts/dashboards"
import type { PodcastEpisodeFormat } from "@carlnotes/contracts/podcast"
import { toUtcDay } from "@carlnotes/contracts/time"
import { toAuthSecretSignature } from "@carlnotes/server/hmac"
import { runWithRedis } from "./redis"

// one daily view count row and one daily play count row, before the place is reduced to its key
export type DailyViewCountRow = {
	dailyCountKind: "view"
	// the item viewed, its UTC day, and the place
	itemKind: ViewItemKind
	itemId: string
	day: string
	place: Place | null
}
export type DailyPlayCountRow = {
	dailyCountKind: "play"
	// the podcast episode and its format, the UTC day, and the place
	podcastEpisodeId: string
	format: PodcastEpisodeFormat
	day: string
	place: Place | null
}
type DailyCountRow = DailyViewCountRow | DailyPlayCountRow

// a taken daily count row, the views or plays counted since the last take, and the hash field that names it in Redis
export type DailyCountEntry = { dailyCountRow: DailyCountRow; count: number; dailyCountField: string }

// a daily count row's saved sketch, and the hash fields whose taken sketches merge into it
type DailyCountSketchMerge = { savedSketch: Uint8Array | null; dailyCountFields: string[] }

// a daily count row's five place columns, all null for a row with no known place
export type PlaceColumns = Record<keyof Place, string | null>

// how long a day's set of an item's viewers lasts after its latest new viewer, a day and two hours, and how long a
// play's claim lasts
const VIEW_CLAIM_SECONDS = 26 * 60 * 60
const PLAY_CLAIM_SECONDS = 5 * 60

// how long a row's sketch waits for the sweep before Redis drops it
const SKETCH_SECONDS = 3 * 24 * 60 * 60

// the hash of every buffered row's count, and the prefixes of the claim, sketch, taken sketch, merge, and counting keys
const COUNTS_KEY = "daily-counts:counts"
const CLAIM_KEY_PREFIX = "daily-counts:claim:"
const SKETCH_KEY_PREFIX = "daily-counts:people:"
const TAKEN_SKETCH_KEY_PREFIX = "daily-counts:taken:"
const MERGE_KEY_PREFIX = "daily-counts:merging:"
const COUNT_KEY_PREFIX = "daily-counts:counting:"

// how long a counting or merge key lives if its work stops before it drops the key
const TEMPORARY_KEY_SECONDS = 600

// how many sketches or groups one Redis call writes or counts
const SKETCH_CHUNK_SIZE = 100

// how many characters of a person's keyed hash Redis holds, 132 bits
const PERSON_HASH_LENGTH = 22

// the place key of a view or play with no known place
const UNKNOWN_PLACE_KEY = "unknown"

// count the row and add the person to its sketch, if the person's claim is new
const COUNT_SCRIPT_TAIL = `redis.call('HINCRBY', KEYS[2], ARGV[2], 1)
redis.call('PFADD', KEYS[3], ARGV[3])
redis.call('EXPIRE', KEYS[3], ARGV[4])
return 1 end return 0`

// claim the person's view in the set of the item's viewers that day, then count it
const VIEW_COUNT_SCRIPT = `if redis.call('SADD', KEYS[1], ARGV[3]) == 1 then
redis.call('EXPIRE', KEYS[1], ARGV[1])
${COUNT_SCRIPT_TAIL}`

// claim the person's play under its own key for five minutes, then count it
const PLAY_COUNT_SCRIPT = `if redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[1]) then
${COUNT_SCRIPT_TAIL}`

// return every row's count and empty the hash, and move each row's sketch to its taken key in the same step
const TAKE_SCRIPT = `local entries = redis.call('HGETALL', KEYS[1])
redis.call('DEL', KEYS[1])
for i = 1, #entries, 2 do
if redis.call('EXISTS', ARGV[1] .. entries[i]) == 1 then redis.call('RENAME', ARGV[1] .. entries[i], ARGV[2] .. entries[i]) end
end return entries`

// add a taken row's count back to the hash, and merge its taken sketch back into its live sketch
const RETURN_SCRIPT = `redis.call('HINCRBY', KEYS[1], ARGV[1], ARGV[2])
if redis.call('EXISTS', KEYS[3]) == 1 then redis.call('PFMERGE', KEYS[2], KEYS[2], KEYS[3]) redis.call('DEL', KEYS[3]) end
return 1`

// one view: what was viewed, who viewed it, where from, and when
type AddDailyViewOptions = {
	itemKind: ViewItemKind
	itemId: string
	element: string
	place: Place | null
	viewedAt?: Date
}

// one play: the podcast episode and its format, who played it, where from, and when
type AddDailyPlayOptions = {
	podcastEpisodeId: string
	format: PodcastEpisodeFormat
	element: string
	place: Place | null
	playedAt?: Date
}

// one person's view or play of a row: the row, the script that claims and counts it, the claim's key for the person's
// hash and its lifetime, and the person's element
type BufferDailyCountRowOptions = {
	dailyCountRow: DailyCountRow
	countScript: string
	toClaimKey: (personHash: string) => string
	claimSeconds: number
	element: string
}

/**
 * Counts a view of an item in its UTC day and place, once per person, item, and day. A Redis failure, or an unset auth
 * secret, loses the view.
 */
export async function addDailyView({
	itemKind,
	itemId,
	element,
	place,
	viewedAt = new Date(),
}: AddDailyViewOptions): Promise<void> {
	const day = toUtcDay(viewedAt)
	await bufferDailyCountRow({
		dailyCountRow: { dailyCountKind: "view", itemKind, itemId, day, place },
		countScript: VIEW_COUNT_SCRIPT,
		toClaimKey: () => `${CLAIM_KEY_PREFIX}view:${day}:${itemKind}:${itemId}`,
		claimSeconds: VIEW_CLAIM_SECONDS,
		element,
	})
}

/**
 * Counts a play of a podcast episode in its format, UTC day, and place, once per person, podcast episode, and format in
 * five minutes, so a podcast app's retried download counts once. A Redis failure, or an unset auth secret, loses the
 * play.
 */
export async function addDailyPlay({
	podcastEpisodeId,
	format,
	element,
	place,
	playedAt = new Date(),
}: AddDailyPlayOptions): Promise<void> {
	await bufferDailyCountRow({
		dailyCountRow: { dailyCountKind: "play", podcastEpisodeId, format, day: toUtcDay(playedAt), place },
		countScript: PLAY_COUNT_SCRIPT,
		toClaimKey: (personHash) => `${CLAIM_KEY_PREFIX}play:${podcastEpisodeId}:${format}:${personHash}`,
		claimSeconds: PLAY_CLAIM_SECONDS,
		element,
	})
}

/**
 * Takes every buffered row's count, moving each row's sketch aside for the sweep, or returns null if Redis fails.
 */
export async function takeDailyCountEntries(): Promise<DailyCountEntry[] | null> {
	const flatEntries = await runWithRedis("daily count take", (client) =>
		client.send("EVAL", [TAKE_SCRIPT, "1", COUNTS_KEY, SKETCH_KEY_PREFIX, TAKEN_SKETCH_KEY_PREFIX]),
	)
	if (!Array.isArray(flatEntries)) {
		return null
	}

	// read the flat field and count pairs back as entries, skipping a field this module never wrote
	const dailyCountEntries: DailyCountEntry[] = []
	for (let i = 0; i < flatEntries.length; i += 2) {
		// the field at an even index and its count after it
		const dailyCountField = String(flatEntries[i])
		const dailyCountRow = toDailyCountRow(dailyCountField)
		if (dailyCountRow) {
			dailyCountEntries.push({ dailyCountRow, count: Number(flatEntries[i + 1]), dailyCountField })
		}
	}
	return dailyCountEntries
}

/**
 * Merges each row's taken sketches into the sketch Postgres saved for the row, all in one Redis call, and returns the
 * merged bytes in the same order, the saved bytes for a row with no taken sketch, or null if Redis fails.
 */
export async function mergeTakenDailyCountSketches(
	sketchMerges: DailyCountSketchMerge[],
): Promise<(Uint8Array | null)[] | null> {
	const mergeKeyPrefix = `${MERGE_KEY_PREFIX}${crypto.randomUUID()}:`
	return runWithRedis("daily count sketch merge", (client) =>
		Promise.all(
			sketchMerges.map(async ({ savedSketch, dailyCountFields }, i) => {
				// write the saved bytes to a merge key, and merge the taken sketches into the merge key
				const mergeKey = `${mergeKeyPrefix}${i}`
				if (savedSketch) {
					await client.set(mergeKey, savedSketch, "EX", String(TEMPORARY_KEY_SECONDS))
				}
				await client.send("PFMERGE", [
					mergeKey,
					mergeKey,
					...dailyCountFields.map((dailyCountField) => `${TAKEN_SKETCH_KEY_PREFIX}${dailyCountField}`),
				])

				// read the merged bytes, then drop the merge key
				const mergedBytes = await client.getBuffer(mergeKey)
				await client.del(mergeKey)
				return mergedBytes ?? savedSketch
			}),
		),
	)
}

/**
 * Drops the taken sketches of rows the sweep saved.
 */
export async function deleteTakenDailyCountSketches(dailyCountEntries: DailyCountEntry[]): Promise<void> {
	if (dailyCountEntries.length === 0) {
		return
	}
	await runWithRedis("daily count taken delete", (client) =>
		client.del(...dailyCountEntries.map(({ dailyCountField }) => `${TAKEN_SKETCH_KEY_PREFIX}${dailyCountField}`)),
	)
}

/**
 * Puts taken rows back for the next sweep in one Redis call, for a batch the sweep could not save.
 */
export async function returnDailyCountEntries(dailyCountEntries: DailyCountEntry[]): Promise<void> {
	await runWithRedis("daily count return", (client) =>
		Promise.all(
			dailyCountEntries.map(({ dailyCountField, count }) => {
				// the hash, the live sketch, and the taken sketch, then the field and its count
				const scriptKeys = [
					COUNTS_KEY,
					`${SKETCH_KEY_PREFIX}${dailyCountField}`,
					`${TAKEN_SKETCH_KEY_PREFIX}${dailyCountField}`,
				]
				return client.send("EVAL", [RETURN_SCRIPT, "3", ...scriptKeys, dailyCountField, String(count)])
			}),
		),
	)
}

/**
 * Returns how many distinct people each group of sketches holds together, 0 for an empty group, or null if Redis
 * fails. A group lists indexes into the sketches, so a sketch counted in many groups is written once. Each Redis call
 * writes or counts one chunk.
 */
export async function countSketchGroups(
	sketches: Uint8Array[],
	sketchIndexGroups: number[][],
): Promise<number[] | null> {
	if (sketches.length === 0) {
		return sketchIndexGroups.map(() => 0)
	}

	// write each sketch to its own counting key, a chunk at a time
	const countKeyPrefix = `${COUNT_KEY_PREFIX}${crypto.randomUUID()}:`
	const keyedSketches = sketches.map((sketch, i) => ({ countKey: `${countKeyPrefix}${i}`, sketch }))
	const countKeys = keyedSketches.map(({ countKey }) => countKey)
	for (const sketchChunk of toChunks(keyedSketches, SKETCH_CHUNK_SIZE)) {
		const setReplies = await runWithRedis("daily count sketch write", (client) =>
			Promise.all(
				sketchChunk.map(({ countKey, sketch }) => client.set(countKey, sketch, "EX", String(TEMPORARY_KEY_SECONDS))),
			),
		)
		if (!setReplies) {
			return null
		}
	}

	// count each group's union, a chunk of groups at a time.
	// ponytail: one group's union is still one PFCOUNT over all its sketches, which takes Redis about 4 ms per thousand
	// sketches. merge a group in tiers if one outgrows that
	const peopleCounts: number[] = []
	for (const groupChunk of toChunks(sketchIndexGroups, SKETCH_CHUNK_SIZE)) {
		const chunkCounts = await runWithRedis("daily count sketch count", (client) =>
			Promise.all(
				groupChunk.map((group) =>
					group.length === 0
						? 0
						: client.send(
								"PFCOUNT",
								group.map((i) => countKeys[i] ?? ""),
							),
				),
			),
		)
		if (!chunkCounts) {
			return null
		}
		peopleCounts.push(...chunkCounts.map(Number))
	}

	// drop the counting keys a chunk at a time
	for (const countKeyChunk of toChunks(countKeys, SKETCH_CHUNK_SIZE)) {
		await runWithRedis("daily count sketch delete", (client) => client.del(...countKeyChunk))
	}
	return peopleCounts
}

/**
 * Returns the key that names a place in a daily count row: a hash of its five values, or unknown for no place.
 */
export function toPlaceKey(place: Place | null): string {
	if (!place) {
		return UNKNOWN_PLACE_KEY
	}
	const placeValues = JSON.stringify([place.country, place.region, place.city, place.latitude, place.longitude])
	return createHash("sha256").update(placeValues).digest("hex").slice(0, 32)
}

/**
 * Returns a place's five daily count columns, all null for no place.
 */
export function toPlaceColumns(place: Place | null): PlaceColumns {
	return place ?? { country: null, region: null, city: null, latitude: null, longitude: null }
}

/**
 * Returns the place a daily count row's five columns name, or null for a row with no known country.
 */
export function toDailyCountPlace({ country, region, city, latitude, longitude }: PlaceColumns): Place | null {
	return country ? { country, region, city, latitude, longitude } : null
}

// run the count script for one person's view or play of a row, under the person's keyed hash
async function bufferDailyCountRow({
	dailyCountRow,
	countScript,
	toClaimKey,
	claimSeconds,
	element,
}: BufferDailyCountRowOptions): Promise<void> {
	const personHash = toPersonHash(element)
	if (!personHash) {
		return
	}

	// the claim, the hash, and the row's sketch, then the claim's lifetime, the field, the person, and the sketch's
	// lifetime
	const dailyCountField = JSON.stringify(dailyCountRow)
	const scriptKeys = [toClaimKey(personHash), COUNTS_KEY, `${SKETCH_KEY_PREFIX}${dailyCountField}`]
	const scriptArguments = [String(claimSeconds), dailyCountField, personHash, String(SKETCH_SECONDS)]
	await runWithRedis("daily count buffer", (client) =>
		client.send("EVAL", [countScript, "3", ...scriptKeys, ...scriptArguments]),
	)
}

// a person's element as a keyed hash, or null if the auth secret is unset
function toPersonHash(element: string): string | null {
	try {
		const value = `daily-count-person\n${element}`
		return toAuthSecretSignature({ value, purpose: "daily counts", encoding: "base64url" }).slice(0, PERSON_HASH_LENGTH)
	} catch {
		return null
	}
}

// a hash field read back as its row, or null for one this module never wrote
function toDailyCountRow(dailyCountField: string): DailyCountRow | null {
	try {
		const dailyCountRow = JSON.parse(dailyCountField) as DailyCountRow
		return dailyCountRow.dailyCountKind === "view" || dailyCountRow.dailyCountKind === "play" ? dailyCountRow : null
	} catch {
		return null
	}
}
