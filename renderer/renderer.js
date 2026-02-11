/* global api */
const sel   = document.getElementById('sourceSel');
const input = document.getElementById('search');
const btn   = document.getElementById('go');
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

function loadURL(word) {
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
