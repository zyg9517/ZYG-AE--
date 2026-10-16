/* AE 2020 / ExtendScript ES3. Only this namespace is exposed to CEP. */
var ZYGAssetWorkbench = (function () {
    var collectedProject = null;
    var collectedItems = {};

    // The response contains only plain objects, arrays, strings, numbers,
    // booleans and null. Fresh ExtendScript hosts need not provide JSON.
    function serialize(value) {
        var parts = [];
        var key;
        var i;
        if (value === null) { return "null"; }
        if (typeof value === "string") {
            return '"' + value.replace(/["\\\x00-\x1f\u2028\u2029]/g, function (character) {
                if (character === '"') { return '\\"'; }
                if (character === '\\') { return '\\\\'; }
                return '\\u' + ('0000' + character.charCodeAt(0).toString(16)).slice(-4);
            }) + '"';
        }
        if (typeof value === "number") { return isFinite(value) ? String(value) : "null"; }
        if (typeof value === "boolean") { return String(value); }
        if (value instanceof Array) {
            for (i = 0; i < value.length; i += 1) { parts.push(serialize(value[i])); }
            return '[' + parts.join(',') + ']';
        }
        for (key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                parts.push(serialize(key) + ':' + serialize(value[key]));
            }
        }
        return '{' + parts.join(',') + '}';
    }

    function failure(code, message) {
        return serialize({ ok: false, code: code, message: message });
    }

    function hostFailure(error) {
        return failure("HOST_ERROR", error && error.message ? String(error.message) : "After Effects could not complete the operation.");
    }

    function normalizeFileItem(item, source) {
        var record = {
            projectItemId: item.id,
            itemName: String(item.name),
            sourceName: "",
            absolutePath: null,
            sourceType: "file",
            pathStatus: "unreadable"
        };
        var sourceFile = null;
        var sourcePath = null;
        var pathReadFailed = false;
        try { sourceFile = item.file; } catch (fileError) { pathReadFailed = true; }
        if (!sourceFile) {
            try { sourceFile = source.file; } catch (sourceError) { pathReadFailed = true; }
        }
        if (sourceFile) {
            try { sourcePath = sourceFile.fsName; } catch (pathError) { pathReadFailed = true; }
        }
        if (!sourcePath) {
            try { sourcePath = source.missingFootagePath; } catch (missingError) { pathReadFailed = true; }
        }
        if (typeof sourcePath !== "string" || !sourcePath.length) { return record; }
        record.absolutePath = sourcePath;
        record.sourceName = sourcePath.replace(/^.*[\\\/]/, "");
        try {
            // AE has no explicit sequence flag. Non-still image sources are
            // labeled heuristically; movie and audio sources stay ordinary files.
            if (!source.isStill && /\.(bmp|cin|dpx|exr|gif|hdr|iff|jpeg|jpg|jpe|png|psd|rla|rpf|sgi|tga|tif|tiff|webp)$/i.test(sourcePath)) {
                record.sourceType = "sequence";
            }
            if (!pathReadFailed) {
                record.pathStatus = sourceFile ? (sourceFile.exists ? "exists" : "missing") : "missing";
            }
        } catch (statusError) { record.pathStatus = "unreadable"; }
        return record;
    }

    function collectAssetRecords() {
        collectedProject = null;
        collectedItems = {};
        try {
            var project = app.project;
            if (!project) { return failure("NO_PROJECT", "No project is open."); }
            var assets = [];
            var items = {};
            var i;
            for (i = 1; i <= project.numItems; i += 1) {
                var item = project.items[i];
                if (!(item instanceof FootageItem)) { continue; }
                var source = item.mainSource;
                // Solids, placeholders, compositions and folders have no
                // searchable file source and are outside the asset list.
                if (!(source instanceof FileSource)) { continue; }
                assets.push(normalizeFileItem(item, source));
                items[item.id] = item;
            }
            collectedProject = project;
            collectedItems = items;
            return serialize({ ok: true, assets: assets });
        } catch (error) { return hostFailure(error); }
    }

    function selectProjectItem(projectItemId) {
        if (typeof projectItemId !== "number" || !isFinite(projectItemId) ||
                projectItemId <= 0 || Math.floor(projectItemId) !== projectItemId) {
            return failure("INVALID_ITEM_ID", "A positive integer project item id is required.");
        }
        try {
            var project = app.project;
            if (!project) { return failure("NO_PROJECT", "No project is open."); }
            if (project !== collectedProject) {
                return failure("STALE_PROJECT", "The project changed. Refresh the asset list.");
            }
            var target = null;
            var i;
            for (i = 1; i <= project.numItems; i += 1) {
                if (project.items[i].id === projectItemId) { target = project.items[i]; break; }
            }
            if (!target || !collectedItems[projectItemId]) {
                return failure("ITEM_NOT_FOUND", "The asset is no longer available. Refresh the asset list.");
            }
            // Item identity also guards against id reuse even if the host keeps
            // an app.project wrapper alive when switching projects.
            if (target !== collectedItems[projectItemId]) {
                return failure("STALE_PROJECT", "The project changed. Refresh the asset list.");
            }
            for (i = 1; i <= project.numItems; i += 1) { project.items[i].selected = false; }
            target.selected = true;
            return serialize({ ok: true });
        } catch (error) { return hostFailure(error); }
    }

    return { collectAssetRecords: collectAssetRecords, selectProjectItem: selectProjectItem };
}());
