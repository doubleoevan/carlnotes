// the dependency pin rules: .bun-version names the Bun in the tag of each oven/bun stage of the Dockerfile, every
// patchedDependencies key names a package version the lockfile installs, and docker-compose.yml runs the LiteLLM image
// that infra/litellm/Dockerfile starts from

// the tag of an oven/bun image on a Dockerfile's FROM line, after any flag and up to the digest
const BUN_IMAGE_TAG_PATTERN = /^FROM\s+(?:--\S+\s+)*oven\/bun:([^@\s]+)/gm

// a LiteLLM image with its tag and its digest, on a compose file's image line and on a Dockerfile's FROM line after
// any flag
const COMPOSE_LITELLM_IMAGE_PATTERN = /^\s*image:\s*["']?([^\s"']*litellm[^\s"']*)/gm
const DOCKERFILE_LITELLM_IMAGE_PATTERN = /^FROM\s+(?:--\S+\s+)*(\S*litellm\S*)/gm

// the text of .bun-version, and the text of the Dockerfile
type ToBunVersionViolationsOptions = { bunVersionText: string; dockerfileText: string }

// the keys of the root package.json's patchedDependencies, and every package version the lockfile installs
type ToPatchedDependencyViolationsOptions = { patchedDependencyKeys: string[]; installedPackageVersions: Set<string> }

// the text of docker-compose.yml, and the text of infra/litellm/Dockerfile
type ToLiteLLMImageViolationsOptions = { composeText: string; dockerfileText: string }

/**
 * Returns one line for each oven/bun tag in the Dockerfile that differs from .bun-version, naming both versions, or one
 * line if the Dockerfile has no oven/bun stage.
 */
export function toBunVersionViolations({ bunVersionText, dockerfileText }: ToBunVersionViolationsOptions): string[] {
	// the pinned version, and each tag the Dockerfile's oven/bun stages name
	const bunVersion = bunVersionText.trim()
	const imageTags = toDistinctCaptures(dockerfileText, BUN_IMAGE_TAG_PATTERN)
	if (imageTags.length === 0) {
		return ["the Dockerfile has no FROM oven/bun line to compare .bun-version with"]
	}

	// name both versions for each tag that differs
	return imageTags
		.filter((imageTag) => imageTag !== bunVersion)
		.map(
			(imageTag) =>
				`.bun-version pins Bun ${bunVersion} and the Dockerfile's oven/bun tag is ${imageTag}. pin both to one version`,
		)
}

/**
 * Returns one line for each patchedDependencies key that names a package version the lockfile does not install.
 */
export function toPatchedDependencyViolations({
	patchedDependencyKeys,
	installedPackageVersions,
}: ToPatchedDependencyViolationsOptions): string[] {
	return patchedDependencyKeys
		.filter((patchedDependencyKey) => !installedPackageVersions.has(patchedDependencyKey))
		.map(
			(patchedDependencyKey) =>
				`patchedDependencies names ${patchedDependencyKey}, a version the lockfile does not install, so its patch is not applied. pin the package back to that version, or make the patch again for the installed version`,
		)
}

/**
 * Returns one line for each LiteLLM image docker-compose.yml runs that is not the image infra/litellm/Dockerfile
 * starts from, tag and digest alike, naming both images, or one line for a file that names no LiteLLM image.
 */
export function toLiteLLMImageViolations({ composeText, dockerfileText }: ToLiteLLMImageViolationsOptions): string[] {
	// each LiteLLM image the dev stack runs, and each one production's image starts from
	const composeImages = toDistinctCaptures(composeText, COMPOSE_LITELLM_IMAGE_PATTERN)
	const dockerfileImages = toDistinctCaptures(dockerfileText, DOCKERFILE_LITELLM_IMAGE_PATTERN)

	// a file that names no LiteLLM image leaves nothing to compare
	if (composeImages.length === 0) {
		return ["docker-compose.yml has no LiteLLM image line to compare with infra/litellm/Dockerfile"]
	}
	if (dockerfileImages.length === 0) {
		return ["infra/litellm/Dockerfile has no FROM line for a LiteLLM image to compare docker-compose.yml with"]
	}

	// name both images for each pair that differs
	return composeImages.flatMap((composeImage) =>
		dockerfileImages
			.filter((dockerfileImage) => dockerfileImage !== composeImage)
			.map(
				(dockerfileImage) =>
					`docker-compose.yml runs LiteLLM ${composeImage} and infra/litellm/Dockerfile starts from ${dockerfileImage}. pin both to one tag and digest`,
			),
	)
}

// each distinct text the pattern captures in a file's text
function toDistinctCaptures(fileText: string, capturePattern: RegExp): string[] {
	return [...new Set([...fileText.matchAll(capturePattern)].map(([, capture]) => capture ?? ""))]
}
