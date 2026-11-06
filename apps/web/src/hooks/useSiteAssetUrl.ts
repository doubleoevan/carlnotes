import { useContext } from "react"
import { LinkBaseUrlContext } from "@/components/common/AnchorLink"

/**
 * Returns an image's url as this document can load it: as it is on the site, and absolute against the connected site in
 * an embedded host, whose frame has no origin of its own to resolve a path against.
 */
export function useSiteAssetUrl<Url extends string | null>(url: Url): Url | string {
	const linkBaseUrl = useContext(LinkBaseUrlContext)
	return linkBaseUrl && url ? new URL(url, linkBaseUrl).toString() : url
}
