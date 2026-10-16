# AE2020 Asset Workbench MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows + After Effects 2020 CEP panel that searches file-backed assets in the current project and exposes their original paths with select, copy, and reveal actions.

**Architecture:** Keep the pure search and path formatting logic in browser-side JavaScript, the AE project inspection and item selection in one ExtendScript host module, and the UI orchestration in a thin CEP adapter. The modules communicate with JSON records and action results; the UI never receives AE native objects and the host never renders DOM.

**Tech Stack:** CEP HTML panel, vanilla JavaScript/CSS, Adobe ExtendScript (`.jsx`), Node.js built-in test runner, GitHub-hosted source.

**Spec:** `scope.md`

## Global Constraints

- Target host is **Adobe After Effects 2020, Windows 64-bit**.
- Use **CEP + ExtendScript**; do not introduce a C++ native plugin.
- Search only file-backed assets already imported into the current AE project; do not scan the disk or build a persistent index.
- Include image-sequence assets using the first source file or source folder path exposed by AE.
- MVP actions are select the AE project item, copy the full path, and open the containing folder.
- Panel operations must not modify the AE project, media files, or folders.
- Do not add cloud services, databases, permission elevation, install/update flows, or third-party runtime dependencies.

## Review Focus

- No project is open: the host call returns a structured error and the panel shows a recoverable empty state; test in the host-response adapter task.
- Missing source path: the record keeps the original path with `pathStatus: "missing"`, and reveal is disabled; test in the path adapter and UI task.
- Empty, mixed-case, and whitespace-only queries: empty means all supported assets, matching is case-insensitive, and whitespace is trimmed; test in the search task.
- Unsupported project items (compositions, solids, placeholders): they are filtered from searchable file records without throwing; test in the host normalization task.
- Long Windows paths and characters requiring URI escaping: copying preserves the exact path and reveal builds a valid file URL; test in the path-actions task.

### Task 1: Establish the CEP extension skeleton and test harness

**Files:**
- Create: `package.json`
- Create: `cep/CSXS/manifest.xml`
- Create: `cep/index.html`
- Create: `cep/styles.css`
- Create: `tests/fixtures/assets.js`
- Create: `tests/smoke.test.js`
- Create: `README.md`

**Interfaces:**
- Produces the extension root `cep/` that AE2020 can load and the `npm test` command used by later tasks.
- Defines `AssetRecord` fixture fields used by core and adapter tests: `projectItemId`, `itemName`, `sourceName`, `absolutePath`, `sourceType`, `pathStatus`.

- [ ] **Step 1: Write the failing smoke test**

  Add `tests/smoke.test.js` with a test that imports the fixture and asserts the six required `AssetRecord` keys exist.

- [ ] **Step 2: Run the test to verify it fails**

  Run: `npm test -- --test-name-pattern="asset record fixture"`

  Expected: FAIL because the test harness, fixture, and package script do not exist.

- [ ] **Step 3: Add the minimal project skeleton**

  Configure `package.json` with the Node built-in test runner (`node --test`), create the fixture, add the CEP panel manifest targeting AE `17.0`, and create a minimal HTML shell with a root element and script/style references. Keep `CSInterface.js` as an explicit vendor dependency to be added in Task 4 from the official CEP SDK.

- [ ] **Step 4: Run the smoke test to verify it passes**

  Run: `npm test -- --test-name-pattern="asset record fixture"`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add package.json cep/CSXS/manifest.xml cep/index.html cep/styles.css tests/fixtures/assets.js tests/smoke.test.js README.md
  git commit -m "chore: scaffold AE2020 CEP extension"
  ```

### Task 2: Implement pure asset filtering and query normalization

**Files:**
- Create: `src/core/asset-search.js`
- Create: `tests/core/asset-search.test.js`

**Interfaces:**
- Consumes: `AssetRecord[]` from Task 1.
- Produces: `filterAssets(records: AssetRecord[], query: string): AssetRecord[]`, preserving input order and returning the original record objects.

- [ ] **Step 1: Write the failing tests**

  Cover `filterAssets` with these assertions:

  - `"  tree  "` matches `itemName: "Tree_01"` and `sourceName: "tree.png"`.
  - Matching is case-insensitive and checks either name.
  - An empty or whitespace-only query returns every supported record in original order.
  - A query with no match returns `[]`.
  - Records with `pathStatus: "not_applicable"` are excluded from the result.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npm test -- tests/core/asset-search.test.js`

  Expected: FAIL because `src/core/asset-search.js` is missing.

- [ ] **Step 3: Implement `filterAssets`**

  Trim the query, compare lowercased `itemName` and `sourceName`, skip `not_applicable` records, and do not sort or mutate the input.

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `npm test -- tests/core/asset-search.test.js`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/core/asset-search.js tests/core/asset-search.test.js
  git commit -m "feat: add asset query filtering"
  ```

### Task 3: Define the host JSON contract and normalize AE sources

**Files:**
- Create: `host/asset-workbench.jsx`
- Create: `src/core/host-contract.js`
- Create: `tests/host/asset-contract.test.js`
- Modify: `tests/fixtures/assets.js`

**Interfaces:**
- Produces ExtendScript globals:
  - `collectAssetRecords(): string`, returning `{ ok: true, assets: AssetRecord[] }` or `{ ok: false, code: string, message: string }` as JSON.
  - `selectProjectItem(projectItemId: number): string`, returning `{ ok: true }` or a structured error.
- Produces `parseHostResponse(raw: string): HostResponse`, where `HostResponse` is `{ ok: true, assets: AssetRecord[] } | { ok: false, code: string, message: string }`; the browser-side parser is used by the CEP bridge to validate both host payload shapes.
- Produces records with `pathStatus` values `exists`, `missing`, `unreadable`, or `not_applicable`.
- Consumes no browser or DOM APIs.

- [ ] **Step 1: Write contract tests**

  Add fixture-level tests for `parseHostResponse`: parse a successful payload and a `{ code: "NO_PROJECT" }` error payload, reject malformed JSON and missing fields, require stable numeric `projectItemId`, and assert that missing paths retain `absolutePath` while `pathStatus` is `missing`.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npm test -- tests/host/asset-contract.test.js`

  Expected: FAIL because `src/core/host-contract.js` is missing.

- [ ] **Step 3: Implement the ExtendScript host module**

  Iterate `app.project.items` only when a project is open. Include file-backed `FootageItem` records, use the first file/folder path exposed by AE for sequences, classify non-file sources as `not_applicable`, and check existence without changing files. Catch host exceptions and return JSON errors. `selectProjectItem` must validate the numeric ID, select the item in the project, and return a result without changing project contents.

- [ ] **Step 4: Run contract tests and static syntax checks**

  Run: `npm test -- tests/host/asset-contract.test.js` and verify the JSX file has balanced braces and no browser-only globals.

  Expected: PASS for the JSON contract tests; the JSX syntax check reports no parse errors.

- [ ] **Step 5: Commit**

  ```bash
  git add host/asset-workbench.jsx src/core/host-contract.js tests/host/asset-contract.test.js tests/fixtures/assets.js
  git commit -m "feat: expose AE asset records through host contract"
  ```

### Task 4: Add the CEP bridge and local path actions

**Files:**
- Add: `cep/vendor/CSInterface.js` from the official CEP SDK matching the CEP runtime used by AE2020.
- Create: `cep/host-api.js`
- Create: `cep/path-actions.js`
- Create: `tests/cep/path-actions.test.js`
- Modify: `cep/index.html`

**Interfaces:**
- `hostApi.loadAssets(): Promise<AssetRecord[]>` invokes `collectAssetRecords` through `CSInterface.evalScript` and maps host errors to `{ code, message }`.
- `hostApi.selectItem(projectItemId: number): Promise<{ ok: boolean, code?: string, message?: string }>` invokes `selectProjectItem`.
- `pathActions.copy(path: string): Promise<void>` copies the exact path text.
- `pathActions.toFileUrl(path: string): string` converts a Windows folder path to an escaped `file:///` URL.
- `pathActions.reveal(path: string, pathStatus: string): void` opens the containing folder only for `pathStatus: "exists"`.

- [ ] **Step 1: Write failing path-action tests**

  Test exact path preservation for long paths and quotes, trimming only for the containing-folder calculation, rejecting empty paths, and converting Windows folder paths to escaped `file:///` URLs.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npm test -- tests/cep/path-actions.test.js`

  Expected: FAIL because the path action module is missing.

- [ ] **Step 3: Implement the bridge and path actions**

  Keep all `CSInterface` calls in `host-api.js`; keep clipboard and `openURL` behavior in `path-actions.js`. Do not call ExtendScript from UI rendering code. Disable reveal for missing/unreadable paths and surface structured errors to the caller.

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `npm test -- tests/cep/path-actions.test.js`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add cep/vendor/CSInterface.js cep/host-api.js cep/path-actions.js tests/cep/path-actions.test.js cep/index.html
  git commit -m "feat: bridge AE host and local path actions"
  ```

### Task 5: Build the independent panel UI

**Files:**
- Create: `cep/app.js`
- Create: `src/core/ui-state.js`
- Modify: `cep/index.html`
- Modify: `cep/styles.css`
- Create: `tests/cep/ui-state.test.js`

**Interfaces:**
- Consumes `filterAssets` from Task 2, `hostApi` from Task 4, and `pathActions` from Task 4.
- Produces `deriveViewState(records: AssetRecord[], query: string): ViewState` in `src/core/ui-state.js`, plus DOM event adapters in `cep/app.js`. Rendering functions consume plain records and never receive AE objects.

- [ ] **Step 1: Write failing UI-state tests**

  Test `deriveViewState` for loaded count, empty query showing all records, no match preserving the query, and a missing path disabling reveal; test the result-selection adapter calls `hostApi.selectItem` with its `projectItemId`.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npm test -- tests/cep/ui-state.test.js`

  Expected: FAIL because `src/core/ui-state.js` and `cep/app.js` are missing.

- [ ] **Step 3: Implement the panel UI**

  Add one search input, search/clear controls, a result table with full-path copy, select, and reveal actions, plus explicit empty/error states. Load assets on panel start and after a recoverable host error. Keep DOM event handlers as adapters over the module interfaces.

- [ ] **Step 4: Run tests and perform a browser-level static check**

  Run: `npm test -- tests/cep/ui-state.test.js` and open `cep/index.html` in a normal browser for markup/CSS inspection only.

  Expected: PASS; all controls have labels and the result path remains selectable/copyable at long lengths.

- [ ] **Step 5: Commit**

  ```bash
  git add cep/app.js src/core/ui-state.js cep/index.html cep/styles.css tests/cep/ui-state.test.js
  git commit -m "feat: add asset search workbench panel"
  ```

### Task 6: Package, document, and verify in AE2020

**Files:**
- Modify: `README.md`
- Create: `docs/testing/ae2020-manual-checklist.md`
- Create: `docs/testing/implementation-decisions.md`
- Create: `scripts/validate-extension.js`
- Create: `scripts/validate-extension.ps1` (optional thin wrapper)

**Interfaces:**
- Consumes the complete `cep/` extension and `host/asset-workbench.jsx` from Tasks 1–5.
- Produces a repeatable validation command and an AE2020 manual acceptance checklist; it does not add runtime behavior.

- [ ] **Step 1: Write validation checks**

  Add checks for required manifest fields, the host JSX entry point, `index.html` script references, and the absence of build output that would be required by a different AE version.

- [ ] **Step 2: Run validation before documentation changes**

  Run: `node scripts/validate-extension.js` (or `npm.cmd run validate`).

  Expected: FAIL until all required extension files and references exist.

- [ ] **Step 3: Add manual AE2020 acceptance steps**

  Document loading the panel, a project with at least three file assets, mixed-case search, sequence source, missing path, project-item selection, copy, reveal, and no-project behavior. Include the exact expected result for each step.

- [ ] **Step 4: Run all automated checks**

  Run: `npm.cmd test` and `npm.cmd run validate`.

  Expected: all tests pass and validation reports no missing files or references.

- [ ] **Step 5: Complete the manual AE2020 check and commit**

  Run the checklist in AE2020 on Windows, record pass/fail evidence in the checklist, then commit:

  ```bash
  git add README.md docs/testing/ae2020-manual-checklist.md docs/testing/implementation-decisions.md scripts/validate-extension.js scripts/validate-extension.ps1
  git commit -m "docs: add AE2020 validation checklist"
  ```

## Self-Review

- Spec coverage: the host task covers current-project enumeration, sequence paths, no-project errors, and project-item selection; the core task covers query behavior; the CEP task covers copy/reveal; the UI task covers all states; the final task covers AE2020 acceptance and non-modification checks.
- Interface consistency: `AssetRecord` is defined once in the fixture contract, `filterAssets` consumes it, `hostApi` returns it, and UI actions use only `projectItemId` plus plain path fields.
- Review focus coverage: each five-item failure-mode line has a named test in Tasks 2–5 or a manual assertion in Task 6.
- Proportion: the plan keeps the runtime dependency surface to CEP + ExtendScript and uses pure Node tests for deterministic behavior; no disk index, persistence layer, or unrelated organizer features are planned.

