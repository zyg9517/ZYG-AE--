(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.ZYGPathActions = factory(root);
  }
}(this, function (root) {
  'use strict';

  function failure(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  function nonempty(path) {
    if (typeof path !== 'string' || !path.trim().length) {
      throw failure('INVALID_PATH', 'A nonempty path is required.');
    }
    return path;
  }

  function localPath(path) {
    nonempty(path);
    if (!/^[A-Za-z]:[\\/]/.test(path) || /[\x00-\x1f]/.test(path)) {
      throw failure('INVALID_PATH', 'An absolute local Windows path is required.');
    }
    return path;
  }

  function toFileUrl(path) {
    var normalized = localPath(path).replace(/\\/g, '/');
    return 'file:///' + normalized.slice(0, 3) + normalized.slice(3).split('/').map(function (part) {
      return encodeURIComponent(part).replace(/[!'()*]/g, function (character) {
        return '%' + character.charCodeAt(0).toString(16).toUpperCase();
      });
    }).join('/');
  }

  function createPathActions(options) {
    options = options || {};
    var document = options.document || root.document;
    var cep = options.cep || root.cep;

    function copy(path) {
      // Promise executors run synchronously, preserving Chromium 61's click context.
      return new Promise(function (resolve, reject) {
        var textarea;
        var previous;
        var error;
        try {
          nonempty(path);
          if (!document || !document.body || typeof document.execCommand !== 'function') {
            throw failure('CLIPBOARD_UNAVAILABLE', 'The clipboard is unavailable.');
          }
          previous = document.activeElement;
          textarea = document.createElement('textarea');
          textarea.value = path;
          textarea.setAttribute('readonly', '');
          textarea.style.position = 'fixed';
          textarea.style.left = '-10000px';
          document.body.appendChild(textarea);
          textarea.select();
          if (!document.execCommand('copy')) {
            throw failure('CLIPBOARD_ERROR', 'The path could not be copied.');
          }
        } catch (caught) {
          error = caught && typeof caught.code === 'string' ? caught :
            failure('CLIPBOARD_ERROR', 'The path could not be copied.');
        } finally {
          if (textarea && textarea.parentNode) { textarea.parentNode.removeChild(textarea); }
          if (previous && typeof previous.focus === 'function') { previous.focus(); }
        }
        if (error) { reject(error); } else { resolve(); }
      });
    }

    function reveal(path, pathStatus) {
      if (pathStatus !== 'exists') {
        throw failure('PATH_UNAVAILABLE', 'Only existing asset paths can be revealed.');
      }
      // Copy/file-URL helpers preserve their input. Only folder calculation trims.
      var source = localPath(nonempty(path).trim());
      var separator = Math.max(source.lastIndexOf('\\'), source.lastIndexOf('/'));
      var folder = source.slice(0, separator === 2 ? 3 : separator);
      if (!cep || !cep.process || typeof cep.process.createProcess !== 'function') {
        throw failure('REVEAL_UNAVAILABLE', 'The Windows folder opener is unavailable.');
      }
      var result;
      try {
        // CEP 9 accepts an executable followed by argument values, not a shell command.
        result = cep.process.createProcess('C:\\Windows\\explorer.exe', folder);
      } catch (error) {
        throw failure('REVEAL_ERROR', 'The containing folder could not be opened.');
      }
      if (!result || result.err !== 0 || typeof result.data !== 'number' ||
          !isFinite(result.data) || result.data < 0) {
        var nativeError = failure('REVEAL_ERROR', 'The containing folder could not be opened.');
        if (result && typeof result.err === 'number') { nativeError.nativeCode = result.err; }
        throw nativeError;
      }
    }

    return { copy: copy, toFileUrl: toFileUrl, reveal: reveal };
  }

  var actions = createPathActions();
  actions.createPathActions = createPathActions;
  return actions;
}));
