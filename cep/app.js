(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core/ui-state.js'));
  } else {
    root.ZYGAssetApp = factory(root.ZYGUiState);
    if (root.document) {
      var start = function () {
        root.ZYGAssetApp.createApp(root.document, root.ZYGHostApi, root.ZYGPathActions).init();
      };
      if (root.document.readyState === 'loading') {
        root.document.addEventListener('DOMContentLoaded', start);
      } else { start(); }
    }
  }
}(this, function (uiState) {
  'use strict';

  function createApp(document, hostApi, pathActions) {
    var input = document.getElementById('query');
    var form = document.getElementById('search-form');
    var clearButton = document.getElementById('clear');
    var refreshButton = document.getElementById('refresh');
    var status = document.getElementById('status');
    var message = document.getElementById('action-message');
    var results = document.getElementById('results');
    var table = document.getElementById('result-table');
    var records = [];
    var query = '';
    var phase = 'empty';
    var generation = 0;
    var actionSequence = 0;
    var actionButtons = [];

    function cell(row, text, className) {
      var element = document.createElement('td');
      element.textContent = text;
      if (className) { element.setAttribute('class', className); }
      row.appendChild(element);
      return element;
    }

    function button(parent, label, disabled, action) {
      var element = document.createElement('button');
      element.type = 'button';
      element.textContent = label;
      element.disabled = disabled;
      element.addEventListener('click', action);
      parent.appendChild(element);
      actionButtons.push(element);
    }

    function render() {
      var view = uiState.deriveViewState(records, query);
      var statuses = { exists: '存在', missing: '缺失', unreadable: '不可读取', not_applicable: '不适用' };
      results.textContent = '';
      actionButtons = [];
      phase = view.state;
      table.hidden = !view.rows.length;
      table.setAttribute('aria-busy', 'false');
      refreshButton.textContent = '刷新素材';
      if (phase === 'empty') {
        status.textContent = '当前项目没有可检索的文件素材。请导入文件素材后刷新。';
      } else if (phase === 'no_match') {
        status.textContent = '未找到匹配素材（已加载 ' + view.totalCount + ' 条）。';
      } else {
        status.textContent = '已加载 ' + view.totalCount + ' 条素材，显示 ' + view.matchedCount + ' 条。';
      }
      view.rows.forEach(function (item) {
        var record = item.record;
        var row = document.createElement('tr');
        cell(row, record.itemName);
        cell(row, record.sourceName);
        cell(row, record.absolutePath === null ? '无可用路径' : record.absolutePath, 'asset-path');
        cell(row, statuses[record.pathStatus] || '不可读取');
        cell(row, record.sourceType === 'sequence' ? '序列素材' : '文件素材');
        var actions = cell(row, '', 'row-actions');
        button(actions, '选中项目项', false, function () { select(record); });
        button(actions, '复制完整路径', !item.canCopy, function () { copy(record); });
        button(actions, '打开所在位置', !item.canReveal, function () { reveal(record); });
        results.appendChild(row);
      });
    }

    function loadError(error) {
      if (error && error.code === 'NO_PROJECT') { return '请先在 AE2020 中打开一个项目，再重试。'; }
      if (error && error.code === 'HOST_UNAVAILABLE') { return '无法连接 AE2020。请在 AE2020 中打开此面板，再重试。'; }
      return '读取素材失败，请确认 AE2020 项目可用后重试。';
    }

    function refresh() {
      var request = ++generation;
      actionSequence++;
      phase = 'loading';
      message.textContent = '';
      status.textContent = '正在读取当前项目素材…';
      table.setAttribute('aria-busy', 'true');
      actionButtons.forEach(function (element) { element.disabled = true; });
      var load;
      try { load = hostApi.loadAssets(); }
      catch (error) { load = Promise.reject(error); }
      return Promise.resolve(load).then(function (loaded) {
        if (request !== generation) { return; }
        records = loaded;
        render();
      }).catch(function (error) {
        if (request !== generation) { return; }
        records = [];
        results.textContent = '';
        actionButtons = [];
        phase = 'error';
        table.hidden = true;
        table.setAttribute('aria-busy', 'false');
        status.textContent = loadError(error);
        refreshButton.textContent = '重试';
      });
    }

    function search() {
      query = input.value;
      message.textContent = '';
      if (phase === 'error') { return refresh(); }
      if (phase !== 'loading') { render(); }
      return Promise.resolve();
    }

    function clear() {
      input.value = '';
      return search();
    }

    function act(record, operation, success, failure) {
      if (phase === 'loading' || phase === 'error' || records.indexOf(record) === -1) { return Promise.resolve(); }
      var request = generation;
      var action = ++actionSequence;
      var result;
      // Invoke on the initiating click stack: Chromium 61 clipboard depends on it.
      try { result = operation(); }
      catch (error) { result = Promise.reject(error); }
      return Promise.resolve(result).then(function (response) {
        if (response && response.ok === false) { throw new Error('Action failed'); }
        if (request === generation && action === actionSequence) { message.textContent = success; }
      }).catch(function () {
        if (request === generation && action === actionSequence) { message.textContent = failure; }
      });
    }

    function select(record) {
      return act(record, function () { return hostApi.selectItem(record.projectItemId); },
        '已选中 AE 项目项。', '选中项目项失败，请刷新素材后重试。');
    }

    function copy(record) {
      if (typeof record.absolutePath !== 'string' || !record.absolutePath.trim()) { return Promise.resolve(); }
      return act(record, function () { return pathActions.copy(record.absolutePath); },
        '已复制完整路径。', '复制路径失败，可直接选择表格中的完整路径复制后重试。');
    }

    function reveal(record) {
      if (record.pathStatus !== 'exists' || typeof record.absolutePath !== 'string' || !record.absolutePath.trim()) { return Promise.resolve(); }
      return act(record, function () { return pathActions.reveal(record.absolutePath, record.pathStatus); },
        '已请求打开所在位置。', '打开所在位置失败，请确认路径可用后重试。');
    }

    form.addEventListener('submit', function (event) { event.preventDefault(); search(); });
    clearButton.addEventListener('click', clear);
    refreshButton.addEventListener('click', refresh);
    return { init: refresh, refresh: refresh, search: search, clear: clear, select: select, copy: copy, reveal: reveal };
  }

  return { createApp: createApp };
}));
