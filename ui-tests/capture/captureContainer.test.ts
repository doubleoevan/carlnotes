// the capture container's Dockerfile against the repo: both bases pinned by digest, the Playwright base at the
// playwright-core version that the lockfile installs, Bun at the .bun-version version, and the environment id's base
// the same as the FROM line
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"

// the Dockerfile's base images and the environment id's base
const DOCKERFILE_TEXT = readFileSync("ui-tests/Dockerfile", "utf8")
const BASE_IMAGES = [...DOCKERFILE_TEXT.matchAll(/^FROM (\S+)/gm)].map(([, baseImage]) => baseImage ?? "")
const ENVIRONMENT_BASE_IMAGE = /^ENV UI_TESTS_BASE_IMAGE=(\S+)$/m.exec(DOCKERFILE_TEXT)?.[1]

// the Bun base and the Playwright base
const BUN_BASE_IMAGE = BASE_IMAGES.find((baseImage) => baseImage.startsWith("oven/bun:")) ?? ""
const PLAYWRIGHT_BASE_IMAGE =
	BASE_IMAGES.find((baseImage) => baseImage.startsWith("mcr.microsoft.com/playwright:")) ?? ""

// every base names a digest beside its tag
test("both base images are pinned by digest", () => {
	expect(BASE_IMAGES).toHaveLength(2)
	for (const baseImage of BASE_IMAGES) {
		expect(baseImage).toMatch(/:[\w.-]+@sha256:[0-9a-f]{64}$/)
	}
})

// the Playwright base matches the playwright-core that the lockfile installs, and Bun matches .bun-version
test("the bases match the installed Playwright and the pinned Bun", () => {
	const playwrightVersion = (
		JSON.parse(readFileSync("node_modules/playwright-core/package.json", "utf8")) as { version: string }
	).version
	expect(PLAYWRIGHT_BASE_IMAGE).toStartWith(`mcr.microsoft.com/playwright:v${playwrightVersion}-`)
	expect(BUN_BASE_IMAGE).toStartWith(`oven/bun:${readFileSync(".bun-version", "utf8").trim()}@`)
})

// the environment id names the same base that the image builds from
test("the environment id's base is the FROM line's", () => {
	expect(ENVIRONMENT_BASE_IMAGE).toBe(PLAYWRIGHT_BASE_IMAGE)
})
