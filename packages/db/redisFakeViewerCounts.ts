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
		if (addMembers(storedValueByKey, firstKey, [element])) {
			addMembers(storedValueByKey, secondKey, [member])
		}
		return 1
	}

	// the take script returns every changed ref and empties the set
	if (command === "EVAL" && script.includes("SMEMBERS")) {
		const members = readMembers(storedValueByKey, firstKey)
		storedValueByKey.delete(firstKey)
		return members
	}

	// a count reads how many members the key holds
	const [key = "", ...otherKeys] = commandArguments
	if (command === "PFCOUNT") {
		return readMembers(storedValueByKey, key).length
	}

	// a counter add and a set add each return 1 if the key grew
	if (command === "PFADD") {
		return addMembers(storedValueByKey, key, otherKeys) ? 1 : 0
	}
	if (command === "SADD") {
		return addMembers(storedValueByKey, key, otherKeys) ? 1 : 0
	}

	// a merge adds every source counter's members to the first key
	if (command === "PFMERGE") {
		addMembers(
			storedValueByKey,
			key,
			otherKeys.flatMap((sourceKey) => readMembers(storedValueByKey, sourceKey)),
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

// a counter's or a set's members, empty for a missing key
function readMembers(storedValueByKey: Map<string, string>, key: string): string[] {
	const storedValue = storedValueByKey.get(key)
	return storedValue ? (JSON.parse(storedValue) as string[]) : []
}

// add members to a counter or a set, and return whether any was new
function addMembers(storedValueByKey: Map<string, string>, key: string, newMembers: string[]): boolean {
	const members = new Set(readMembers(storedValueByKey, key))
	const sizeBefore = members.size
	for (const newMember of newMembers) {
		members.add(newMember)
	}

	// write the members back and return whether the set grew
	storedValueByKey.set(key, JSON.stringify([...members]))
	return members.size > sizeBefore
}
