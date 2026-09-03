import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const code = fs.readFileSync(new URL('../app/attachments.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]);
function harness(overrides = {}) {
  const node = tag => ({ tag, children: [], dataset: {}, listeners: {}, attributes: {},
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    setAttribute(key,value) { this.attributes[key] = value; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    remove() { this.removed = true; }, focus() {}, showModal() { this.open = true; },
  });
  const document = { createElement: node, body: node('body') };
  const created = [], revoked = [];
  const window = {};
  vm.runInNewContext(code, { window, document, Blob, Uint8Array,
    URL: { createObjectURL: () => { const url = `blob:${created.length}`; created.push(url); return url; }, revokeObjectURL: url => revoked.push(url) },
  });
  let saved = false, saves = 0;
  const item = {name:'사진.png',type:'image/png',size:8,key:{}};
  const api = window.vaultAttachments.create({ load: async () => item, read: async () => png,
    save: async () => { saves++; saved = true; }, savedCopy: () => saved ? 'copy' : null,
    showVault() {}, pick: ko => ko, ...overrides });
  const body = node('div');
  api.render(body, {fileId:'source', name:'<img onerror=evil>'});
  return {api, body, document, created, revoked, saves:()=>saves, imageType: window.vaultAttachments.imageType};
}
test('photo uses a blob preview, separate copy action, and full viewer is cleaned up', async () => {
  const h = harness(); await tick();
  const [preview,name,,action,status] = h.body.children[0].children;
  assert.equal(name.textContent,'사진.png');
  assert.equal(preview.children[0].src,'blob:0');
  assert.equal(action.textContent,'내 금고에 저장');
  preview.listeners.click();
  assert.equal(h.document.body.children[0].open,true);
  await action.listeners.click();
  assert.equal(h.saves(),1);
  assert.match(action.textContent,/저장됨/);
  assert.match(status.textContent,/별도 보관/);
  await action.listeners.click();
  assert.equal(h.saves(),1);
  h.api.clear();
  assert.equal(h.revoked.length,2);
});
test('HTML and SVG are never embedded as images, despite misleading extension', async () => {
  const h = harness({read: async () => new TextEncoder().encode('<svg onload="evil()"/>')}); await tick();
  assert.equal(h.created.length,0);
  assert.equal(h.imageType(new Uint8Array()),'');
  assert.equal(h.imageType(png),'image/png');
});
test('oversized image dimensions are rejected before browser decoding', async () => {
  const bomb = new Uint8Array(png); bomb.set([0,0,39,16,0,0,39,16],16);
  const h = harness({read:async()=>bomb}); await tick();
  assert.equal(h.created.length,0);
  assert.match(h.body.children[0].children[4].textContent,/열 수 없습니다/);
});
test('clear while decrypting suppresses late decrypted image', async () => {
  let finish;
  const h = harness({read: () => new Promise(resolve=> {finish=resolve;})});
  await tick(); h.api.clear(); finish(png); await tick();
  assert.equal(h.created.length,0);
});
test('access denial disables save; storage failure remains retryable', async () => {
  const denied = harness({load:async()=>{throw new Error('revoked');}}); await tick();
  assert.equal(denied.body.children[0].children[3].disabled,true);
  const failed = harness({save:async()=>{throw new Error('quota');}}); await tick();
  const action = failed.body.children[0].children[3];
  await action.listeners.click();
  assert.equal(action.disabled,false);
  assert.equal(action.textContent,'내 금고에 저장');
  assert.match(failed.body.children[0].children[4].textContent,/저장하지 못했습니다/);
});
test('non-image attachment is not downloaded automatically', async () => {
  const h = harness({load:async()=>({name:'문서.pdf',type:'application/pdf',size:10,key:{}}), read:async()=>{throw new Error('must not fetch');}});
  await tick();
  assert.equal(h.created.length,0);
  assert.equal(h.body.children[0].children[0].hidden,true);
  assert.equal(h.body.children[0].children[3].disabled,false);
});

const app = fs.readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
const saving = app.slice(app.indexOf('  const saveAttachmentToVault ='), app.indexOf('  const handleVaultFile ='));
test('private save gets fresh storage with no recipients; repeated saves reuse copy', async () => {
  const source = {name:'사진.png',type:'image/png',key:{},isOwner:false};
  const items = new Map([['source',source]]), calls=[];
  const context = { activeIdentity:{mode:'SUPABASE'}, savingAttachments:new Map(), vaultItems:items,
    loadPersistentVaultFiles:async()=>{}, readVaultItemBytes:async()=>png,
    savedAttachment:(_, id)=>[...items].find(([,i])=>i.sourceFileId===id)?.[0],
    storeVaultFile:async(file, recipients, metadata)=>{calls.push({file,recipients,metadata}); return {id:'new-id',item:{...metadata,key:{},isOwner:true}};},
    appendVaultItem(){}, addAudit(){}, File,
  };
  vm.createContext(context); vm.runInContext(`${saving}\nthis.save=saveAttachmentToVault;`, context);
  const results = await Promise.all([context.save('source'),context.save('source')]);
  assert.deepEqual(results,['new-id','new-id']);
  assert.equal(calls.length,1);
  assert.equal(calls[0].recipients.length,0);
  assert.equal(calls[0].metadata.purpose,'private');
  assert.equal(calls[0].metadata.sourceFileId,'source');
  assert.equal(await context.save('source'),'new-id');
  assert.equal(calls.length,1);
});
