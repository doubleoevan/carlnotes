// the viewer count commands for the two Redis test fakes, over their shared map. a counter and a set are each stored as
// a JSON array of their members, so a fake count is exact

/**
 * Runs a viewer count command on the fake's map and returns its reply, or undefined for a command it does not handle.
 */
export function runFakeViewerCountCommand(
	storedValueByKey: Map<string, string>,
	command: string,
	commandArguments: string[],
): unknown {
	// the add script adds the element to the counter, and lists the counter's ref as changed if the counter grew
	const [script = "", , firstKey = "", secondKey = "", element = "", member = ""] = commandArguments
	if (command === "EVAL" && script.includes("PFADD")) {
		if (addFakeMembers(storedValueByKey, firstKey, [element])) {
			addFakeMembers(storedValueByKey, secondKey, [member])
		}
		return 1
	}

	// the take script returns every changed ref and empties the set
	if (command === "EVAL" && script.includes("SMEMBERS")) {
		const members = readFakeMembers(storedValueByKey, firstKey)
		storedValueByKey.delete(firstKey)
		return members
	}

	// a count reads how many distinct members the keys hold together
	const [key = "", ...otherKeys] = commandArguments
	if (command === "PFCOUNT") {
		return new Set(commandArguments.flatMap((countedKey) => readFakeMembers(storedValueByKey, countedKey))).size
	}

	// a counter add and a set add each return 1 if the key grew
	if (command === "PFADD") {
		return addFakeMembers(storedValueByKey, key, otherKeys) ? 1 : 0
	}
	if (command === "SADD") {
		return addFakeMembers(storedValueByKey, key, otherKeys) ? 1 : 0
	}

	// a merge adds every source counter's members to the first key
	if (command === "PFMERGE") {
		addFakeMembers(
			storedValueByKey,
			key,
			otherKeys.flatMap((sourceKey) => readFakeMembers(storedValueByKey, sourceKey)),
		)
		return "OK"
	}

	// an existence check counts the key, and any other command returns undefined
	return command === "EXISTS" ? Number(storedValueByKey.has(key)) : undefined
}

/**
 * Reads a stored counter as bytes, as Bun's getBuffer returns it.
 */
export function readFakeBuffer(storedValueByKey: Map<string, string>, key: string): Uint8Array | null {
	const storedValue = storedValueByKey.get(key)
	return storedValue === undefined ? null : new TextEncoder().encode(storedValue)
}

/**
 * Turns a value written as bytes back into the string the fake's map holds.
 */
export function toFakeStoredValue(value: string | Uint8Array): string {
	return typeof value === "string" ? value : new TextDecoder().decode(value)
}

/**
 * Returns a fake counter's, set's, or sketch's members, empty for a missing key.
 */
export function readFakeMembers(storedValueByKey: Map<string, string>, key: string): string[] {
	const storedValue = storedValueByKey.get(key)
	return storedValue ? (JSON.parse(storedValue) as string[]) : []
}

/**
 * Adds members to a fake counter, set, or sketch, and returns whether any was new.
 */
export function addFakeMembers(storedValueByKey: Map<string, string>, key: string, newMembers: string[]): boolean {
	const members = new Set(readFakeMembers(storedValueByKey, key))
	const sizeBefore = members.size
	for (const newMember of newMembers) {
		members.add(newMember)
	}

	// write the members back and return whether the set grew
	storedValueByKey.set(key, JSON.stringify([...members]))
	return members.size > sizeBefore
}
