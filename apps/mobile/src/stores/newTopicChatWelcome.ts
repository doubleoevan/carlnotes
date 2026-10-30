// whether the new-topic chat already opened by itself for an empty Feed this launch. a user who closes it is left alone

let hasOpenedNewTopicChatWelcome = false

/**
 * Returns true the first time an empty Feed asks to open the new-topic chat this launch, and false after.
 */
export function takeNewTopicChatWelcome(): boolean {
	if (hasOpenedNewTopicChatWelcome) {
		return false
	}
	hasOpenedNewTopicChatWelcome = true
	return true
}
