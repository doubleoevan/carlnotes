// the chapter a question asked from the podcast player was asked during: its lines as they played, and, while the topic
// still has its finding, what the hosts read to write it
import type { PodcastEpisodeChapterRef, PodcastEpisodeTurn } from "@shared/payloads"
import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import { podcastEpisodeChapters, podcastEpisodes } from "../../db/schema/podcast"
import { type FindingMaterial, toFindingMaterial } from "../podcast/generatePodcastEpisodeScript"
import { toChapterTurns } from "../podcast/podcastEpisodeScript"
import { loadPodcastEpisodeFindings } from "../podcast/writePodcastEpisodeScript"

// one chapter of a published podcast episode: the podcast episode's id and title, the chapter's title and position, the
// lines that play during it, and its finding, null once a scan filtered the finding out
export type PodcastEpisodeChapterContext = {
	podcastEpisodeId: string
	podcastEpisodeTitle: string
	chapterTitle: string
	chapterPosition: number
	turns: PodcastEpisodeTurn[]
	finding: FindingMaterial | null
}

// the topic a podcast question was asked on, and the podcast episode and chapter it names
type LoadPodcastEpisodeChapterContextOptions = PodcastEpisodeChapterRef & { topicId: string }

/**
 * Loads the chapter a podcast question names, or null unless the podcast episode is a published podcast episode of the
 * topic and the podcast episode has a chapter at that position.
 */
export async function loadPodcastEpisodeChapterContext({
	topicId,
	podcastEpisodeId,
	chapterPosition,
}: LoadPodcastEpisodeChapterContextOptions): Promise<PodcastEpisodeChapterContext | null> {
	// the published podcast episode on this topic, with its chapter at the position
	const [chapterRow] = await db
		.select({
			podcastEpisodeTitle: podcastEpisodes.title,
			script: podcastEpisodes.script,
			chapterTitle: podcastEpisodeChapters.title,
			findingId: podcastEpisodeChapters.findingId,
		})
		.from(podcastEpisodes)
		.innerJoin(podcastEpisodeChapters, eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodes.id))
		.where(
			and(
				eq(podcastEpisodes.id, podcastEpisodeId),
				eq(podcastEpisodes.topicId, topicId),
				eq(podcastEpisodes.status, "published"),
				eq(podcastEpisodeChapters.position, chapterPosition),
			),
		)
	if (!chapterRow) {
		return null
	}

	// the lines that play during the chapter, the cold open and a segment's transition included
	const turns = chapterRow.script ? (toChapterTurns(chapterRow.script)[chapterPosition] ?? []) : []
	return {
		podcastEpisodeId,
		podcastEpisodeTitle: chapterRow.podcastEpisodeTitle ?? "",
		chapterTitle: chapterRow.chapterTitle,
		chapterPosition,
		turns,
		finding: chapterRow.findingId ? await loadPodcastEpisodeChapterFinding(chapterRow.findingId) : null,
	}
}

// the chapter's finding as the hosts read it when they wrote the chapter, or null once a scan filtered it out
async function loadPodcastEpisodeChapterFinding(findingId: string): Promise<FindingMaterial | null> {
	const [podcastEpisodeFinding] = await loadPodcastEpisodeFindings([findingId])
	return podcastEpisodeFinding ? toFindingMaterial(podcastEpisodeFinding) : null
}
