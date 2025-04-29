/* global api */
const sel   = document.getElementById('sourceSel');
const input = document.getElementById('search');
const btn   = document.getElementById('go');
const dlg   = document.getElementById('mgr');
const tbl   = document.getElementById('tbl');
const addBtn= document.getElementById('add');
const saveBtn= document.getElementById('save');
const closeBtn= document.getElementById('close');

let sources = {};

function rebuildSel() {
  sel.innerHTML = Object.keys(sources).map(k =>
    `<option value="${k}">${k}</option>`).join('');
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
input.onkeydown = e => e.key === 'Enter' && btn.onclick();

api.reqSources().then(s => { sources = s; rebuildSel(); });

api.onLookup(word => {
  input.value = word;
  loadURL(word);
});

api.onOpenMgr(() => {
  // 重建表格
  tbl.innerHTML = '<tr><th>Name</th><th>Template (%s)</th><th></th></tr>';
  Object.entries(sources).forEach(([k, v]) => {
    tbl.insertAdjacentHTML('beforeend',
      `<tr><td><input value="${k}"></td><td><input value="${v}"></td><td><button>×</button></td></tr>`);
  });
  dlg.showModal();
});

addBtn.onclick = () => {
  tbl.insertAdjacentHTML('beforeend',
    `<tr><td><input></td><td><input></td><td><button>×</button></td></tr>`);
};
tbl.onclick = e => { if (e.target.tagName === 'BUTTON') e.target.closest('tr').remove(); };

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
  api.managerDone();        // 🔔 让主进程把 BrowserView 挂回来
};
closeBtn.onclick = () => {   // 纯关闭也要通知一下
  dlg.close();
  api.managerDone();
};

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