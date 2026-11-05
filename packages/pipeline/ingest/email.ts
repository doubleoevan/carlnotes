// email Sources share the accepted public-link queue
import { ingestPersonalSourcesLinks } from "../personalSources/linkQueue"
import type { SourceIngester } from "./ingester"

/**
 * Supplies an Email Source's live links as ordinary Resource candidates.
 */
export const emailIngester: SourceIngester = (source, context) => ingestPersonalSourcesLinks(source, context)
