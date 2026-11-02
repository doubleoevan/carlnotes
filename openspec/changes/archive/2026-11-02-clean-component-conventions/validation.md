# Implementation evidence

The change enforces the six adopted files and leaves the wider migration report-only. Inspection and baseline
captures used `f301c5cc`. No Nightshift contracts, primitive APIs, component bodies, state initialization, or styling
changed. LinkPreviewLoading moved to its own module with the same JSX; its three direct consumers and the existing
loading story now import it there. The link predicate is imported directly from core.

## Tooling

Biome 2.6.3 owns export-only modules, export-based filenames, and nested component identity. The fixture suite runs
the installed binary and verifies its gaps: multiple component exports, a matching type hiding a wrong component
name, and generic local props names. The Babel layer checks only these structural relationships and unresolved
identities. Babel 8.0.0 is pinned because Bun's minimum release age rejected the 8.1.0 graph; that policy was retained.

`bun test scripts/componentConventions.test.ts scripts/componentConventionsCli.test.ts` passes 48 tests with 171
assertions. Fixtures cover passing/rejected syntax, shared props and private support, classifications, stale scope,
deterministic output, strict versus report exits, parser/configuration failures, and an adopted-file regression.
Named and default exports of one component produce one props finding. Parse failures name the affected file.

## Inventory

Both documented report commands succeeded before migration and after migration. Repeated final JSON reports are
byte-identical. The classification counts partition candidate paths; violating files overlap checked/review files.

| Measure | Before | After |
| --- | ---: | ---: |
| Candidate paths | 789 | 791 |
| Checked | 461 | 463 |
| Excluded | 293 | 294 |
| Requiring review | 35 | 34 |
| Files with violations | 146 | 145 |
| Diagnostics | 369 | 366 |

LinkPreviewCard loses its extra component, name, and external helper-export findings. The extracted component adds
one checked file and its story adds one exclusion. TopicResourceInfo's existing findings move with its import lines;
all other legacy inventory records remain unchanged. AccountFields and web TablePagination remain visible findings.

`bun run check:components` reports six checked files, no exclusions, no review cases, and no diagnostics. Preflight
uses this same adopted set. Knip finds the entry through root scripts; its former Biome dependency exemption is now
unnecessary and was removed. No new Knip exclusions were added.

`bun run check` is green: Biome, the six-file convention check, package boundaries, Knip, component/client parity,
purchase paths, frozen API contracts, TypeScript, workflow bundles, and 3,165 passing tests (one existing readiness
integration test skipped; zero failures). Component parity retains two Nightshift contracts and all 47 shared
component pairs. The final diff and `openspec validate clean-component-conventions --strict` pass.

## Rendered and interaction checks

Storybook's MCP catalog was inspected before edits and exposes the new `common-linkpreviewloading--default` story.
The old `common-linkpreviewcard--loading` ID remains. Host captures cover IconButton's default, disabled, markup
tooltip, class override, and open tooltip; article, loading, and YouTube previews; and ThinkingLine. Each runs in
Latte and Dark roast at phone and desktop widths.

All 36 pre-existing captures are byte-identical before and after. The four new loading-story captures are stable.
All 40 final captures have no accessibility violations or blocked requests. The capture runner executes the existing
tooltip interaction. Browser checks also exercised IconButton, confirmed its disabled and markup-label states and
class override, and verified that clicking the YouTube thumbnail replaces it with the autoplay iframe in place.
The story's deliberately fake video ID produces YouTube's unavailable-video message after that transition.

The existing iPhone SE development build rendered ThinkingLine in both themes before and after. Text role, spacing,
color, card fill, and the module-level shimmer adapter are retained. Metro reloaded the app after the shared source
edit, so the native screenshots contain different randomly chosen phrases; they are visual inspections, not pixel
equality assertions. `bun test apps/web/src/components/common/ThinkingLine.test.tsx` passes the mounted-phrase
stability test across presentation-prop updates.

The final web regression run passes 40 cases across both themes and both viewport sizes with no JavaScript errors.
It checks button labels, disabled controls, tooltip content, class overrides, article navigation, loading states,
YouTube activation, and phrase stability across viewport changes.

iPhone SE checks cover the signed-in home screen, Default, Narrow, and Chat Bubble. The narrow and chat views retain
their phrases when switching themes. A fresh Maestro run also passes the chat story and phrase assertions.
Android checks use the latest existing EAS development build in isolated temporary emulator storage. All six
Default, Narrow, and Chat Bubble theme combinations pass, with phrase equality across each theme switch.
Normal motion renders correctly; reduced motion supports static captures. The visitor home screen loads its
Featured topics, and the current process reports no fatal or JavaScript errors. No account data was cleared.

The platforms ran sequentially. Browser processes, Docker, each phone simulator, Metro, and the test API were
stopped between checks. Temporary Android data and the downloaded build were removed after testing.
These are focused component and startup checks; they do not certify purchases, push delivery, or every account flow.

## Pinned-container validation

`bun run visual:select -- --base f301c5cc` selects all stories because the dependency manifests changed.
The pinned-container run was scoped to the ten affected stories listed below, as the design requires.
`UI_TESTS_CAPTURE_CONCURRENCY=1 UI_TESTS_CAPTURE_MINUTES=15 bun run visual:web -- --story ...` completed all 40
captures with stable images, no accessibility violations, and no blocked requests. `bun run visual:report` succeeded.
The captures are new because no approved baselines exist; no baselines were approved or replaced.

Docker initially failed with a read-only snapshot filesystem, then exhausted host disk space during a retry.
Stopping the test servers and clearing the disposable npm download cache recovered space. Restarting Docker
restored the daemon, and the one-worker capture passed. Docker and the test simulator were stopped afterward
to release memory. The earlier host comparison provides the matching before/after evidence.

## Ship verification fixes

The structural audit found a hand-written visibility list in the new-topic prompt. Its builder now renders that
same sentence from contract values, with a regression assertion for the exact wording. Prompt version and behavior
are unchanged. Spec verification also added coverage for same-name type/value exports, exported hooks, and nested
memoized children. The parser retains a component value when its name is also used by a type.

## Reproduction

```bash
bun run report:components
bun run report:components -- --json
bun run check:components
bun test scripts/componentConventions.test.ts scripts/componentConventionsCli.test.ts
bun test apps/web/src/components/common/ThinkingLine.test.tsx
bun scripts/check-component-parity.ts
bun run check
openspec validate clean-component-conventions --strict
bun run visual:select -- --base f301c5cc
bun run visual:web
bun run visual:report
```

For the host comparison while Docker is unavailable:

```bash
bun run visual:web -- --on-host \
  --story common-iconbutton--default --story common-iconbutton--disabled \
  --story common-iconbutton--markup-tooltip --story common-iconbutton--own-look \
  --story common-iconbutton--tooltip-open --story common-linkpreviewcard--article \
  --story common-linkpreviewcard--loading --story common-linkpreviewcard--youtube-video \
  --story common-thinkingline--default --story common-linkpreviewloading--default
```
