// the dependency pin rules: a Dockerfile tag that moved off .bun-version fails naming both versions, a patched package
// the lockfile installs at another version fails naming its key, Dependabot ignores every patched package, and a dev
// stack on another LiteLLM image than production's fails naming both images
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { toBunVersionViolations, toLiteLLMImageViolations, toPatchedDependencyViolations } from "./dependencyPins"
import { toInstalledPackageVersions, toLockfile } from "./lockfile"

// a Dockerfile whose build and runtime stages run Bun 1.4.4, each pinned by digest
const DOCKERFILE_TEXT = [
	"# syntax=docker/dockerfile:1",
	"FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS build",
	"RUN bun install --frozen-lockfile",
	"FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS runtime",
	'CMD ["bun", "apps/api/index.ts"]',
].join("\n")

// a lockfile as Bun writes it, trailing commas included, after an update moved markdown-to-jsx off its patched version
const LOCKFILE_TEXT = `{
  "lockfileVersion": 2,
  "workspaces": {
    "": {
      "name": "carlnotes",
    },
    "apps/web": {
      "name": "@carlnotes/web",
      "dependencies": {
        "markdown-to-jsx": "^9.10.4",
      },
    },
  },
  "packages": {
    "@carlnotes/web": ["@carlnotes/web@workspace:apps/web"],

    "expo-audio": ["expo-audio@58.0.11", "", { "peerDependencies": { "expo": "*" } }, "sha512-r/3Q=="],

    "markdown-to-jsx": ["markdown-to-jsx@9.10.5", "", {}, "sha512-zeja=="],
  }
}
`

// the LiteLLM image that production's Dockerfile starts from, pinned by tag and digest
const LITELLM_IMAGE_DIGEST = "sha256:db36453d25e76c9eb689d7d51b8e5fa48843243d7a86ed1284cf574ce0107b3f"
const LITELLM_IMAGE = `ghcr.io/berriai/litellm-database:v1.106.4@${LITELLM_IMAGE_DIGEST}`

// production's LiteLLM Dockerfile
const LITELLM_DOCKERFILE_TEXT = [
	"# use -database instead of plain litellm: it stores virtual keys and budgets in postgres",
	`FROM ${LITELLM_IMAGE}`,
	"COPY litellm-config.yaml /app/config.yaml",
].join("\n")

// a compose file whose dev stack runs the given LiteLLM image beside Redis
function toComposeText(litellmImage: string): string {
	return ["services:", "  litellm:", `    image: ${litellmImage}`, "  redis:", "    image: redis:7.4-alpine"].join("\n")
}

test(".bun-version at the Dockerfile's tag passes", () => {
	expect(toBunVersionViolations({ bunVersionText: "1.4.4\n", dockerfileText: DOCKERFILE_TEXT })).toEqual([])
})

test("a Dockerfile tag that moved off .bun-version fails once, naming both versions", () => {
	// both stages run 1.4.4 while .bun-version still names 1.4.3
	const violations = toBunVersionViolations({ bunVersionText: "1.4.3\n", dockerfileText: DOCKERFILE_TEXT })
	expect(violations).toHaveLength(1)
	expect(violations[0]).toContain("pins Bun 1.4.3")
	expect(violations[0]).toContain("oven/bun tag is 1.4.4")
})

test("one stage that moved alone fails for its tag", () => {
	// the runtime stage alone moves to 1.4.5
	const dockerfileText = DOCKERFILE_TEXT.replace(/1\.4\.4(@sha256:\w+ AS runtime)/, "1.4.5$1")
	const violations = toBunVersionViolations({ bunVersionText: "1.4.4\n", dockerfileText })
	expect(violations).toHaveLength(1)
	expect(violations[0]).toContain("oven/bun tag is 1.4.5")
})

test("a stage that names a platform before its image is compared too", () => {
	// one stage at 1.4.5 behind a platform flag
	const dockerfileText = "FROM --platform=linux/amd64 oven/bun:1.4.5@sha256:1d22 AS build\n"
	const violations = toBunVersionViolations({ bunVersionText: "1.4.4\n", dockerfileText })
	expect(violations).toHaveLength(1)
	expect(violations[0]).toContain("oven/bun tag is 1.4.5")
})

test("a Dockerfile with no oven/bun stage fails", () => {
	// a Dockerfile on another base image
	const violations = toBunVersionViolations({ bunVersionText: "1.4.4\n", dockerfileText: "FROM node:24\n" })
	expect(violations).toEqual(["the Dockerfile has no FROM oven/bun line to compare .bun-version with"])
})

test("a patched package installed at another version fails naming its key, and an installed one passes", () => {
	// the lockfile installs expo-audio at its patched version and markdown-to-jsx one patch later
	const violations = toPatchedDependencyViolations({
		patchedDependencyKeys: ["expo-audio@58.0.11", "markdown-to-jsx@9.10.4"],
		installedPackageVersions: toInstalledPackageVersions(toLockfile(LOCKFILE_TEXT)),
	})
	expect(violations).toHaveLength(1)
	expect(violations[0]).toStartWith("patchedDependencies names markdown-to-jsx@9.10.4,")
})

test("a lockfile of another shape throws an error", () => {
	expect(() => toLockfile('{ "lockfileVersion": 3, "entries": [] }')).toThrow()
})

// each key of the root patchedDependencies is a name and a version, and Dependabot's Bun updates ignore that name
test("Dependabot ignores every package the root package.json patches", () => {
	// the names of the patched packages, the text before each key's version
	const rootPackageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
		patchedDependencies: Record<string, string>
	}
	const patchedPackageNames = Object.keys(rootPackageJson.patchedDependencies).map((patchedDependencyKey) =>
		patchedDependencyKey.slice(0, patchedDependencyKey.lastIndexOf("@")),
	)

	// the names the Bun ecosystem's update ignores
	const dependabotConfig = Bun.YAML.parse(readFileSync(".github/dependabot.yml", "utf8")) as {
		updates: { "package-ecosystem": string; ignore?: { "dependency-name": string }[] }[]
	}
	const bunUpdate = dependabotConfig.updates.find((update) => update["package-ecosystem"] === "bun")
	const ignoredPackageNames = (bunUpdate?.ignore ?? []).map((ignoreCondition) => ignoreCondition["dependency-name"])

	// the root package.json patches a package, and the ignored names include every patched one
	expect(patchedPackageNames.length).toBeGreaterThan(0)
	expect(ignoredPackageNames).toEqual(expect.arrayContaining(patchedPackageNames))
})

test("a dev stack on the LiteLLM image production starts from passes", () => {
	// both files name one tag at one digest
	const violations = toLiteLLMImageViolations({
		composeText: toComposeText(LITELLM_IMAGE),
		dockerfileText: LITELLM_DOCKERFILE_TEXT,
	})
	expect(violations).toEqual([])
})

test("a dev stack on another LiteLLM tag fails once, naming both images", () => {
	// the dev stack still runs v1.94.0, with no digest
	const violations = toLiteLLMImageViolations({
		composeText: toComposeText("ghcr.io/berriai/litellm-database:v1.94.0"),
		dockerfileText: LITELLM_DOCKERFILE_TEXT,
	})
	expect(violations).toEqual([
		`docker-compose.yml runs LiteLLM ghcr.io/berriai/litellm-database:v1.94.0 and infra/litellm/Dockerfile starts from ${LITELLM_IMAGE}. pin both to one tag and digest`,
	])
})

test("a dev stack on production's LiteLLM tag at another digest, or at none, fails", () => {
	// the same tag pinned to another digest
	const otherDigestImage = LITELLM_IMAGE.replace("sha256:db36", "sha256:aa11")
	const otherDigestViolations = toLiteLLMImageViolations({
		composeText: toComposeText(otherDigestImage),
		dockerfileText: LITELLM_DOCKERFILE_TEXT,
	})
	expect(otherDigestViolations).toHaveLength(1)
	expect(otherDigestViolations[0]).toContain(`runs LiteLLM ${otherDigestImage} and`)

	// the same tag with no digest
	const tagOnlyViolations = toLiteLLMImageViolations({
		composeText: toComposeText("ghcr.io/berriai/litellm-database:v1.106.4"),
		dockerfileText: LITELLM_DOCKERFILE_TEXT,
	})
	expect(tagOnlyViolations).toHaveLength(1)
	expect(tagOnlyViolations[0]).toContain("runs LiteLLM ghcr.io/berriai/litellm-database:v1.106.4 and")
})

test("a compose file or a Dockerfile that names no LiteLLM image fails", () => {
	// a dev stack of Redis alone
	const composeViolations = toLiteLLMImageViolations({
		composeText: "services:\n  redis:\n    image: redis:7.4-alpine\n",
		dockerfileText: LITELLM_DOCKERFILE_TEXT,
	})
	expect(composeViolations).toEqual([
		"docker-compose.yml has no LiteLLM image line to compare with infra/litellm/Dockerfile",
	])

	// a Dockerfile on another base image
	const dockerfileViolations = toLiteLLMImageViolations({
		composeText: toComposeText(LITELLM_IMAGE),
		dockerfileText: "FROM node:24\n",
	})
	expect(dockerfileViolations).toEqual([
		"infra/litellm/Dockerfile has no FROM line for a LiteLLM image to compare docker-compose.yml with",
	])
})

// the dev stack runs the proxy at production's version, so a charge checked in dev is the charge production makes
test("the repo's dev stack runs the LiteLLM image that production's Dockerfile starts from", () => {
	// the repo's own compose file and LiteLLM Dockerfile
	const violations = toLiteLLMImageViolations({
		composeText: readFileSync("docker-compose.yml", "utf8"),
		dockerfileText: readFileSync("infra/litellm/Dockerfile", "utf8"),
	})
	expect(violations).toEqual([])
})
