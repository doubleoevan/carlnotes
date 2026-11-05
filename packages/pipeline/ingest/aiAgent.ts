// ai agent Sources read their accepted public-link queue
import { ingestPersonalSourcesLinks } from "../personalSources/linkQueue"
import type { SourceIngester } from "./ingester"

/**
 * Supplies an AI Agent Source's live links as ordinary Resource candidates.
 */
export const aiAgentIngester: SourceIngester = (source, context) => ingestPersonalSourcesLinks(source, context)
