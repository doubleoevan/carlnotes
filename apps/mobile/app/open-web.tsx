// the route a listed web link with no native route opens on: the url opens in the browser sheet and the app returns
// Home. only the site's own urls open

import { isSiteUrl } from "@carlnotes/contracts/site"
import { router, useLocalSearchParams } from "expo-router"
import * as WebBrowser from "expo-web-browser"
import { useEffect } from "react"

/** Opens a site url in the browser sheet and returns Home. */
export default function OpenWebScreen() {
	// read the url, then open it
	const { url } = useLocalSearchParams<{ url?: string }>()
	useEffect(() => {
		// open the site's own url, then leave the route either way
		if (typeof url === "string" && isSiteUrl(url)) {
			void WebBrowser.openBrowserAsync(url).catch(() => undefined)
		}
		router.replace("/")
	}, [url])
	return null
}
