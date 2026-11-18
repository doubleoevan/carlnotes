import { join } from "node:path"
import { muxFilm, remuxFilm, writeConcatList } from "./videoEncode"

// the parts in film order, any of them missing, and the folder that the join's list goes in
type VideoPartsInOrder = {
	workDirectory: string
	introPath: string | null
	chaptersPath: string | null
	signOffPath: string | null
}

// the parts, the podcast episode's MP3, the captions, the film to write, and the signal that stops the mux
type WriteVideoFilmOptions = VideoPartsInOrder & {
	audioPath: string
	captionsPath: string
	filmPath: string
	signal?: AbortSignal
}

/**
 * Writes the film: the parts joined by stream copy, with the audio and the captions.
 */
export async function writeVideoFilm({
	audioPath,
	captionsPath,
	filmPath,
	signal,
	...videoParts
}: WriteVideoFilmOptions): Promise<void> {
	const listPath = await writePartsList(videoParts)
	await muxFilm({ listPath, audioPath, captionsPath, filmPath }, signal)
}

// the parts, the film that plays now, the rebuilt film to write, and the signal that stops the remux
type RewriteVideoFilmOptions = VideoPartsInOrder & { currentFilmPath: string; filmPath: string; signal?: AbortSignal }

/**
 * Writes a rebuilt film: the parts joined by stream copy, with the audio and the captions of the film that plays now.
 */
export async function rewriteVideoFilm({
	currentFilmPath,
	filmPath,
	signal,
	...videoParts
}: RewriteVideoFilmOptions): Promise<void> {
	const listPath = await writePartsList(videoParts)
	await remuxFilm({ listPath, currentFilmPath, filmPath }, signal)
}

// write the concat list of the parts that exist, in film order
async function writePartsList({
	workDirectory,
	introPath,
	chaptersPath,
	signOffPath,
}: VideoPartsInOrder): Promise<string> {
	const partPaths = [introPath, chaptersPath, signOffPath].filter((partPath): partPath is string => partPath !== null)
	const listPath = join(workDirectory, "parts.txt")
	await writeConcatList(partPaths, listPath)
	return listPath
}
