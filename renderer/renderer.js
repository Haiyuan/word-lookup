/* global api */
const sel   = document.getElementById('sourceSel');
const input = document.getElementById('search');
const btn   = document.getElementById('go');
const starBtn = document.getElementById('starBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsDlg = document.getElementById('settingsDlg');
const tabHistory = document.getElementById('tabHistory');
const tabFavorites = document.getElementById('tabFavorites');
const settingsList = document.getElementById('settingsList');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');

let historyWords = [];
let favoriteWords = [];
let currentSettingsTab = 'History';

Promise.all([api.reqHistory(), api.reqFavorites()]).then(([h, f]) => {
  historyWords = h || [];
  favoriteWords = f || [];
});

function updateStar() {
  const w = input.value.trim();
  starBtn.textContent = (w && favoriteWords.includes(w)) ? '★' : '☆';
}

starBtn.onclick = () => {
  const w = input.value.trim();
  if (!w) return;
  if (favoriteWords.includes(w)) {
    favoriteWords = favoriteWords.filter(x => x !== w);
  } else {
    favoriteWords.unshift(w);
  }
  api.saveFavorites(favoriteWords);
  updateStar();
  if (managerOpened && currentSettingsTab === 'Favorites') renderSettingsList();
};
// ---- 输入框：阻断 BrowserView 抢键盘，同时允许 Enter 直接查词 ----
input.addEventListener('keydown', ev => {
  if (ev.key === 'Enter') {
    btn.click();                 // ↵ 和点击 Go 等效
    ev.stopPropagation();        // BrowserView 不应再处理
    return;
  }
  // 对于可打印字符（空格 / 字母等）阻断向下冒泡；保留 Cmd/Ctrl 等快捷键
  const hasCommandModifier = ev.metaKey || ev.ctrlKey || ev.altKey;
  if (!hasCommandModifier && (ev.key.length === 1 || ev.key === ' ')) {
    ev.stopPropagation();
  }
}, true);
const dlg   = document.getElementById('mgr');
const tbl   = document.getElementById('tbl');
const addBtn= document.getElementById('add');
const saveBtn= document.getElementById('save');
const closeBtn= document.getElementById('close');

let sources = {};
let managerOpened = false;

function rebuildSel() {
  sel.textContent = '';
  Object.keys(sources).forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    sel.appendChild(opt);
  });
}

function appendSourceRow(name = '', url = '') {
  const tr = document.createElement('tr');
  const nameTd = document.createElement('td');
  const urlTd = document.createElement('td');
  const actionTd = document.createElement('td');
  const nameInput = document.createElement('input');
  const urlInput = document.createElement('input');
  const removeBtn = document.createElement('button');

  nameInput.value = name;
  urlInput.value = url;
  removeBtn.type = 'button';
  removeBtn.dataset.removeRow = '1';
  removeBtn.textContent = 'x';

  nameTd.appendChild(nameInput);
  urlTd.appendChild(urlInput);
  actionTd.appendChild(removeBtn);
  tr.appendChild(nameTd);
  tr.appendChild(urlTd);
  tr.appendChild(actionTd);
  tbl.appendChild(tr);
}

function rebuildManagerTable() {
  tbl.textContent = '';
  const head = document.createElement('tr');
  ['Name', 'Template (%s)', ''].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    head.appendChild(th);
  });
  tbl.appendChild(head);

  Object.entries(sources).forEach(([name, url]) => appendSourceRow(name, url));
}

function notifyManagerDone() {
  if (!managerOpened) return;
  managerOpened = false;
  api.managerDone();
}

function renderSettingsList() {
  settingsList.innerHTML = '';
  const list = currentSettingsTab === 'History' ? historyWords : favoriteWords;
  list.forEach(w => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.padding = '4px 0';
    li.style.borderBottom = '1px solid #f0f0f0';

    const span = document.createElement('span');
    span.textContent = w;
    span.style.cursor = 'pointer';
    span.style.flex = '1';
    span.onclick = () => {
      input.value = w;
      loadURL(w);
      settingsDlg.close();
    };

    const rmBtn = document.createElement('button');
    rmBtn.textContent = 'x';
    rmBtn.style.border = 'none';
    rmBtn.style.background = 'transparent';
    rmBtn.style.cursor = 'pointer';
    rmBtn.onclick = () => {
      if (currentSettingsTab === 'History') {
        historyWords = historyWords.filter(x => x !== w);
        api.saveHistory(historyWords);
      } else {
        favoriteWords = favoriteWords.filter(x => x !== w);
        api.saveFavorites(favoriteWords);
        updateStar();
      }
      renderSettingsList();
    };

    li.appendChild(span);
    li.appendChild(rmBtn);
    settingsList.appendChild(li);
  });
}

function openSettings(tab) {
  currentSettingsTab = tab;
  tabHistory.style.color = tab === 'History' ? 'blue' : 'gray';
  tabFavorites.style.color = tab === 'Favorites' ? 'blue' : 'gray';
  renderSettingsList();
  if (!managerOpened) {
    api.openSettings();
    managerOpened = true;
    settingsDlg.showModal();
  }
}

settingsBtn.onclick = () => openSettings('History');
tabHistory.onclick = () => openSettings('History');
tabFavorites.onclick = () => openSettings('Favorites');
settingsCloseBtn.onclick = () => settingsDlg.close();
settingsDlg.addEventListener('close', notifyManagerDone);

function loadURL(word) {
  if (word) {
    historyWords = historyWords.filter(w => w !== word);
    historyWords.unshift(word);
    if (historyWords.length > 200) historyWords.length = 200;
    api.saveHistory(historyWords);
    updateStar();
  }
  const tpl = sources[sel.value] || '{word}';
  // 同时兼容 {word} 与 %s 两种写法，方便以后混用
  const url = tpl
    .replace(/\{word\}/gi,   encodeURIComponent(word))
    .replace(/%s/g,          encodeURIComponent(word));
  window.api.toMain(url);   // 发送给主进程
}

btn.onclick = () => { loadURL(input.value.trim()); };

api.reqSources().then(s => { sources = s; rebuildSel(); });

api.onLookup(word => {
  input.value = word;
  loadURL(word); // ✅ CLI 来的词立即查
});

api.onOpenMgr(() => {
  rebuildManagerTable();
  managerOpened = true;
  dlg.showModal();
});

addBtn.onclick = () => {
  appendSourceRow();
};
tbl.onclick = e => {
  if (e.target.dataset.removeRow === '1') e.target.closest('tr').remove();
};

saveBtn.onclick = () => {
  const rows = Array.from(tbl.querySelectorAll('tr')).slice(1);
  sources = {};
  rows.forEach(r => {
    const [name, url] = Array.from(r.querySelectorAll('input')).map(i => i.value.trim());
    if (name && url) sources[name] = url;
  });
  rebuildSel();
  api.saveSources(sources);
  dlg.close();
};
closeBtn.onclick = () => { dlg.close(); };
dlg.addEventListener('close', notifyManagerDone);

api.onSourcesUpdated(s => { sources = s; rebuildSel(); });

function reportH () {
  const h = Math.round(
    document.getElementById('toolbar').getBoundingClientRect().bottom
  );
  console.log('[renderer] toolbar height =', h);
  api.sendToolbarH(h);
}
window.addEventListener('resize',  reportH);
window.addEventListener('DOMContentLoaded', reportH);
window.addEventListener('load',          reportH);

setTimeout(reportH, 200);   // 200 ms 后再发一次
setTimeout(reportH, 500);   // 500 ms 后兜底
