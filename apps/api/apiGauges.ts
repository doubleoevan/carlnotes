// what the api and the web service add to their minute line: Redis, the page renders the replica started and shed,
// and how many podcast cover draws wait in the process
import { readRedisExtraGauges } from "@carlnotes/db/redisGauges"
import { readPodcastCoverChainLength } from "@carlnotes/pipeline/podcastCover"
import type { ThresholdCrossing } from "@carlnotes/server/monitoring"
import type { ExtraGaugesReading } from "@carlnotes/server/runtimeGauges"
import { type RenderGauges, readAndResetRenderGauges } from "./uiServer"

/**
 * Returns the Redis gauges, the minute's render counts, and the cover draws waiting or under way, with every
 * threshold they cross, and starts the minute's counts over.
 */
export async function readApiExtraGauges(): Promise<ExtraGaugesReading> {
	const { gauges, thresholdCrossings } = await readRedisExtraGauges()
	const renderGauges = readAndResetRenderGauges()
	return {
		gauges: { ...gauges, renders: renderGauges, coverChainLength: readPodcastCoverChainLength() },
		thresholdCrossings: [...thresholdCrossings, ...toRenderShedCrossings(renderGauges)],
	}
}

/**
 * Returns the render-shed crossing for a minute in which the replica turned a visitor's render away, and none for a
 * minute with no shed render.
 */
export function toRenderShedCrossings(renderGauges: RenderGauges): ThresholdCrossing[] {
	if (renderGauges.shedCount === 0) {
		return []
	}
	return [
		{
			condition: "render-shed",
			message: "a replica shed visitor page renders past its render limit",
			values: { ...renderGauges },
		},
	]
}
