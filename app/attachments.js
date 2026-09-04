/* Decrypted media stays in memory. Never use a public URL or persistent cache. */
(() => {
  const MAX_BYTES = 10 * 1024 * 1024;
  const imageType = (bytes) => {
    const b = new Uint8Array(bytes);
    if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
    if ([137,80,78,71,13,10,26,10].every((v,i) => b[i] === v)) return 'image/png';
    const text = (a,z) => String.fromCharCode(...b.slice(a,z));
    return '';
  };
  const imagePixels = (bytes, type) => {
    const b = new Uint8Array(bytes);
    if (type === 'image/png' && b.length >= 24) {
      const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
      return view.getUint32(16) * view.getUint32(20);
    }
    if (type === 'image/jpeg') {
      for (let offset = 2; offset + 9 < b.length;) {
        if (b[offset] !== 255) { offset++; continue; }
        const marker = b[offset + 1];
        if (marker === 216 || marker === 217) { offset += 2; continue; }
        const length = b[offset + 2] * 256 + b[offset + 3];
        if (length < 2 || offset + length + 2 > b.length) return 0;
        if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
          return (b[offset + 5] * 256 + b[offset + 6]) * (b[offset + 7] * 256 + b[offset + 8]);
        }
        offset += length + 2;
      }
    }
    return 0;
  };

  window.vaultAttachments = { imageType, create({ load, read, save, savedCopy, showVault, pick }) {
    const cards = new Set();
    let viewer = null;
    const closeViewer = () => {
      if (!viewer) return;
      URL.revokeObjectURL(viewer.url);
      viewer.dialog.remove();
      viewer.button?.focus();
      viewer = null;
    };
    const openViewer = (blob, name, button) => {
      closeViewer();
      const dialog = document.createElement('dialog');
      dialog.className = 'attachment-viewer';
      dialog.setAttribute('aria-label', pick('사진 크게 보기', 'Photo viewer'));
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = pick('닫기', 'Close');
      const img = document.createElement('img');
      const url = URL.createObjectURL(blob);
      img.src = url;
      img.alt = name;
      dialog.append(close, img);
      viewer = { dialog, url, button };
      close.addEventListener('click', closeViewer);
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeViewer(); });
      document.body.append(dialog);
      dialog.showModal();
    };
    const render = (body, reference) => {
      const card = document.createElement('div');
      card.className = 'message-file';
      const preview = document.createElement('button');
      preview.type = 'button';
      preview.className = 'message-file__preview';
      preview.textContent = pick('첨부파일 불러오기', 'Load attachment');
      const name = document.createElement('strong');
      name.dataset.noI18n = '';
      name.textContent = String(reference.name);
      const info = document.createElement('small');
      const status = document.createElement('span');
      status.className = 'message-file__status';
      status.setAttribute('role', 'status');
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'message-file__save';
      action.textContent = pick('내 금고에 저장', 'Save to my vault');
      action.disabled = true;
      card.append(preview, name, info, action, status);
      body.append(card);
      let disposed = false, version = 0, url = '', blob = null, item = null, busy = false;
      const release = () => {
        version++;
        if (url) URL.revokeObjectURL(url);
        url = ''; blob = null;
        preview.replaceChildren();
        preview.textContent = pick('첨부파일 보기', 'View attachment');
      };
      const updateAction = () => {
        const saved = item && savedCopy(item, reference.fileId);
        action.textContent = saved ? pick('저장됨 · 금고에서 보기', 'Saved · View in vault') : pick('내 금고에 저장', 'Save to my vault');
        action.disabled = !item?.key || busy;
      };
      const hydrate = async () => {
        const current = ++version;
        status.textContent = pick('안전하게 불러오는 중…', 'Loading securely…');
        try {
          const loaded = await load(reference.fileId);
          if (disposed || current !== version) return;
          item = loaded;
          name.textContent = item.name;
          info.textContent = `${item.type || 'FILE'} · ${(item.size / 1024).toFixed(1)} KB`;
          updateAction();
          // SVG/HTML and unknown formats are never rendered as active content.
          if (!/^image\/(jpeg|png)$/i.test(item.type) && !/\.(jpe?g|png)$/i.test(item.name)) {
            preview.hidden = true;
            status.textContent = pick('파일은 내 금고에 저장한 뒤 열 수 있습니다.', 'Save the file to your vault to open it.');
            return;
          }
          if (item.size > MAX_BYTES) throw new Error('Image exceeds preview limit');
          const bytes = await read(item);
          if (disposed || current !== version) return;
          const type = imageType(bytes);
          if (!type || bytes.byteLength > MAX_BYTES) throw new Error('Unsupported image');
          const pixels = imagePixels(bytes, type);
          if (!pixels || pixels > 36_000_000) throw new Error('Image dimensions exceed preview limit');
          blob = new Blob([bytes], { type });
          if (url) URL.revokeObjectURL(url);
          url = URL.createObjectURL(blob);
          const img = document.createElement('img');
          img.alt = item.name;
          img.src = url;
          img.addEventListener('error', () => {
            if (current !== version || disposed) return;
            release();
            status.textContent = pick('미리보기를 표시할 수 없습니다. 금고에 저장해 확인하세요.', 'Preview unavailable. Save to your vault to open.');
          });
          preview.hidden = false;
          preview.setAttribute('aria-label', pick('사진 크게 보기', 'View full photo'));
          preview.replaceChildren(img);
          status.textContent = '';
        } catch {
          if (disposed || current !== version) return;
          status.textContent = pick('첨부파일을 열 수 없습니다. 접근 권한 또는 연결을 확인하고 다시 눌러주세요.', 'Cannot open attachment. Check access or connection and retry.');
        }
      };
      preview.addEventListener('click', () => {
        if (blob) openViewer(blob, item.name, preview);
        else void hydrate();
      });
      action.addEventListener('click', async () => {
        if (!item || busy) return;
        const existing = savedCopy(item, reference.fileId);
        if (existing) { showVault(existing); return; }
        busy = true; updateAction();
        status.textContent = pick('내 전용 키로 암호화해 저장 중…', 'Encrypting a private copy…');
        try {
          await save(reference.fileId);
          if (!disposed) status.textContent = pick('내 금고에 별도 보관했습니다.', 'A private copy is saved in your vault.');
        } catch {
          if (!disposed) status.textContent = pick('저장하지 못했습니다. 연결·저장공간·접근 권한을 확인하고 다시 시도하세요.', 'Save failed. Check connection, storage and access, then retry.');
        } finally {
          busy = false;
          if (!disposed) updateAction();
        }
      });
      const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) void hydrate();
          else release();
        }
      }, { rootMargin: '120px' }) : null;
      const controller = { dispose() { disposed = true; observer?.disconnect(); release(); card.remove(); } };
      cards.add(controller);
      if (observer) observer.observe(card);
      else void hydrate();
    };
    return { render, clear() { closeViewer(); cards.forEach(c => c.dispose()); cards.clear(); } };
  } };
})();
