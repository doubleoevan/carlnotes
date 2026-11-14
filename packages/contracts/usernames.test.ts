// username rules: the shape, the validator, the comparison form, and the pairs that read as mistakes
import { describe, expect, it } from "bun:test"
import {
	hasSharedStem,
	RESERVED_USERNAMES,
	toNormalizedUsername,
	toProposedUsernames,
	toProviderUsername,
	toUsernameRejection,
	toUsernameWithDigits,
	USERNAME_COMBINATIONS,
	USERNAME_MAX_LENGTH,
} from "./usernames"
import { USERNAME_ADJECTIVES, USERNAME_NOUNS } from "./usernameWords"

// the combination space has to be large enough that a collision, and so a digit suffix, is the exception.
describe("the word lists", () => {
	it("makes enough combinations that digits stay the exception", () => {
		expect(USERNAME_COMBINATIONS).toBeGreaterThanOrEqual(1000)
	})

	// the limit has to clear the longest pair the lists can draw plus its four-digit suffix
	it("cannot draw a pair longer than the limit allows", () => {
		for (const proposal of toProposedUsernames(60)) {
			expect(toUsernameWithDigits(proposal).length).toBeLessThanOrEqual(USERNAME_MAX_LENGTH)
		}
	})
})

describe("toNormalizedUsername", () => {
	// one normalized username to check for duplication
	it("folds separators and case to one comparison form", () => {
		expect(toNormalizedUsername("SlowRoasted")).toBe("slowroasted")
		expect(toNormalizedUsername("slow-roasted")).toBe("slowroasted")
		expect(toNormalizedUsername("slow_roasted")).toBe("slowroasted")
	})

	it("folds compatibility forms with NFKC", () => {
		expect(toNormalizedUsername("Ｃａｒｌ")).toBe("carl")
	})
})

describe("toUsernameRejection", () => {
	it("accepts a well-formed username", () => {
		expect(toUsernameRejection("Bright-Macchiato")).toBeNull()
		expect(toUsernameRejection("bright_macchiato")).toBeNull()
	})

	it("rejects anything outside the length range", () => {
		expect(toUsernameRejection("ab")).toBe("length")
		expect(toUsernameRejection("a".repeat(USERNAME_MAX_LENGTH + 1))).toBe("length")
	})

	// a cyrillic lookalike does not fold to latin, so the character check is what stops the impersonation
	it("rejects confusables and anything else outside the character set", () => {
		expect(toUsernameRejection("Саrl-Notes")).toBe("charset")
		expect(toUsernameRejection("carl.notes")).toBe("charset")
		expect(toUsernameRejection("carl notes")).toBe("charset")
	})

	it("rejects a leading or trailing separator", () => {
		expect(toUsernameRejection("-carl-")).toBe("separator")
		expect(toUsernameRejection("_reader")).toBe("separator")
	})

	// the reserved username list runs on the normalized form
	it("rejects a reserved word however it is punctuated", () => {
		expect(toUsernameRejection("carl")).toBe("reserved")
		expect(toUsernameRejection("CARL")).toBe("reserved")
		expect(toUsernameRejection("c-a-r-l")).toBe("reserved")
		expect(toUsernameRejection("notes_of_carl")).toBe("reserved")
	})

	it("rejects the names that would pass someone off as the site or its staff", () => {
		for (const name of ["carl", "carlnotes", "notesofcarl", "admin", "support"]) {
			expect(toUsernameRejection(name)).toBe("reserved")
		}
	})

	it("rejects the second host's name and the words that claim a role, however they are punctuated", () => {
		for (const name of ["vienna", "Vienna", "official", "staff", "moderator", "mod-erator", "STAFF"]) {
			expect(toUsernameRejection(name)).toBe("reserved")
		}
	})

	it("allows a name that only contains a reserved word", () => {
		for (const name of ["vienna-fan", "staffordshire", "officially"]) {
			expect(toUsernameRejection(name)).toBeNull()
		}
	})

	it("rejects every route slug, reserved ahead of any vanity-url work", () => {
		for (const segment of ["topics", "pricing", "account", "activity", "settings", "profiles", "teams", "login"]) {
			expect(toUsernameRejection(segment)).toBe("reserved")
		}
	})

	it("allows a plain word that is not a route", () => {
		for (const segment of ["explore", "espresso", "raccoon"]) {
			expect(toUsernameRejection(segment)).toBeNull()
		}
	})
})

describe("hasSharedStem", () => {
	// stem-sharing username pairs the current lists could actually generate
	it("catches the pairs that read as mistakes", () => {
		expect(hasSharedStem("Roasted", "Roast")).toBe(true)
		expect(hasSharedStem("DarkRoasted", "Roast")).toBe(true)
		expect(hasSharedStem("SlowRoasted", "Roast")).toBe(true)
		expect(hasSharedStem("ColdBrewed", "Brew")).toBe(true)
		expect(hasSharedStem("ColdBrewed", "ColdBrew")).toBe(true)
	})

	// neither word contains the other, so only stemming past the suffix catches this one
	it("catches a pair that shares a stem without containing it", () => {
		expect(hasSharedStem("WellRead", "Reader")).toBe(true)
	})

	it("leaves an ordinary pair alone", () => {
		expect(hasSharedStem("Bright", "Macchiato")).toBe(false)
		expect(hasSharedStem("Insomniac", "Raccoon")).toBe(false)
	})
})

describe("toProposedUsernames", () => {
	// a proposal is offered bare, with digits only ever the last resort
	it("returns distinct AdjectiveNoun proposals with no separator and no digits", () => {
		const proposals = toProposedUsernames(5)
		expect(proposals.length).toBe(5)
		expect(new Set(proposals).size).toBe(5)
		// two capitalized words joined bare, so the avatar initials can read the boundary
		for (const proposal of proposals) {
			expect(proposal).toMatch(/^[A-Z][a-z]*[A-Z][A-Za-z]*$/)
		}
	})

	// the stem rule itself is covered above. a joined name cannot be split back into its true pair,
	// since either half may hold a capital of its own
	it("never offers a rejected proposal", () => {
		for (const proposal of toProposedUsernames(100)) {
			expect(toUsernameRejection(proposal)).toBeNull()
		}
	})
})

describe("toUsernameWithDigits", () => {
	it("appends exactly four digits to break a collision", () => {
		expect(toUsernameWithDigits("BrightMacchiato")).toMatch(/^BrightMacchiato\d{4}$/)
	})
})

// the reserved check runs on the normalized form, so separator spellings of a route are caught too
describe("routes added by later changes", () => {
	it("catches a route slug in any separator spelling", () => {
		expect(toUsernameRejection("reset-password")).toBe("reserved")
		expect(toUsernameRejection("resetpassword")).toBe("reserved")
		expect(toUsernameRejection("Reset_Password")).toBe("reserved")
	})
})

// the web app's route files, where a file's path names the url it serves
const WEB_ROUTES_FOLDER = new URL("../../apps/web/src/routes", import.meta.url).pathname

// the first url segment of each web route file. a file that starts with a dash is no route, a segment that starts
// with an underscore is a layout that adds nothing to the url, and an index or a parameter is no slug
function toWebRouteSlugs(): string[] {
	// every file under the routes folder, by its path from the folder
	const routeFilePaths = Array.from(new Bun.Glob("**/*.tsx").scanSync({ cwd: WEB_ROUTES_FOLDER }))
	const routeSlugs = routeFilePaths.flatMap((routeFilePath) => {
		// the file's url segments, split at each folder and each dot
		const pathSegments = routeFilePath.replace(/\.tsx$/, "").split(/[/.]/)
		const urlSegments = pathSegments.filter((pathSegment) => !pathSegment.startsWith("_"))
		const [firstUrlSegment] = urlSegments

		// keep the first segment of a route that serves a path of its own
		const isRouteFile = !pathSegments.some((pathSegment) => pathSegment.startsWith("-"))
		const isSlug = firstUrlSegment !== undefined && firstUrlSegment !== "index" && !firstUrlSegment.startsWith("$")
		return isRouteFile && isSlug ? [firstUrlSegment] : []
	})
	return [...new Set(routeSlugs)]
}

// a username can never shadow a root path. every root route of the web app is reserved, and so is every path the api
// serves at the site's root
describe("root route slugs", () => {
	it("reserves the first url segment of every web route file", () => {
		// the slugs include a route beside the layout, one inside it, one behind sign-in, and one with a parameter
		const webRouteSlugs = toWebRouteSlugs()
		expect(webRouteSlugs).toEqual(expect.arrayContaining(["reset-password", "search", "account", "topics"]))

		// each one is reserved in its comparison form
		const unreservedSlugs = webRouteSlugs.filter((slug) => !RESERVED_USERNAMES.has(toNormalizedUsername(slug)))
		expect(unreservedSlugs).toEqual([])
	})

	it("rejects the search page, the component browser, the release notes, the podcast feeds, and the stories folder", () => {
		for (const slug of [
			"search",
			"nightshift",
			"releases",
			"changelog",
			"podcast-feeds",
			"podcast-video-feeds",
			"stories",
		]) {
			expect(toUsernameRejection(slug)).toBe("reserved")
		}
	})

	it("rejects every other path the api serves at the site's root", () => {
		for (const slug of ["api", "mcp", "docs", "blog", "pricing", "assets", "screenshots"]) {
			expect(toUsernameRejection(slug)).toBe("reserved")
		}
	})
})

describe("reserved usernames", () => {
	// the two names the app speaks with: @carl is Carl himself and @all addresses a whole chat room
	it("rejects carl and all in every spelling", () => {
		for (const spelling of ["carl", "CARL", "c-a-r-l", "C_a_R_l", "all", "A_L_L", "a-l-l"]) {
			expect(toUsernameRejection(spelling)).toBe("reserved")
		}
	})

	// the generator hands out names without asking the validator, so its own word pairs are checked here
	it("never generates a name that spells a reserved one", () => {
		const clashes = USERNAME_ADJECTIVES.flatMap((adjective) =>
			USERNAME_NOUNS.map((noun) => `${adjective}${noun}`).filter((name) =>
				RESERVED_USERNAMES.has(toNormalizedUsername(name)),
			),
		)
		expect(clashes).toEqual([])
	})
})

describe("provider usernames", () => {
	// github sends its handle as login, and a well-formed one is proposed as written
	it("keeps a well-formed provider handle", () => {
		expect(toProviderUsername("doubleoevan")).toBe("doubleoevan")
		expect(toProviderUsername("Warm-Bean42")).toBe("Warm-Bean42")
	})

	// a handle that breaks any username rule is dropped, and the signup generates a name instead
	it("drops a handle the username rules reject", () => {
		// too short, too long, a reserved name, and a bad character
		expect(toProviderUsername("ev")).toBeNull()
		expect(toProviderUsername("a".repeat(39))).toBeNull()
		expect(toProviderUsername("carl")).toBeNull()
		expect(toProviderUsername("someone else")).toBeNull()
	})

	// google sends no handle at all, and nothing else slips through as one
	it("drops a missing or non-string handle", () => {
		expect(toProviderUsername(undefined)).toBeNull()
		expect(toProviderUsername(null)).toBeNull()
		expect(toProviderUsername("")).toBeNull()
		expect(toProviderUsername(42)).toBeNull()
	})
})
