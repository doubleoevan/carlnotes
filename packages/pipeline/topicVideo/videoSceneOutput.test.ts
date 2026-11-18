// Check the encoded packet contents as well as their container index.
import { expect, test } from "bun:test"
import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { runFfmpeg } from "@carlnotes/models/ffmpeg"
import { checkVideoSceneOutput } from "./videoSceneOutput"

const execute = promisify(execFile)

test.skipIf(!Bun.which("ffmpeg") || !Bun.which("ffprobe"))(
	"a corrupt final packet fails decoded scene validation",
	async () => {
		// encode a real silent scene and verify the expected 24 frames
		const directory = await mkdtemp(join(tmpdir(), "video-scene-output-"))
		try {
			const path = join(directory, "scene.mp4")
			await runFfmpeg({
				ffmpegArguments: [
					"-f",
					"lavfi",
					"-i",
					"testsrc2=s=1280x720:r=24",
					"-frames:v",
					"24",
					"-c:v",
					"libx264",
					"-threads",
					"2",
					"-pix_fmt",
					"yuv420p",
					path,
				],
			})
			await checkVideoSceneOutput(path, 24)

			// erase the final packet's payload while preserving the complete MP4 sample table
			const { stdout } = await execute("ffprobe", [
				"-v",
				"error",
				"-show_packets",
				"-show_entries",
				"packet=pos,size",
				"-of",
				"json",
				path,
			])
			const { packets } = JSON.parse(stdout)
			expect(packets).toHaveLength(24)
			const packet = packets.at(-1)
			const bytes = await Bun.file(path).bytes()
			bytes.fill(0, Number(packet.pos), Number(packet.pos) + Number(packet.size))
			await Bun.write(path, bytes)
			await expect(checkVideoSceneOutput(path, 24)).rejects.toThrow("frame count or film format")
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	},
)
