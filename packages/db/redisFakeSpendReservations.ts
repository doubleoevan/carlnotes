// the spend reservation commands for the two Redis test fakes, over their shared map. a sorted set is stored as a JSON
// array of its members and their scores

// one sorted set member and its score
type ScoredMember = [member: string, score: number]

/**
 * Runs a spend reservation command on the fake's map and returns its reply, or undefined for a command it does not
 * handle.
 */
export function runFakeSpendReservationCommand(
	storedValueByKey: Map<string, string>,
	command: string,
	commandArguments: string[],
): unknown {
	// the reserve script removes the expired members, then adds the new one if the open ones are below the remaining
	// budget
	const [script = "", , scriptKey = "", now = "0", remainingDollars = "0", expiresAt = "0", newMember = ""] =
		commandArguments
	if (command === "EVAL" && script.includes("ZREMRANGEBYSCORE")) {
		const openMembers = readScoredMembers(storedValueByKey, scriptKey).filter(([, score]) => score > Number(now))
		const openDollars = openMembers.reduce((sum, [member]) => sum + Number(member.split(":").at(-1)), 0)
		const isBudgetLeft = openDollars < Number(remainingDollars)

		// keep the open members, with the new one if budget was left
		storedValueByKey.set(
			scriptKey,
			JSON.stringify(isBudgetLeft ? [...openMembers, [newMember, Number(expiresAt)]] : openMembers),
		)
		return isBudgetLeft ? 1 : 0
	}

	// a removal drops the member and returns how many it dropped
	const [key = "", member = ""] = commandArguments
	if (command === "ZREM") {
		const scoredMembers = readScoredMembers(storedValueByKey, key)
		const keptMembers = scoredMembers.filter(([scoredMember]) => scoredMember !== member)
		storedValueByKey.set(key, JSON.stringify(keptMembers))
		return scoredMembers.length - keptMembers.length
	}

	// any other command is not a spend reservation command
	return undefined
}

// a sorted set's members with their scores, empty for a missing key
function readScoredMembers(storedValueByKey: Map<string, string>, key: string): ScoredMember[] {
	const storedValue = storedValueByKey.get(key)
	return storedValue ? (JSON.parse(storedValue) as ScoredMember[]) : []
}
