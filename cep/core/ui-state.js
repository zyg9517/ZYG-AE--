(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./asset-search.js'));
  } else {
    root.ZYGUiState = factory(root.ZYGAssetSearch);
  }
}(this, function (search) {
  'use strict';

  function deriveViewState(records, query) {
    var totalCount = search.filterAssets(records, '').length;
    var matches = search.filterAssets(records, query);
    return {
      state: !totalCount ? 'empty' : matches.length ? 'ready' : 'no_match',
      query: query,
      totalCount: totalCount,
      matchedCount: matches.length,
      rows: matches.map(function (record) {
        var canCopy = typeof record.absolutePath === 'string' && record.absolutePath.trim().length > 0;
        return { record: record, canCopy: canCopy, canReveal: canCopy && record.pathStatus === 'exists' };
      })
    };
  }

  return { deriveViewState: deriveViewState };
}));
