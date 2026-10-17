(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.ZYGHostContract = factory();
  }
}(this, function () {
  'use strict';

  function protocolError() {
    var error = new Error('Invalid response from After Effects.');
    error.code = 'PROTOCOL_ERROR';
    throw error;
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function validRecord(record) {
    if (!isObject(record) || typeof record.projectItemId !== 'number' ||
        !isFinite(record.projectItemId) || record.projectItemId <= 0 ||
        Math.floor(record.projectItemId) !== record.projectItemId ||
        typeof record.itemName !== 'string' || typeof record.sourceName !== 'string') {
      return false;
    }
    if (typeof record.sourceType !== 'string' || !record.sourceType.length) { return false; }
    if (record.pathStatus === 'not_applicable') {
      return record.absolutePath === null;
    }
    if (record.pathStatus === 'unreadable') {
      return record.absolutePath === null ||
        (typeof record.absolutePath === 'string' && record.absolutePath.length > 0);
    }
    return (record.pathStatus === 'exists' || record.pathStatus === 'missing') &&
      typeof record.absolutePath === 'string' && record.absolutePath.length > 0;
  }

  function parseHostResponse(raw, operation) {
    if (typeof raw !== 'string' || (operation !== 'collect' && operation !== 'select')) {
      return protocolError();
    }
    var response;
    try { response = JSON.parse(raw); } catch (error) { return protocolError(); }
    if (!isObject(response)) { return protocolError(); }
    if (response.ok === false) {
      if (typeof response.code !== 'string' || !response.code.length ||
          typeof response.message !== 'string' || !response.message.length) {
        return protocolError();
      }
      return response;
    }
    if (response.ok !== true) { return protocolError(); }
    if (operation === 'select') { return response; }
    if (!Array.isArray(response.assets)) { return protocolError(); }
    var ids = {};
    for (var i = 0; i < response.assets.length; i += 1) {
      var record = response.assets[i];
      if (!validRecord(record) || ids[record.projectItemId]) { return protocolError(); }
      ids[record.projectItemId] = true;
    }
    return response;
  }

  return { parseHostResponse: parseHostResponse };
}));
