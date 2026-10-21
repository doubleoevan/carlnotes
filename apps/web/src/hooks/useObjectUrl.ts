// a browser url for a picked file, revoked as soon as the file changes or the component goes away
import { useEffect, useMemo } from "react"

/**
 * The object url for a file the user just picked, or null while there is none. The url is revoked when the
 * file changes and when the caller unmounts. A long-lived form does not leak one per pick.
 */
export function useObjectUrl(file: File | null): string | null {
	const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
	useEffect(
		() => () => {
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl)
			}
		},
		[objectUrl],
	)
	return objectUrl
}
