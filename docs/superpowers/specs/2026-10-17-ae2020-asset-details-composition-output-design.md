# AE2020 Asset Details and Composition Output Design

## Status

Approved for implementation on 2026-10-17. This is an additive feature design based on the user-verified MVP baseline `mvp-verified-2026-10-17` (commit `67c77b8`). The MVP remains preserved as that Git tag; this proposal does not replace its scope or implementation.

## Intent

Extend the AE2020 CEP workbench so a user can inspect source-file metadata for project footage and inspect compositions through a manually expanded hierarchy. From a composition detail view, the user can add that composition to After Effects' Render Queue.

The existing asset search, path display, project-item selection, path copying, and folder reveal behavior remain available and unchanged.

## User-Confirmed Behavior

- Selecting an asset result opens details that include its complete source path, file size, and filesystem creation time. For a recognized image sequence, size and creation time summarize the matching frame files in that sequence.
- Selecting a composition shows an **加入渲染队列** button before its other details.
- Activating that button adds the selected composition to AE's Render Queue. It does not start rendering and does not set a custom output location.
- Composition contents include nested compositions. The UI presents a hierarchy the user can expand or collapse.
- Clicking a hierarchy node only expands or collapses details. It does not select a project item or layer in AE.

## Proposed Interaction

Keep the search input and current asset workflow. Add separate **素材** and **合成** result views that share the query text but keep their data types and actions separate. The asset view retains its present row actions. Selecting an asset name opens an asset detail section below the results. Selecting a composition opens a composition detail section below the results; its first control is **加入渲染队列**, followed by a compact composition summary and its hierarchy.

The composition tree is loaded one composition at a time. Expanding a precomposition layer requests that composition's direct layer data; collapsing it does not discard cached data. Footage nodes can expand to the same source metadata used by the asset detail view. Effect entries appear beneath the layer where AE reports them. A recursion-path guard prevents repeated composition IDs from recursing indefinitely; repeated references outside the active path remain visible as separate tree branches.

The chosen layout is a builder call: a single CEP panel, separate asset/composition result views, and the selected item's details beneath the results. No new browser mockup is required for the functional scope.

## Asset Details

For a file-backed `FootageItem`, request metadata from the source `File` exposed by AE. Return the unchanged absolute path, byte count, creation time, source type, and path/metadata status. Display byte count both as an exact value and a readable unit, and display the creation time in the Windows local timezone.

For ordinary file footage, the feature reads metadata from the source file exposed by AE. For an AE-recognized image sequence, use the AE-exposed source file to identify the source directory, filename prefix, numeric frame suffix, and extension; enumerate only direct members of that same directory and match the same prefix, a numeric suffix, and the same extension (case-insensitive on Windows). Count and sum the matching frame files that actually exist. Do not infer missing frames, inspect file contents, or recurse into child directories. This is the only directory enumeration added by this proposal; it is not a general directory or disk scan.

For a sequence, show the aggregate byte size and the earliest-to-latest filesystem creation time across matched frames. Display the number of matched frame files so the basis of the aggregate is clear. If a matching frame cannot be read, retain the matched frame count, mark the sequence metadata partial, and avoid presenting an incomplete size or time range as complete. If the source directory cannot be enumerated, report metadata as unreadable. Missing or unreadable footage keeps its original path and shows the appropriate metadata status without throwing an error into the panel.

Proposed contract:

```text
AssetDetails {
  projectItemId: number
  itemName: string
  sourceName: string
  absolutePath: string | null
  sourceType: string
  pathStatus: "exists" | "missing" | "unreadable" | "not_applicable"
  sizeBytes: number | null
  createdAtEpochMs: number | null
  sequenceStatistics: SequenceStatistics | null
  metadataStatus: "available" | "partial" | "missing" | "unreadable" | "not_applicable"
}

SequenceStatistics {
  matchedFrameCount: number | null
  totalSizeBytes: number | null
  earliestCreatedAtEpochMs: number | null
  latestCreatedAtEpochMs: number | null
  status: "available" | "partial" | "missing" | "unreadable"
}
```

For sequence assets, `sizeBytes` and `createdAtEpochMs` are null; the aggregate values are returned under `sequenceStatistics`. For ordinary file assets, `sequenceStatistics` is null.

## Composition Details and Hierarchy

Add a composition summary type separate from `AssetRecord`, so compositions do not enter the footage search or path actions:

```text
CompositionSummary {
  projectItemId: number
  itemName: string
  itemType: "composition"
}

CompositionDetails {
  projectItemId: number
  itemName: string
  width: number
  height: number
  durationSeconds: number
  frameRate: number
  layerCount: number
  layers: CompositionLayer[]
}

CompositionLayer {
  layerIndex: number
  layerName: string
  sourceItemId: number | null
  sourceItemName: string | null
  sourceType: "footage" | "composition" | "solid" | "text" | "shape" | "other" | "unavailable"
  effects: AppliedEffect[]
}

AppliedEffect {
  name: string | null
  matchName: string | null
  status: "available" | "unavailable"
}
```

Each composition response describes only that composition's direct layers. The UI recursively requests nested composition details as the user expands those nodes. Layers remain in AE layer order. Footage details are obtained through the asset-details adapter; solids, text, shapes, and other non-file layers remain visible as typed hierarchy entries without fabricated file paths.

The effect list represents effects currently applied to each layer and readable from AE's Effect Parade. It is not a catalog of installed plugins and does not promise vendor, version, or availability information. If a third-party or missing effect cannot be read, show an unavailable state for that entry while retaining the layer and the rest of the composition details.

## Render Queue Action

The host action accepts a current-project `CompItem` ID, validates it against the current project, and adds one Render Queue item using AE's active/default render settings and output-module defaults. It does not call `renderQueue.render()`, change templates or output paths, save the project, remove or modify existing queue items, or alter composition/layer/media content. Each deliberate button activation adds one queue item; AE may therefore contain multiple queue entries for the same composition.

Show success or a recoverable error in the panel. A stale project or non-composition ID must not enqueue an item. The queue addition is the only new project-side effect in this proposal and is explicitly requested by the user.

## Module Boundaries

- **Existing asset search and path actions:** Preserve current contracts and behavior.
- **Asset metadata adapter:** Reads source-file metadata by project item ID; does not scan files or render.
- **Composition catalog/detail adapter:** Lists current-project `CompItem` summaries and returns one composition's direct layer/effect records; does not render or mutate project content.
- **Composition tree UI:** Owns expansion state and requests details for the expanded composition; it does not call AE APIs directly.
- **Render Queue action adapter:** Validates a composition ID and performs only the explicit add-to-queue action.
- **Presentation layer:** Coordinates typed adapters and renders plain data; it does not hold AE native objects.

All host responses use plain serializable values. Existing asset APIs remain compatible; composition and asset details use separate functions and data types.

## Non-Goals and Guardrails

- No disk-wide scan, recursive or arbitrary directory scan, persistent index, or sequence scan outside the single source directory and filename pattern described above.
- No immediate render, batch render, custom output path, overwrite prompt, or output-file creation initiated by this feature.
- No discovery of every installed plugin, plugin installation, vendor/version audit, or plugin management.
- No automatic AE selection when clicking results or hierarchy nodes.
- No project save, layer/composition editing, footage relinking, file/folder mutation, or changes to existing render queue entries.
- No C++ plugin, cloud service, database, new runtime dependency, or AE-version expansion beyond the MVP target.

## Error and Edge Behavior

- No open project: show the existing recoverable host error.
- No matching compositions: show an explicit empty result state.
- Project changes after listing: reject stale IDs and ask the user to refresh.
- Missing/unreadable source file: retain path/status and show unavailable metadata.
- Invalid, inaccessible, or non-composition item passed to the queue action: do not modify the queue and show a recoverable error.
- Repeated/cyclic nested composition reference: show the node but stop expanding the repeated path.
- Unreadable effect property: show that effect as unavailable; keep all other entries.

## Acceptance Criteria

1. Existing MVP tests and actions continue to pass without behavioral regressions.
2. Selecting a file-backed asset displays its full original path, exact and readable byte size, creation time, and status.
3. Missing/unreadable paths do not crash the panel; image-sequence details show the matched-frame count, aggregate size, and earliest-to-latest creation-time range, with partial/unreadable status when those aggregates cannot be completed.
4. Compositions can be found separately from footage records without treating a composition as a file asset.
5. Selecting a composition shows **加入渲染队列** before the summary and hierarchy.
6. The composition hierarchy preserves layer order, lists direct layer sources and applied effects, and reveals nested compositions only when expanded.
7. Expanding/collapsing hierarchy nodes never changes AE's selected project item or layer.
8. Activating the queue button adds exactly one queue item for that activation, leaves AE in a non-rendering state, and leaves all existing queue items and custom paths untouched.
9. No action scans the disk, modifies media, writes a custom output path, or saves the AE project.
10. Each new adapter/module can be tested independently with plain records and a mocked host boundary.

## Open Items for Builder Review

The reviewer should identify any remaining decisions that would materially change the implementation plan. Builder-level choices such as exact CSS, byte-unit formatting, status wording, and whether the selected detail section remains open after refresh may be settled during implementation without changing this design.
