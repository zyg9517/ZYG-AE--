(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, require('./core/host-contract.js'));
  } else {
    root.ZYGHostApi = factory(root, root.ZYGHostContract);
  }
}(this, function (root, contract) {
  'use strict';

  function failure(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  function createHostApi(options) {
    options = options || {};
    var csInterface = options.csInterface;
    var timeoutMs = options.timeoutMs === undefined ? 5000 : options.timeoutMs;
    if (typeof timeoutMs !== 'number' || !isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60000) {
      throw failure('INVALID_TIMEOUT', 'Host timeout must be between 1 and 60000 milliseconds.');
    }

    function invoke(script, operation) {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var timer;
        function finish(error, response) {
          if (settled) { return; }
          settled = true;
          clearTimeout(timer);
          if (error) { reject(error); } else { resolve(response); }
        }
        try {
          if (!csInterface && typeof root.CSInterface === 'function') {
            csInterface = new root.CSInterface();
          }
          if (!csInterface || typeof csInterface.evalScript !== 'function') {
            finish(failure('HOST_UNAVAILABLE', 'The After Effects bridge is unavailable.'));
            return;
          }
          timer = setTimeout(function () {
            finish(failure('HOST_TIMEOUT', 'After Effects did not respond in time.'));
          }, timeoutMs);
          csInterface.evalScript(script, function (raw) {
            if (settled) { return; }
            if (raw === 'EvalScript error.') {
              finish(failure('HOST_EVAL_ERROR', 'After Effects could not evaluate the host call.'));
              return;
            }
            try { finish(null, contract.parseHostResponse(raw, operation)); }
            catch (error) { finish(error); }
          });
        } catch (error) {
          finish(failure('HOST_EVAL_ERROR', 'After Effects could not evaluate the host call.'));
        }
      });
    }

    function loadAssets() {
      return invoke('ZYGAssetWorkbench.collectAssetRecords()', 'collect').then(function (response) {
        if (!response.ok) { throw failure(response.code, response.message); }
        return response.assets;
      });
    }

    function selectItem(projectItemId) {
      if (typeof projectItemId !== 'number' || !isFinite(projectItemId) ||
          projectItemId <= 0 || Math.floor(projectItemId) !== projectItemId) {
        return Promise.resolve({ ok: false, code: 'INVALID_ITEM_ID', message: 'A positive integer project item id is required.' });
      }
      return invoke('ZYGAssetWorkbench.selectProjectItem(' + projectItemId + ')', 'select').catch(function (error) {
        return { ok: false, code: error.code, message: error.message };
      });
    }

    return { loadAssets: loadAssets, selectItem: selectItem };
  }

  var api = createHostApi();
  api.createHostApi = createHostApi;
  return api;
}));
