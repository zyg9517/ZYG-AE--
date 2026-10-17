# AE2020 Asset Details and Composition Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add on-demand file metadata, sequence aggregation, recursive composition inspection, and an explicit add-to-Render-Queue action while preserving the user-verified AE2020 asset-search MVP.

**Architecture:** Keep the existing `AssetRecord` search and path actions intact. Add plain-data asset-detail and composition adapters at the AE host boundary, validate them in a separate host-contract layer, and keep search/detail/tree behavior in testable CEP-side modules. The panel will expose separate asset and composition result views, load details lazily, and call the Render Queue adapter only after the user presses the queue button.

**Tech Stack:** CEP 9 / Chromium 61-compatible UMD JavaScript, Adobe ExtendScript ES3 for AE2020, vanilla HTML/CSS, Node.js built-in test runner, and the existing self-contained extension validator.

**Spec:** `docs/superpowers/specs/2026-10-17-ae2020-asset-details-composition-output-design.md`

## Global Constraints

- Target host remains Adobe After Effects 2020, Windows 64-bit, AEFT `[17.0,17.9]`, CSXS `9.0`.
- Continue using CEP + ExtendScript; add no C++ plugin, cloud service, database, or third-party runtime dependency.
- Preserve current asset search, project-item selection, path copy, and existing-folder reveal behavior and contracts.
- Regular footage metadata comes from the AE-exposed source `File`; sequence metadata enumerates only direct files in that source directory matching the same prefix, numeric frame suffix, and extension.
- Sequence aggregation reports matched-frame count, total size, and earliest-to-latest creation time; it never recursively scans directories or the disk.
- Composition details are loaded per composition and recursively expanded only when the user opens a nested-composition node; layer order is preserved.
- Effect data means effects currently applied to layers and readable from AE's Effect Parade, not an inventory of installed plugins, vendors, or versions.
- Clicking an asset/composition result or hierarchy node opens/toggles details only; it never selects an AE project item or layer.
- **加入渲染队列** adds exactly one composition to AE's existing Render Queue for that activation, uses AE defaults, does not render, does not set an output path, does not save the project, and does not alter existing queue items.
- Runtime code must stay ordinary UMD/CommonJS-compatible JavaScript with no native ES modules; all active extension references must remain inside `cep/`.

## Review Focus

- **Sequence boundary and partial metadata:** same-directory pattern matching must exclude unrelated files and show a partial/unreadable state when a matched frame cannot be read. Tested in Task 2 host metadata tests.
- **Missing/unreadable source files:** old paths remain visible, metadata becomes unavailable, and the panel remains recoverable. Tested in Task 2 and Task 5 detail-state tests.
- **Nested/cyclic compositions and unreadable effects:** direct layer order remains stable, nested nodes load lazily, cycles stop at the repeated path, and one bad effect does not discard the rest. Tested in Task 3 host tests and Task 5 tree tests.
- **Footage-node details and response envelopes:** expanding a footage node uses the asset-detail adapter without selecting AE state, and every new host success response uses fixed payload keys. Tested in Tasks 4–5.
- **Stale or invalid Render Queue IDs:** switched projects, deleted items, non-composition IDs, and malformed responses must not enqueue anything. Tested in Task 3 and Task 4.
- **CEP9 regression and transport isolation:** old asset/path workflows, UMD loading, stale async responses, and local resource validation continue to pass. Tested in Task 5 and Task 6.

## File and Module Map

- `cep/core/asset-details.js` — pure validation/display helpers for `AssetDetails` and `SequenceStatistics`.
- `cep/core/composition-tree.js` — pure lazy tree model with ancestry-based cycle protection and visible-node projection.
- `cep/core/asset-search.js` — preserve `filterAssets` and add composition-summary filtering.
- `cep/core/ui-state.js` — derive independent asset and composition result states without calling AE.
- `cep/host/asset-workbench.jsx` — keep the single manifest entry point; add isolated host helpers for file metadata, sequence aggregation, composition inspection, and queue insertion.
- `cep/core/host-contract.js` — validate each new plain-data response independently from the existing asset collection/selection contract.
- `cep/host-api.js` — expose lazy asset-detail, composition-list, composition-detail, and queue methods with ID validation and bounded transport timeouts.
- `cep/index.html` / `cep/styles.css` / `cep/app.js` — add separate result views, detail sections, lazy hierarchy rendering, and queue action while preserving the current asset controls.
- `tests/fixtures/assets.js` / new `tests/fixtures/compositions.js` — stable plain records for core, bridge, and UI tests.
- `tests/core/*`, `tests/host/*`, `tests/cep/*`, `tests/dev/validate-extension.test.js` — test each boundary and packaging reference.
- `scope.md`, `README.md`, `docs/testing/ae2020-manual-checklist.md`, `docs/testing/implementation-decisions.md` — record the approved additive scope and the new Render Queue side effect.

### Task 1: Add Pure Detail Contracts, Formatting, Search, and Tree State

**Files:**
- Create: `cep/core/asset-details.js`
- Create: `cep/core/composition-tree.js`
- Create: `tests/core/asset-details.test.js`
- Create: `tests/core/composition-tree.test.js`
- Create: `tests/fixtures/compositions.js`
- Modify: `cep/core/asset-search.js`
- Modify: `cep/core/ui-state.js`
- Modify: `tests/core/asset-search.test.js`

**Interfaces:**
- `asset-details.js` produces `formatBytes(sizeBytes)`, `formatLocalDate(epochMs)`, `formatAssetDetails(details)`, and `isAssetDetails(value)`. Formatting must preserve exact byte values, expose a readable unit, render local-time creation dates, and distinguish ordinary metadata from sequence aggregate/partial/unreadable states.
- `composition-tree.js` produces `createTreeState(rootCompositionId)`, `mergeCompositionDetails(state, details)`, `toggleNode(state, nodeKey)`, and `visibleNodes(state)`. A node key includes its ancestry path so the same composition can appear in multiple branches; a repeated ID already present in that path becomes a visible non-expandable cycle marker.
- `asset-search.js` keeps `filterAssets(records, query)` unchanged and adds `filterCompositions(summaries, query)` using the same trimmed, case-insensitive item-name matching.
- `ui-state.js` keeps `deriveViewState(records, query)` and adds `deriveCompositionViewState(summaries, query)` with independent counts and empty/no-match states.

- [ ] **Step 1: Write failing pure-function tests**

  Cover exact and readable byte formatting, local date formatting, ordinary-file metadata, sequence aggregate metadata, partial/unreadable status, case-insensitive composition matching, independent empty/no-match counts, lazy tree merge/toggle, preserved layer order, and ancestry-based cycle protection.

- [ ] **Step 2: Run the focused tests and verify they fail**

  Run: `npm.cmd test -- --test-name-pattern="asset detail|composition tree|composition.*search"`

  Expected: FAIL because the new modules and composition-state functions do not exist.

- [ ] **Step 3: Implement the pure modules**

  Keep the modules UMD-compatible and free of DOM, CSInterface, AE objects, filesystem access, or date/time side effects beyond formatting the supplied epoch values. Return new state objects from tree operations so UI state cannot be mutated through shared references.

- [ ] **Step 4: Run the focused tests and verify they pass**

  Run: `npm.cmd test -- --test-name-pattern="asset detail|composition tree|composition.*search"`

  Expected: PASS, with existing asset-search tests still passing.

- [ ] **Step 5: Commit**

  ```powershell
  git add cep/core/asset-details.js cep/core/composition-tree.js cep/core/asset-search.js cep/core/ui-state.js tests/core tests/fixtures/compositions.js
  git commit -m "feat: add pure detail and composition tree models"
  ```

### Task 2: Add Asset Metadata and Direct-Directory Sequence Aggregation in the AE Host

**Files:**
- Modify: `cep/host/asset-workbench.jsx`
- Modify: `tests/host/asset-workbench.test.js`

**Interfaces:**
- Add `ZYGAssetWorkbench.getAssetDetails(projectItemId)` returning `{ok:true, asset:AssetDetails}` or a structured error. It accepts only a positive integer from the current collected project, rejects stale/deleted/non-file items, and leaves `collectAssetRecords()` output unchanged.
- Keep `collectAssetRecords()` and `selectProjectItem()` behavior intact. Share a project-identity cache without allowing a composition collection or detail request to reuse an item from another project.
- For ordinary files, read `File.length` and `File.created.getTime()` into `sizeBytes` and `createdAtEpochMs`; return null plus a precise metadata status when a property is missing or throws.
- For a recognized sequence, parse the AE source file name into prefix/numeric suffix/extension, enumerate only `sourceFile.parent.getFiles()`, include direct `File` entries with the same case-insensitive prefix and extension plus a numeric suffix, and aggregate actual readable files. Return `matchedFrameCount`, `totalSizeBytes`, and earliest/latest creation epochs. Mark the result partial if a matched frame cannot be read and unreadable if the directory cannot be enumerated.
- For a recognized sequence, `matchedFrameCount` counts every matching direct file entry that exists. If any matching entry cannot be read, serialize the aggregate size and date-range fields as `null` with `status:"partial"`; the UI must show the count and an explicit partial/unavailable state rather than presenting incomplete totals as complete. If the directory cannot be enumerated, serialize `matchedFrameCount` and all aggregate fields as `null` with `status:"unreadable"`.
- Use the existing ES3-safe serializer; never serialize `File`, `Folder`, `Date`, or AE native objects directly.

- [ ] **Step 1: Add failing host tests with fake ES3 File/Folder objects**

  Add fixtures for an ordinary file, a complete sequence with unrelated files and subdirectories, a missing source, a throwing metadata property, and a partially unreadable matching frame. Assert the exact plain response fields, aggregate counts/sizes/date range, null aggregate fields plus explicit `partial`/`unreadable` statuses, old-path preservation, and stale/non-file rejection.

- [ ] **Step 2: Run the host metadata tests and verify they fail**

  Run: `npm.cmd test -- --test-name-pattern="asset metadata|sequence|asset details"`

  Expected: FAIL because `getAssetDetails` and metadata helpers are not implemented.

- [ ] **Step 3: Implement the host metadata adapter**

  Add small ES3 helper functions for safe file property reads, epoch conversion, sequence-name parsing, direct-entry matching, aggregation, and structured failure codes. Keep these helpers inside the existing host namespace and do not touch the current collection record shape.

- [ ] **Step 4: Run the host metadata tests and the existing host suite**

  Run: `npm.cmd test -- --test-name-pattern="asset metadata|sequence|asset details|collects stable|missingFootagePath|path access"`

  Expected: PASS for new and existing host behavior.

- [ ] **Step 5: Commit**

  ```powershell
  git add cep/host/asset-workbench.jsx tests/host/asset-workbench.test.js
  git commit -m "feat: expose asset metadata and sequence statistics"
  ```

### Task 3: Add Composition Inspection and Render Queue Host Actions

**Files:**
- Modify: `cep/host/asset-workbench.jsx`
- Modify: `tests/host/asset-workbench.test.js`

**Interfaces:**
- Add `ZYGAssetWorkbench.collectCompositionSummaries()` returning `CompositionSummary[]` for current-project `CompItem`s only, with stable IDs and `itemType:"composition"`.
- Add `ZYGAssetWorkbench.getCompositionDetails(projectItemId)` returning direct `CompositionDetails` for a collected composition. Include width, height, duration, frame rate, layer count, layer order, source IDs/names/types, and readable applied effects (`name`, `matchName`, `status`). Do not recursively traverse here; the CEP tree adapter requests nested compositions lazily.
- Add `ZYGAssetWorkbench.enqueueComposition(projectItemId)` that validates current-project identity and a collected `CompItem`, calls `app.project.renderQueue.items.add(comp)` exactly once, and returns the created queue-item index without calling render, changing output modules, saving, or touching existing queue items.
- Serialize successful host responses with fixed envelopes: `collectCompositionSummaries()` returns `{ok:true, compositions:CompositionSummary[]}`, `getCompositionDetails(id)` returns `{ok:true, composition:CompositionDetails}`, and `enqueueComposition(id)` returns `{ok:true, queueItemIndex:number}`. All failures use the existing `{ok:false, code:string, message:string}` shape.
- Classify direct layer sources as `footage`, `composition`, `solid`, `text`, `shape`, `other`, or `unavailable`. Catch per-layer source/effect failures and continue. Treat `ADBE Effect Parade` as applied-effect data only.

- [ ] **Step 1: Add failing composition host tests**

  Build fake `CompItem`, layer, effect-parade, project, and Render Queue objects. Assert composition summaries use the `compositions` envelope and exclude footage, direct layers preserve order, nested comp references are returned without recursion, solids/text/shapes are typed, one unreadable effect becomes `status:"unavailable"` without dropping other effects, stale/non-composition IDs fail, and one enqueue call returns the `queueItemIndex` envelope, adds one item without calling `render()`, and does not change an existing entry.

- [ ] **Step 2: Run composition host tests and verify they fail**

  Run: `npm.cmd test -- --test-name-pattern="composition host|composition detail|render queue|enqueue"`

  Expected: FAIL because the new host functions are not implemented.

- [ ] **Step 3: Implement composition host adapters**

  Add cache-aware project validation, ES3-safe layer/source/effect normalization, composition summary collection, direct-detail serialization, and the single queue insertion action. Use the same stale-project rules as existing selection; never set `selected` on any item or layer.

- [ ] **Step 4: Run composition and regression host tests**

  Run: `npm.cmd test -- --test-name-pattern="composition host|composition detail|render queue|enqueue|collects stable|selection"`

  Expected: PASS, including unchanged MVP selection behavior.

- [ ] **Step 5: Commit**

  ```powershell
  git add cep/host/asset-workbench.jsx tests/host/asset-workbench.test.js
  git commit -m "feat: inspect compositions and enqueue render items"
  ```

### Task 4: Extend Host Contracts and CEP API Adapters

**Files:**
- Modify: `cep/core/host-contract.js`
- Modify: `cep/host-api.js`
- Modify: `tests/host/asset-contract.test.js`
- Modify: `tests/cep/host-api.test.js`

**Interfaces:**
- Preserve `parseHostResponse(raw, 'collect')` and `parseHostResponse(raw, 'select')` exactly; add operation-specific validation for `'asset-details'`, `'compositions'`, `'composition-details'`, and `'enqueue'`.
- Validate the fixed success payload keys: `asset` for `'asset-details'`, `compositions` for `'compositions'`, `composition` for `'composition-details'`, and numeric `queueItemIndex` for `'enqueue'`; continue to accept the structured error envelope for each operation.
- Validate `AssetDetails` fields, `SequenceStatistics` invariants, `CompositionSummary` IDs/types, `CompositionDetails` numeric summary, layer/source/effect shapes, and structured errors without accepting AE native values or duplicate IDs.
- Extend `createHostApi(options)` with `getAssetDetails(projectItemId)`, `loadCompositions()`, `getCompositionDetails(projectItemId)`, and `enqueueComposition(projectItemId)`. Each method must reject or return the existing structured error style for invalid IDs, quote no user input into scripts, and use the configured timeout.
- Use exact host scripts: `ZYGAssetWorkbench.getAssetDetails(<id>)`, `ZYGAssetWorkbench.collectCompositionSummaries()`, `ZYGAssetWorkbench.getCompositionDetails(<id>)`, and `ZYGAssetWorkbench.enqueueComposition(<id>)`.

- [ ] **Step 1: Add failing parser and bridge tests**

  Cover valid ordinary/sequence details, partial and unreadable metadata, malformed nested composition payloads, duplicate IDs, invalid IDs and script-injection strings, structured host errors, exact script names, timeout propagation, and unchanged legacy collection/selection parsing.

- [ ] **Step 2: Run the bridge tests and verify they fail**

  Run: `npm.cmd test -- --test-name-pattern="host contract|host api|asset details|composition details|enqueue"`

  Expected: FAIL because new operations are not recognized.

- [ ] **Step 3: Implement contract validation and API methods**

  Keep validators local to the contract module and make each operation reject malformed payloads before UI code sees them. Reuse the existing positive-integer ID validation and timeout/error handling.

- [ ] **Step 4: Run bridge and legacy tests**

  Run: `npm.cmd test -- --test-name-pattern="host contract|host api|asset record|selection|path"`

  Expected: PASS for new and old transport behavior.

- [ ] **Step 5: Commit**

  ```powershell
  git add cep/core/host-contract.js cep/host-api.js tests/host/asset-contract.test.js tests/cep/host-api.test.js
  git commit -m "feat: expose validated detail and composition bridge APIs"
  ```

### Task 5: Add Asset Detail, Composition Tabs, Lazy Hierarchy, and Queue UI

**Files:**
- Modify: `cep/index.html`
- Modify: `cep/styles.css`
- Modify: `cep/app.js`
- Modify: `cep/core/ui-state.js`
- Modify: `tests/cep/ui-state.test.js`
- Create: `tests/cep/details-ui.test.js`

**Interfaces:**
- Keep `createApp(document, hostApi, pathActions)` and all existing asset actions. Add only the new host methods as optional collaborators in the same host API object.
- Add asset/composition view controls with stable IDs `asset-tab`, `composition-tab`, `asset-results`, `composition-results`, `asset-detail`, `composition-detail`, `composition-tree`, and `queue-composition` so DOM tests can target behavior without CSS selectors that depend on layout.
- Refresh starts the asset and composition loads independently, applies the current trimmed query to the active result view, and uses separate generation guards so late responses cannot overwrite newer state. A composition-list failure must not clear or disable the existing asset results/actions, and an asset-list failure must not hide a successfully loaded composition list.
- Clicking an asset result requests `getAssetDetails(id)` and renders full path, exact/readable size, creation time or sequence range/count, and metadata status; existing select/copy/reveal buttons remain separate and functional.
- Clicking a composition result requests `getCompositionDetails(id)`, renders **加入渲染队列** before summary/hierarchy, and initializes a tree whose root is expanded. Clicking the queue button calls `enqueueComposition(id)` once and displays a recoverable success/error message.
- Expanding a nested-composition node calls `getCompositionDetails(id)` only when needed, merges its direct layers into the pure tree model, and renders nested assets/effects. Expanding a footage node calls `getAssetDetails(sourceItemId)` and renders the same path/metadata view as an asset result; it never calls `selectItem`. Cycle markers are visible but not expandable. For `metadataStatus:"partial"`, the UI shows the matched-frame count and explicit partial/unavailable status while not presenting null aggregate values as complete totals. No detail click calls `selectItem`.

- [ ] **Step 1: Add failing UI/state tests**

  Extend the DOM fixture to cover tabs and detail containers. Test asset-detail loading/success/error, sequence aggregate and partial-status rendering, composition summary loading, fixed success-envelope parsing, independent asset/composition load failures, queue-button order and one-call behavior, lazy nested expansion, footage-node metadata expansion through `getAssetDetails`, cycle marker behavior, effect rendering, no-AE-selection side effects, stale response suppression, and preservation of existing copy/reveal/selection tests.

- [ ] **Step 2: Run UI tests and verify they fail**

  Run: `npm.cmd test -- --test-name-pattern="detail|composition|queue|asset.*action|stale.*response"`

  Expected: FAIL because the new DOM elements, UI methods, and rendering branches do not exist.

- [ ] **Step 3: Implement markup, styling, state orchestration, and rendering**

  Load new UMD core scripts before `host-api.js`/`app.js`. Keep all user data inserted with `textContent`; use buttons and accessible labels for result/detail actions; retain the existing long-path table behavior. The tree renderer must use the model from Task 1 rather than calling AE directly.

- [ ] **Step 4: Run UI and full automated tests**

  Run: `npm.cmd test`

  Expected: PASS for the complete suite, with no regression in the previously verified MVP tests.

- [ ] **Step 5: Commit**

  ```powershell
  git add cep/index.html cep/styles.css cep/app.js cep/core/ui-state.js tests/cep/ui-state.test.js tests/cep/details-ui.test.js
  git commit -m "feat: add asset details and composition hierarchy UI"
  ```

### Task 6: Update Packaging Validation, Scope Documentation, and Manual Acceptance

**Files:**
- Modify: `scripts/validate-extension.js`
- Modify: `tests/dev/validate-extension.test.js`
- Modify: `scope.md`
- Modify: `README.md`
- Modify: `docs/testing/ae2020-manual-checklist.md`
- Modify: `docs/testing/implementation-decisions.md`

**Interfaces:**
- The validator must require every new active `cep/core` script and continue to enforce AEFT `[17.0,17.9]`, CSXS `9.0`, no module scripts, no outside-`cep` references, and no links/build directories.
- Documentation must say the MVP baseline is preserved, sequence aggregation is limited to the matching direct source directory, effects are applied-effect instances, hierarchy clicks do not select AE, and queue insertion is the only new project-side mutation.
- The manual checklist must add observations for asset metadata, complete sequence totals/date ranges, composition tabs, nested expansion/cycle handling, effect entries, queue insertion without immediate render, and unchanged existing queue/output settings. Replace blanket “panel never writes the project” language with “no mutation except explicit queue insertion.”

- [ ] **Step 1: Add failing validator/documentation checks**

  Update static validation expectations for each new script and add text assertions for the approved boundaries and explicit Render Queue exception.

- [ ] **Step 2: Run validator-focused tests and verify they fail**

  Run: `npm.cmd test -- --test-name-pattern="validate extension|scope|manual|documentation"`

  Expected: FAIL until the validator and documentation reflect the new files and behavior.

- [ ] **Step 3: Implement packaging/documentation updates**

  Keep all docs explicit about the gap between Node/validator evidence and live AE2020 acceptance. Do not add install scripts, registry writes, debug-setting changes, or automatic deployment flows.

- [ ] **Step 4: Run all checks**

  Run: `npm.cmd test` and `npm.cmd run validate`

  Expected: full Node suite passes and the validator reports all local resources under `cep/` with the existing AE/CEP targets.

- [ ] **Step 5: Commit**

  ```powershell
  git add scripts/validate-extension.js tests/dev/validate-extension.test.js scope.md README.md docs/testing
  git commit -m "docs: define asset details and composition output acceptance"
  ```

### Task 7: Install the Updated Extension and Record Verification Evidence

**Files:**
- Modify only the installed copy: `%APPDATA%\Adobe\CEP\extensions\com.zyg.asset-workbench\`
- Update: `docs/testing/ae2020-manual-checklist.md` only with directly observed results

**Interfaces:**
- Copy the validated `cep/` tree as ordinary files to the existing CEP extension directory; do not alter the repository's main worktree, registry, CEP debug settings, AE project, media, or output paths.
- Confirm the installed `CSXS\manifest.xml` and all new runtime files match the validated worktree copy before asking the user to test in AE2020.

- [ ] **Step 1: Verify repository is clean and checks pass**

  Run: `git status --short --branch`, `npm.cmd test`, and `npm.cmd run validate`. Expected: clean branch and passing outputs.

- [ ] **Step 2: Copy the extension tree**

  Use a file-copy operation that preserves ordinary files and directories and targets only `%APPDATA%\Adobe\CEP\extensions\com.zyg.asset-workbench`.

- [ ] **Step 3: Verify the installed tree**

  Compare the installed manifest and runtime file list with `cep/`; do not infer AE behavior from file presence.

- [ ] **Step 4: Run the live AE2020 checklist with a disposable project**

  Record only directly observed results. Test at least one ordinary file, one complete sequence, one partially unreadable/missing source, one composition with a nested precomp, one applied effect, a cyclic/reference-safe case if available, and the queue action. Verify no immediate render, no output-path change, no AE selection from detail clicks, and no media mutation.

- [ ] **Step 5: Commit only evidence changes**

  ```powershell
  git add docs/testing/ae2020-manual-checklist.md
  git commit -m "test: record AE2020 details and render queue acceptance"
  ```

## Execution Order

Run Tasks 1–2 first because the pure detail contract and asset metadata adapter define the shared data used by the UI. Run Task 3 next for composition host behavior, then Task 4 to expose both new host surfaces safely. Task 5 depends on all preceding interfaces. Task 6 updates the packaging/documentation contract after the runtime files exist. Task 7 is last and remains separate from automated success because live AE2020/CEP acceptance is an external observation.

## Self-Review

- **Spec coverage:** Asset metadata, partial sequence presentation, and footage-node metadata expansion map to Tasks 1–2 and 5; composition summaries/details/effects/cycle-safe lazy expansion map to Tasks 1, 3, and 5; fixed host response envelopes map to Tasks 3–4; queue semantics map to Tasks 3–5; module boundaries and error behavior map to Tasks 2–6; acceptance evidence maps to Task 7.
- **Step scan:** Tasks 1–6 have a failing test, minimal implementation, passing verification, and commit; Task 7 verifies deployment and live host behavior separately because those observations cannot be reduced to unit tests. Host actions, bridge validation, UI state, and packaging have separate boundaries.
- **Type consistency:** `AssetDetails`, `SequenceStatistics`, `CompositionSummary`, `CompositionDetails`, `CompositionLayer`, and `AppliedEffect` are named in Task 1 and consumed by Tasks 2–5; bridge operation names and success envelope keys are fixed in Tasks 3–4 and used by Task 5.
- **Review focus:** Each listed failure mode has a named test owner in Tasks 2–5; packaging/CEP regressions have explicit Task 6 tests.
- **Proportion:** The plan records file boundaries, contracts, tests, and verification commands while leaving implementation bodies to the executor.
