// the microphone permission's outcomes, the first tap's ask, and the denial's settings action
import { expect, mock, test } from "bun:test"
import { OPEN_SETTINGS_LABEL } from "@carlnotes/core/lib/pushCopy"
import {
	MicrophoneRejectedError,
	requestMicrophonePermission,
	toMicrophonePermission,
	toMicrophoneRejectedAction,
} from "./voicePermission"

test("toMicrophonePermission reads granted, denied, and denied for good", () => {
	expect(toMicrophonePermission({ granted: true, canAskAgain: true })).toBe("granted")
	expect(toMicrophonePermission({ granted: false, canAskAgain: true })).toBe("denied")
	expect(toMicrophonePermission({ granted: false, canAskAgain: false })).toBe("deniedForGood")
})

test("requestMicrophonePermission asks only if the phone still lets the app ask", async () => {
	// a granted permission and a denial for good never show the prompt
	const requestPermission = mock(async () => ({ granted: true, canAskAgain: true }))
	const grantedPermissionReads = {
		getPermission: async () => ({ granted: true, canAskAgain: true }),
		requestPermission,
	}
	expect(await requestMicrophonePermission(grantedPermissionReads)).toBe("granted")
	const deniedForGoodPermissionReads = {
		getPermission: async () => ({ granted: false, canAskAgain: false }),
		requestPermission,
	}
	expect(await requestMicrophonePermission(deniedForGoodPermissionReads)).toBe("deniedForGood")
	expect(requestPermission).not.toHaveBeenCalled()

	// a first tap shows the prompt, and its answer is the outcome
	const undeterminedPermissionReads = {
		getPermission: async () => ({ granted: false, canAskAgain: true }),
		requestPermission,
	}
	expect(await requestMicrophonePermission(undeterminedPermissionReads)).toBe("granted")
	expect(requestPermission).toHaveBeenCalledTimes(1)
	const deniedAtPromptPermissionReads = {
		getPermission: async () => ({ granted: false, canAskAgain: true }),
		requestPermission: async () => ({ granted: false, canAskAgain: false }),
	}
	expect(await requestMicrophonePermission(deniedAtPromptPermissionReads)).toBe("deniedForGood")
})

test("only a denial for good offers the phone's settings", () => {
	// the settings action opens the settings
	const openSettings = mock(() => {})
	const action = toMicrophoneRejectedAction(new MicrophoneRejectedError("deniedForGood"), openSettings)
	expect(action?.label).toBe(OPEN_SETTINGS_LABEL)
	action?.onPress()
	expect(openSettings).toHaveBeenCalledTimes(1)

	// a denial that the prompt can ask past, and any other failure, offer nothing
	expect(toMicrophoneRejectedAction(new MicrophoneRejectedError("denied"), openSettings)).toBeUndefined()
	expect(toMicrophoneRejectedAction(new Error("recorder failed"), openSettings)).toBeUndefined()
})
