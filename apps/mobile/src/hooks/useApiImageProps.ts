// the expo-image props of an api image path, with the stored session cookie on an unchecked image's request alone

import { isUncheckedImagePath } from "@carlnotes/contracts/uncheckedImages"
import { useEffect, useState } from "react"
import { type ApiImageProps, toApiImageProps } from "@/apiImages"
import { mobileAuthClient } from "@/authClient"

/**
 * Returns the expo-image props that load an api image path, or null for no path and for an unchecked image until the
 * stored session cookie is read. The cookie is read only for an unchecked image's path.
 */
export function useApiImageProps(imagePath: string | null): ApiImageProps | null {
	// whether the path is an unchecked image's, and the stored cookie once it is read for one
	const isUnchecked = imagePath !== null && isUncheckedImagePath(imagePath)
	const [sessionCookie, setSessionCookie] = useState<string | null>(null)

	// read the stored cookie for an unchecked image alone
	useEffect(() => {
		if (!isUnchecked) {
			setSessionCookie(null)
			return
		}

		// a read that fails leaves no cookie, and a read that settles after the image changed is dropped
		let isCancelled = false
		const readSessionCookie = async (): Promise<void> => {
			const storedCookie = await mobileAuthClient.getCookie().catch(() => "")
			if (!isCancelled) {
				setSessionCookie(storedCookie || null)
			}
		}
		void readSessionCookie()

		// the image changed or the element left the screen
		return () => {
			isCancelled = true
		}
	}, [isUnchecked])
	return imagePath === null ? null : toApiImageProps(imagePath, sessionCookie)
}
