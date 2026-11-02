# Design

## Context

`scripts/check-component-parity.ts` reads the two Nightshift contracts and runs the rules in
`scripts/componentParity.ts` over the apps' files. `scripts/check-client-parity.ts` walks both apps' imports with
`toImportResolution` from `scripts/importPaths.ts` and `toNamedImports` from `scripts/clientParity.ts`, and reads its
reviewed table from `apps/mobile/parity.md` with `parseParityInventory`. The new rule needs the same three pieces: the
apps' files, the resolver, and a table in `parity.md`.

`packages/core/components/` holds 63 modules. Its convention, followed by 42 of them, is a composition that takes a
`<Name>Elements` adapter type, which each app implements with its own controls. An app's file either renders the core
component (`DataTable as SharedDataTable`), or exports the adapter object that a caller hands to it
(`ACCOUNT_FIELD_ELEMENTS: AccountFieldElements`), or both.

A trace run while writing this design over the current tree, using the repo's resolver, counted these:

| Rule for "backed" | Pairs backed of 143 |
| --- | --- |
| each side reaches any core component through its imports | 89 |
| each side directly imports one common core component | 52 |
| each side imports a value from its same-name core component | 44 |
| each side imports a value or a `…Elements` type from its same-name core component | 47 |

The three pairs between the last two rows are `AccountFields`, `DataTable`, and `TeamFields`. In each, the web's file
imports only the same-name core component's `…Elements` type and exports the adapter object.

## Goals / Non-Goals

**Goals:**

- One deterministic rule for "backed" that a small shared button cannot satisfy.
- Every current separate pair visible in one reviewed table, with a reason a reader can check against the code.
- A gate that retires a row when its pair is shared, renamed, or deleted.

**Non-Goals:**

- Extracting or merging any component. The rows marked `not yet shared` are the backlog for later changes.
- Checking components that only one app defines. The page and action inventory in `parity.md` covers missing screens.
- Judging whether a backed pair's adapters are thin. The AGENTS.md reuse rules and review own that.

## Decisions

### Backed means each side imports its same-name core component or that component's adapter type

A pair `<Name>` is backed when every file named `<Name>.tsx` in each app has an import that resolves to
`packages/core/components/<Name>.tsx` and that names either a value or a type ending in `Elements`.

- **Any core component reached** is the trace's rule, and it passed 89 pairs. `ScrollBox` passes on
  `CopyMarkdownButton`, and `NoteLayout` passes on `NoteComments` through another file. That is the small shared
  button the request rules out.
- **One common core component imported directly** passed 52. `ChatPanelWidget` passes on `ChatPill`, and
  `NoteVisibilitySelect` passes on a constant it reads from `NotesTable`. A shared part is not a shared component.
- **A value import of the same-name core component** passed 44. It fails `AccountFields`, `DataTable`, and
  `TeamFields`, whose web side is exactly the adapter the core convention asks for. It would push the repo's own
  pattern into the inventory.
- **A value or an `…Elements` type from the same-name core component** passed 47, and is the choice. It matches the
  AGENTS.md rule that corresponding web and mobile concerns use the same component names and filenames, and the core
  convention of composing platform adapters. A prop type such as `TableColumn` alone does not count, so a file that
  borrows a type and builds its own component stays unbacked.

The name match is the file's base name, the same key the trace and the request use. A pair whose two sides share a
differently named core module, such as `UserMenu` over `UserMenuItems`, is listed, and its reason names what it
shares. Only static imports count, through `toParsedImports` and `toImportResolution`. A dynamic import of a core
component in a component file does not exist today.

### The inventory is a section of `apps/mobile/parity.md`

`parity.md` already says it is the reviewed inventory beside the checks, and its opening paragraph already points at
the component contracts. The page and action inventory in it records each screen's reuse as `component`, `logic`, or
`native`. A second file would split one reviewer's question, what the app builds on its own and why, across two
places. The section is `## Separately built components`, with columns Component, Kind, and Reason, after the web-only
capabilities table. The file grows from 138 lines to about 245, which stays one concern.

A row's name is in backticks, like a capability row. Primitive rows use the lowercase file name, such as `select`, in
the same table, since the kinds and the reasons are the same kind of record and no component name collides with a
primitive's.

### Three kinds, checked by name

The kinds are `platform API`, `platform difference`, and `not yet shared`. The check fails on any other value, so the
printed counts mean something and a typo cannot hide a row from them. A reason states what the code does, read from
the two files.

The kind follows the AGENTS.md reuse rule: name the platform dependency, then ask whether a small adapter covers it.

- `platform API` is a pair whose job is a native capability, such as `expo-audio` playback, the share sheet and
  `expo-clipboard`, file picking, or a WebView player.
- `platform difference` is a pair whose interaction follows a platform convention, such as hover on web and press on
  mobile, keyboard and caret handling, a native virtualized list, or a destructive `Alert` that renders nothing.
- `not yet shared` is a pair whose differences are leaf elements that a core component's `…Elements` adapter could
  supply: a dialog or popover against a native sheet, a toast or tooltip against an `Alert`, a DOM table against a
  native table over shared columns, a DOM svg against react-native-svg, or one native picker inside otherwise matching
  fields. These rows are the backlog for later extractions.

The seed is read pair by pair during apply. The trace's third-party imports already point at the `platform API` rows,
such as `PodcastEpisodeAudio` and `SpokenAnswerAudio` on `expo-audio`, and `ShareTopic` and `ShareTeam` on
`expo-clipboard`. A kind is not guessed. A pair whose code shows no platform module and no platform convention is
`not yet shared`, and its reason says what each side builds. A pair whose kind the code does not settle, such as one
where only one side imports a platform module for a part that the other side could share, is listed `not yet shared`
and named in the ship report for the user to decide.

### A name two different components share is renamed

The web `search/SearchResults.tsx` exported no `SearchResults`. It held the typeahead's `SearchRowOption` and
`SeeAllResultsOption`, while the mobile `SearchResults` is the search screen's results, whose web counterpart is
`SearchPage`. The AGENTS.md naming rule gives one name to one concern across the apps, so the web file is now
`SearchResultOptions.tsx` and no row lists the false pair. That leaves 142 pairs and 95 rows.

### One parser for both tables

`parseParityInventory` in `scripts/clientParity.ts` reads one heading and two of three columns. It moves to
`scripts/parityInventory.ts` as `parseInventoryTable({ markdown, heading })`, which returns each row's name, middle
column, and reason. The client parity check passes its heading and reads the same row type, with the capability as the
row's name. The component rule passes `## Separately built components` and reads the middle column as the kind.
`PARITY_INVENTORY_PATH` moves with it.

### The rule lives in its own module and runs inside the component parity script

`scripts/componentInventory.ts` exports `checkComponentInventory({ sourceFiles, contractNames, inventoryEntries })`,
which returns `{ violations, counts }`. `componentParity.ts` is 181 lines and holds the contract rules, so the
inventory rule takes its own module and `scripts/componentInventory.test.ts`, beside the existing pair.

`check-component-parity.ts` reads `readAppSourceFiles()`, so the resolver can see `packages/core/components/`, and
passes only the apps' files to `checkComponentParity`, whose contract-import rule is about app files. It runs both
rules, prints every violation from both, and exits non-zero if either has one. On success it prints two lines:

```text
component parity: 2 contracts each have their implementations
component parity: 142 components both apps define. 47 share their core component, 95 listed (10 platform API, 22 platform difference, 63 not yet shared). 1 primitive without a contract, listed
```

Preflight keeps its one `bun scripts/check-component-parity.ts` line, and its comment names the inventory. A separate
script would add a step for the same file walk and the same failure message.

## Risks / Trade-offs

- [The base-name match misses a pair that the apps name differently, such as a web `Popover` and a mobile `Sheet` for
  one menu] → The AGENTS.md naming rule already requires one name for one concern, and the page and action inventory
  records each screen's reuse. The check enforces the name it can see.
- [A file can define several components, so `ChatPanelWidget.tsx` holds a backed `ChatPill` and an unbacked widget] →
  The row's reason names the shared part. A split of such a file is a component change, out of scope here.
- [An `…Elements` type import passes even if the file never implements it] → Biome's recommended `noUnusedImports`
  warns on an unused import, and every `…Elements` import in the apps today types an adapter object. A file that
  imports the type for another use passes, and review catches it.
- [95 rows is a long table] → It is the honest size of the gap. Each `not yet shared` row is a pointer for a later
  extraction, and the table shrinks as the check retires rows.

## Migration Plan

The check and the seeded table land in one change, so preflight is green on the commit that adds the rule. Rolling
back is reverting that change.
