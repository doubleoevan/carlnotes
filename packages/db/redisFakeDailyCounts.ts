// the daily count buffer's scripts for the Redis test fake, over its shared map. the hash is stored as a JSON object,
// and a sketch or a set of claims as a JSON array of its members like the fake's counters, so a fake count is exact
import { addFakeMembers, readFakeMembers } from "./redisFakeViewerCounts"

/**
 * Runs a daily count buffer script on the fake's map and returns its reply, or undefined for a command it does not
 * handle.
 */
export function runFakeDailyCountCommand(
	storedValueByKey: Map<string, string>,
	command: string,
	commandArguments: string[],
): unknown {
	const [script = "", , ...scriptValues] = commandArguments
	// the daily count scripts are the ones that read or write a hash
	if (command !== "EVAL" || !(script.includes("HINCRBY") || script.includes("HGETALL"))) {
		return undefined
	}

	// a count script claims the person and counts the row
	if ((script.includes("'NX'") || script.includes("SADD")) && script.includes("HINCRBY")) {
		return runFakeCountScript(storedValueByKey, script.includes("SADD"), scriptValues)
	}

	// the take script returns the hash's pairs, empties it, and moves each row's sketch to its taken key
	if (script.includes("HGETALL")) {
		const [countsKey = "", sketchKeyPrefix = "", takenSketchKeyPrefix = ""] = scriptValues
		const countByDailyCountField = readCounts(storedValueByKey, countsKey)
		storedValueByKey.delete(countsKey)

		// move each sketch, then return the pairs flat
		for (const dailyCountField of Object.keys(countByDailyCountField)) {
			moveKey(storedValueByKey, `${sketchKeyPrefix}${dailyCountField}`, `${takenSketchKeyPrefix}${dailyCountField}`)
		}
		return Object.entries(countByDailyCountField).flatMap(([dailyCountField, count]) => [
			dailyCountField,
			String(count),
		])
	}

	// the return script adds a count back and merges the taken sketch back into the live one
	if (script.includes("HINCRBY")) {
		const [countsKey = "", sketchKey = "", takenSketchKey = "", dailyCountField = "", count = "0"] = scriptValues
		// add the count back, merge the sketch back, and drop the taken sketch
		addCount(storedValueByKey, countsKey, dailyCountField, Number(count))
		addFakeMembers(storedValueByKey, sketchKey, readFakeMembers(storedValueByKey, takenSketchKey))
		storedValueByKey.delete(takenSketchKey)
		return 1
	}
	return undefined
}

// claim the person, in the day's set of viewers for a view or under its own key for a play, and if the claim is new,
// count the row and add the person to its sketch
function runFakeCountScript(
	storedValueByKey: Map<string, string>,
	isViewClaim: boolean,
	scriptValues: string[],
): number {
	const [claimKey = "", countsKey = "", sketchKey = "", , dailyCountField = "", personHash = ""] = scriptValues
	const isNewClaim = isViewClaim
		? addFakeMembers(storedValueByKey, claimKey, [personHash])
		: !storedValueByKey.has(claimKey)
	if (!isNewClaim) {
		return 0
	}

	// a play's new claim takes its own key, and a new claim counts the row and adds the person
	if (!isViewClaim) {
		storedValueByKey.set(claimKey, "1")
	}
	addCount(storedValueByKey, countsKey, dailyCountField, 1)
	addFakeMembers(storedValueByKey, sketchKey, [personHash])
	return 1
}

// the hash's count per field, empty for a missing key
function readCounts(storedValueByKey: Map<string, string>, key: string): Record<string, number> {
	const storedValue = storedValueByKey.get(key)
	return storedValue ? (JSON.parse(storedValue) as Record<string, number>) : {}
}

// add to one field's count in the hash
function addCount(storedValueByKey: Map<string, string>, key: string, dailyCountField: string, count: number): void {
	const countByDailyCountField = readCounts(storedValueByKey, key)
	countByDailyCountField[dailyCountField] = (countByDailyCountField[dailyCountField] ?? 0) + count
	storedValueByKey.set(key, JSON.stringify(countByDailyCountField))
}

// move a key's value to another key, if the key exists
function moveKey(storedValueByKey: Map<string, string>, fromKey: string, toKey: string): void {
	const storedValue = storedValueByKey.get(fromKey)
	if (storedValue !== undefined) {
		storedValueByKey.set(toKey, storedValue)
		storedValueByKey.delete(fromKey)
	}
}
