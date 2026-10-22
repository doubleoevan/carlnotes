// the playback speed button, whose accessible name includes the speed it shows
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { PlaybackSpeedButton } from "./PlaybackControlButtons"

test("the playback speed button's accessible name includes the speed it shows", () => {
	const playbackSpeedMarkup = renderToStaticMarkup(<PlaybackSpeedButton playbackRate={1.5} />)
	expect(playbackSpeedMarkup).toContain('aria-label="Playback speed 1.5x"')
	expect(playbackSpeedMarkup).toContain(">1.5x</button>")
})
