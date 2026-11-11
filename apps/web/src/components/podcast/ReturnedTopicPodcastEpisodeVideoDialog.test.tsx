// the layout's dialog for a returned film renders nothing, and loads no film player, until a film returns
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { ReturnedTopicPodcastEpisodeVideoDialog } from "./ReturnedTopicPodcastEpisodeVideoDialog"

test("a page with no returned film renders no dialog", () => {
	expect(renderToStaticMarkup(<ReturnedTopicPodcastEpisodeVideoDialog />)).toBe("")
})

test("the Video dialog and its film player reach the layout through a dynamic import alone", () => {
	// the module the layout imports, and each of its static imports
	const moduleSource = readFileSync(join(import.meta.dir, "ReturnedTopicPodcastEpisodeVideoDialog.tsx"), "utf8")
	const staticImports = moduleSource.match(/^import .*$/gm) ?? []
	expect(staticImports.filter((staticImport) => /VideoDialog|VideoPlayer/.test(staticImport))).toEqual([])
	expect(moduleSource).toContain('import("./TopicPodcastEpisodeVideoDialog")')
})
