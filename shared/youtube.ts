// a YouTube video's urls, its player frame's attributes, and its play button's triangle, and the video on making a
// topic that the homepage, the menus, and the docs play

/**
 * Returns a YouTube video's canonical watch page url.
 */
export function toYoutubeWatchUrl(youtubeVideoId: string): string {
	return `https://www.youtube.com/watch?v=${youtubeVideoId}`
}

/**
 * Returns a YouTube video's player url on the domain that sets no cookies until the video plays.
 */
export function toYoutubeEmbedUrl(youtubeVideoId: string): string {
	return `https://www.youtube-nocookie.com/embed/${youtubeVideoId}`
}

/**
 * Returns a YouTube video's player url that starts the video as it loads.
 */
export function toYoutubeAutoplayUrl(youtubeVideoId: string): string {
	return `${toYoutubeEmbedUrl(youtubeVideoId)}?autoplay=1`
}

// what a YouTube player's frame allows and the referrer it sends. YouTube will not play an embed that sends no referrer
export const YOUTUBE_FRAME_ATTRIBUTES = {
	allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
	referrerPolicy: "strict-origin-when-cross-origin",
} as const

// a YouTube video that a page plays, with its thumbnail's path on this origin and its upload date as yyyy-mm-dd
export type PageYoutubeVideo = {
	youtubeVideoId: string
	name: string
	description: string
	uploadDate: string
	thumbnailPath: string
}

// the video on making a topic
export const TOPIC_TUTORIAL_VIDEO: PageYoutubeVideo = {
	youtubeVideoId: "XXLKmuHi-GA",
	name: "Brew with Carl",
	description: "Evan shows how to make a topic with Carl on CarlNotes.",
	uploadDate: "2026-10-13",
	thumbnailPath: "/topic-tutorial-video-thumbnail.png",
}

// the marker a docs page writes where the video on making a topic goes
export const TOPIC_TUTORIAL_VIDEO_MARKER = "<div data-topic-tutorial-video></div>"

// the play triangle that YouTube's logo cuts out of its red button, in the logo's 24 by 24 box
export const YOUTUBE_PLAY_TRIANGLE_PATH = "M9.545 15.568V8.432L15.818 12l-6.273 3.568z"
