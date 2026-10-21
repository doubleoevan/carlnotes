// the Sätteri plugin that fills a docs page's video marker with the video on making a topic, built from the constant
// the app reads too

import {
	TOPIC_TUTORIAL_VIDEO,
	TOPIC_TUTORIAL_VIDEO_MARKER,
	toYoutubeAutoplayUrl,
	toYoutubeEmbedUrl,
	YOUTUBE_FRAME_ATTRIBUTES,
	YOUTUBE_PLAY_TRIANGLE_PATH,
} from "@carlnotes/contracts/youtube"
import type { Element } from "hast"
import type { HastPluginDefinition } from "satteri"
import { siYoutube } from "simple-icons"

// the docs site's base path, which every file it serves sits after
type TopicTutorialVideoPluginOptions = { base: string }

/**
 * Returns the plugin that replaces each video marker with the video's frame.
 */
export function topicTutorialVideoPlugin({ base }: TopicTutorialVideoPluginOptions): HastPluginDefinition {
	return {
		name: "topic-tutorial-video",
		// a marker becomes the frame. a page's html reaches a plugin as raw text
		raw: (node) => (node.value.trim() === TOPIC_TUTORIAL_VIDEO_MARKER ? toVideoFrame(base) : undefined),
	}
}

// the frame at the page's full width, whose own document shows the thumbnail and YouTube's play button as a link to the
// player. pressing it turns the frame into the player, and nothing loads from YouTube before then
function toVideoFrame(base: string): Element {
	// the thumbnail, its play button, and the link to the player that autoplays
	const { youtubeVideoId, name, thumbnailPath } = TOPIC_TUTORIAL_VIDEO
	const thumbnailDocument = [
		"<style>html,body{margin:0;height:100%}a{display:block;position:relative;height:100%}",
		"img{width:100%;height:100%;object-fit:cover}svg{position:absolute;inset:0;margin:auto;width:68px;height:68px}</style>",
		`<a href="${toYoutubeAutoplayUrl(youtubeVideoId)}" aria-label="Play ${name}">`,
		`<img src="${base}${thumbnailPath}" alt="">`,
		`<svg viewBox="0 0 24 24"><path fill="#${siYoutube.hex}" d="${siYoutube.path}"/>`,
		`<path fill="#fff" d="${YOUTUBE_PLAY_TRIANGLE_PATH}"/></svg></a>`,
	].join("")

	// the frame. its src names the video for a crawler, and its srcdoc shows the thumbnail
	return {
		type: "element",
		tagName: "iframe",
		properties: {
			src: toYoutubeEmbedUrl(youtubeVideoId),
			srcDoc: thumbnailDocument,
			title: name,
			loading: "lazy",
			...YOUTUBE_FRAME_ATTRIBUTES,
			allowFullScreen: true,
			style: "width: 100%; aspect-ratio: 16 / 9; border: 0",
		},
		children: [],
	}
}
