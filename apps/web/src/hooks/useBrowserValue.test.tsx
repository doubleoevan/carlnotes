// page load tests: a page that hydrates the value its server load read sends no request, a later page id loads in the
// browser, and a page the browser mounts after hydration loads at once
import { afterEach, expect, test } from "bun:test"
import { Window } from "happy-dom"
import { act } from "react"
import { createRoot, hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { useLoadInBrowser } from "./useBrowserValue"

// the DOM globals each test replaces, and the cleanups that put them back
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) {
		await cleanup()
	}
})

// a page's id, whether its server load read it, and the browser load the page runs
type LoadedPageProps = { pageId: string; isLoadedOnServer: boolean; loadPage: () => void }

// a page that runs its load in the browser
function LoadedPage({ pageId, isLoadedOnServer, loadPage }: LoadedPageProps) {
	useLoadInBrowser({ pageId, isLoadedOnServer, loadPage })
	return <p>{pageId}</p>
}

// a happy-dom window with a container, its globals in place until the test's cleanup
function toTestContainer(): HTMLElement {
	// the replaced globals, saved for the cleanup
	const window = new Window()
	const replacements = {
		window,
		document: window.document,
		navigator: window.navigator,
		IS_REACT_ACT_ENVIRONMENT: true,
	}
	const descriptors = new Map(
		Object.keys(replacements).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
	)
	for (const [name, replacement] of Object.entries(replacements)) {
		Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: replacement })
	}

	// put each global back and close the window after the test
	cleanups.push(async () => {
		// each global as it was before the test
		for (const [name, descriptor] of descriptors) {
			if (descriptor) {
				Object.defineProperty(globalThis, name, descriptor)
			} else {
				Reflect.deleteProperty(globalThis, name)
			}
		}

		// the window closed once its globals are gone
		await window.happyDOM.close()
	})

	// the container the test renders into
	const container = window.document.createElement("div")
	window.document.body.append(container)
	return container as unknown as HTMLElement
}

// a root, unmounted before the globals go back
function keepRoot(root: Root): Root {
	cleanups.unshift(async () => act(async () => root.unmount()))
	return root
}

test("a page that hydrates its server-loaded value sends no load, and a later page id loads in the browser", async () => {
	// the server's render of a page whose load ran on the server, hydrated in the browser
	let loadCount = 0
	const loadPage = (): void => {
		loadCount += 1
	}
	const page = <LoadedPage pageId="topic-1" isLoadedOnServer loadPage={loadPage} />

	// the server's markup, which the browser hydrates without a load
	const container = toTestContainer()
	container.innerHTML = renderToString(page)
	const root = keepRoot(await act(async () => hydrateRoot(container, page)))
	expect(loadCount).toBe(0)

	// a navigation to another topic loads it in the browser
	await act(async () => root.render(<LoadedPage pageId="topic-2" isLoadedOnServer={false} loadPage={loadPage} />))
	expect(loadCount).toBe(1)
})

test("a page the browser mounts after hydration loads at once, even with a value its route read", async () => {
	// a page mounted with no server render, as a navigation in the browser mounts it
	let loadCount = 0
	const container = toTestContainer()
	const root = keepRoot(createRoot(container))

	// the mount runs the load at once
	await act(async () =>
		root.render(
			<LoadedPage
				pageId="topic-1"
				isLoadedOnServer
				loadPage={() => {
					loadCount += 1
				}}
			/>,
		),
	)
	expect(loadCount).toBe(1)
})
