import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
const renderer = source.slice(source.indexOf('  const appendMessage ='), source.indexOf('  const contactForMessage ='));
function harness() {
  const node = (tag) => ({ tag, children: [], dataset: {}, textContent: '',
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    querySelectorAll() { return []; }, scrollIntoView() {},
  });
  const stream = node('section');
  const context = { document: { createElement: node }, messageStream: stream,
    renderedMessageIds: new Set(), activeIdentity: { displayName: '나' },
    pick: (ko) => ko, formatMessageTime: () => '12:00',
    receiptLabel: ({ read_at, delivered_at }) => read_at ? '읽음' : delivered_at ? '전달됨' : '전송됨',
  };
  vm.createContext(context);
  vm.runInContext(`${renderer}\nthis.render = appendMessage;`, context);
  return { render: context.render, stream };
}

test('nickname, literal message text and receipt render separately', () => {
  const { render, stream } = harness();
  const text = '<img src=x onerror=alert(1)>\n두 번째 줄';
  render(text, { sender: '별명', id: 'one', readAt: '2026-09-03T12:00:00Z' });
  const [sender, bubble, meta] = stream.children[0].children;
  assert.equal(sender.textContent, '별명');
  assert.equal(sender.className, 'message__sender');
  assert.equal(bubble.textContent, text);
  assert.equal(bubble.innerHTML, undefined);
  assert.ok(Object.hasOwn(bubble.dataset, 'noI18n'));
  assert.equal(meta.tag, 'footer');
  assert.equal(meta.children[0].tag, 'time');
  assert.equal(meta.children[1].dataset.receipt, 'read');
  assert.ok(Object.hasOwn(meta.children[1].dataset, 'messageState'));
});

test('incoming bubble has no outgoing receipt and duplicate IDs are ignored', () => {
  const { render, stream } = harness();
  render('받은 메시지', { mine: false, id: 'one' });
  render('중복', { mine: false, id: 'one' });
  assert.equal(stream.children.length, 1);
  assert.match(stream.children[0].className, /message--theirs/);
  assert.equal(stream.children[0].children[2].children.length, 1);
});

test('failed message cannot appear as successfully sent', () => {
  const { render, stream } = harness();
  render('실패', { failed: true });
  assert.match(stream.children[0].className, /message--failed/);
  assert.equal(stream.children[0].children[2].children.length, 1);
});
