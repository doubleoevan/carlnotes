// write tokens.css and the Figma token files from the Nightshift source. run it after changing a token, as
// bun run nightshift:write. the package itself stays universal, so the file writes live here
import { toWrittenFiles } from "@carlnotes/nightshift/writtenFiles"

// the package folder, from the repo root the script runs in
const NIGHTSHIFT_FOLDER = "packages/nightshift"

// write each file and log its path
for (const [packagePath, fileText] of Object.entries(toWrittenFiles())) {
	await Bun.write(`${NIGHTSHIFT_FOLDER}/${packagePath}`, fileText)
	console.log(`wrote ${NIGHTSHIFT_FOLDER}/${packagePath}`)
}
