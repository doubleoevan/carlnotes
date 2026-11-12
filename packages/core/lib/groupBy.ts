// values grouped by a key in a loop. Hermes on a phone has no Map.groupBy

/**
 * Returns the values grouped by a key in first-seen order, each group holding at least its first value.
 */
export function groupBy<Value, Key>(values: Value[], toKey: (value: Value) => Key): Map<Key, [Value, ...Value[]]> {
	// the groups by key, filled in the values' order
	const groups = new Map<Key, [Value, ...Value[]]>()
	for (const value of values) {
		// add the value to its key's group, or start the group with it
		const key = toKey(value)
		const group = groups.get(key)
		if (group) {
			group.push(value)
		} else {
			groups.set(key, [value])
		}
	}

	return groups
}
