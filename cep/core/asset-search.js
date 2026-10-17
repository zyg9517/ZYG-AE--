(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.ZYGAssetSearch = factory();
  }
}(this, function () {
  'use strict';

  function filterAssets(records, query) {
    var normalizedQuery = query.trim().toLowerCase();
    return records.filter(function (record) {
      return record.pathStatus !== 'not_applicable' && (
        record.itemName.toLowerCase().indexOf(normalizedQuery) !== -1 ||
        record.sourceName.toLowerCase().indexOf(normalizedQuery) !== -1
      );
    });
  }

  return { filterAssets: filterAssets };
}));
