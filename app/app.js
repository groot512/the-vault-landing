(() => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const views = [...document.querySelectorAll('[data-view]')];
  const navButtons = [...document.querySelectorAll('[data-view-target]')];
  const viewTitle = document.querySelector('[data-view-title]');
  const keyState = document.querySelector('[data-key-state]');
  const deviceId = document.querySelector('[data-device-id]');
  const messageForm = document.querySelector('[data-message-form]');
  const messageStream = document.querySelector('[data-message-stream]');
  const messageInput = document.querySelector('#message-input');
  const boundaryOutput = document.querySelector('[data-boundary-output]');
  const boundaryStatus = document.querySelector('[data-boundary-status]');
  const fileInput = document.querySelector('[data-file-input]');
  const fileOutput = document.querySelector('[data-file-output]');
  const fileStatus = document.querySelector('[data-file-status]');
  const vaultList = document.querySelector('[data-vault-list]');
  const auditLedger = document.querySelector('[data-audit-ledger]');
  const adminNav = document.querySelector('[data-admin-nav]');
  const adminIssueForm = document.querySelector('[data-admin-issue-form]');
  const adminOrganization = document.querySelector('[data-admin-organization]');
  const adminFeedback = document.querySelector('[data-admin-feedback]');
  const credentialResult = document.querySelector('[data-credential-result]');
  const credentialVaultId = document.querySelector('[data-admin-vault-id]');
  const credentialPassword = document.querySelector('[data-admin-password]');
  const credentialClose = document.querySelector('[data-credential-close]');
  const credentialCopyButtons = [...document.querySelectorAll('[data-copy-credential]')];
  const vaultItems = new Map();
  let messageKey = null;
  let activeIdentity = null;
  let issuedCredentials = null;
  let adminAccess = false;
  let auditCounter = 0;

  const pick = (ko, en) => window.vaultI18n?.pick(ko, en) ?? ko;

  const setLocalizedText = (element, ko, en) => {
    if (!element) return;
    element.dataset.ko = ko;
    element.dataset.en = en;
    element.textContent = pick(ko, en);
  };

  const viewNames = {
    signal: 'TESSERA',
    archive: 'DIGITAL VAULT',
    audit: 'AUDIT LEDGER',
    admin: 'ACCESS OFFICE',
  };

  const makeId = (length = 8) => {
    const bytes = window.crypto.getRandomValues(new Uint8Array(length));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  };

  const bytesToBase64 = (bytes) => {
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return window.btoa(binary);
  };

  const renderPayload = (target, bytes) => {
    target.replaceChildren();
    const groups = bytesToBase64(bytes).match(/.{1,12}/g) || [];
    groups.slice(0, 48).forEach((group, index) => {
      const node = document.createElement(index % 6 === 0 ? 'span' : 'b');
      node.textContent = `${group} `;
      if (node.tagName === 'B') node.style.fontWeight = 'inherit';
      target.appendChild(node);
    });
    if (groups.length > 48) target.append('…');
  };

  const createKey = () => window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  const encryptBytes = async (key, plainBytes) => {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
    const cipher = new Uint8Array(encrypted);
    const payload = new Uint8Array(iv.length + cipher.length);
    payload.set(iv);
    payload.set(cipher, iv.length);
    return { iv, cipher, payload };
  };

  const decryptBytes = (key, iv, cipher) => window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipher,
  );

  const addAudit = (event, scope = 'LOCAL') => {
    auditCounter += 1;
    const row = document.createElement('div');
    row.className = 'audit-event';

    const time = document.createElement('time');
    time.dateTime = new Date().toISOString();
    time.textContent = new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date());

    const name = document.createElement('strong');
    name.textContent = event;
    const eventScope = document.createElement('span');
    eventScope.textContent = `${scope} / ${String(auditCounter).padStart(3, '0')}`;

    row.append(time, name, eventScope);
    auditLedger?.prepend(row);
  };

  const showView = (name) => {
    const permittedName = name === 'admin' && !adminAccess ? 'signal' : name;
    if (permittedName !== 'admin' && credentialResult && !credentialResult.hidden) {
      clearIssuedCredentials();
    }
    views.forEach((view) => {
      const isActive = view.dataset.view === permittedName;
      view.hidden = !isActive;
      view.classList.toggle('is-active', isActive);
    });
    navButtons.forEach((button) => {
      const isActive = button.dataset.viewTarget === permittedName;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    if (viewTitle) viewTitle.textContent = viewNames[permittedName] || permittedName;
  };

  navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.dataset.viewTarget;
      showView(name);
      window.history.replaceState(null, '', `#${name}`);
    });
  });

  const showHashView = () => {
    const name = window.location.hash.slice(1);
    if (viewNames[name]) showView(name);
  };

  window.addEventListener('hashchange', showHashView);

  const appendMessage = (text) => {
    const message = document.createElement('article');
    message.className = 'message message--mine';
    const sender = document.createElement('span');
    sender.textContent = `${activeIdentity?.displayName || pick('인증된 사용자', 'Verified User')} · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
    const body = document.createElement('p');
    body.textContent = text;
    message.append(sender, body);
    messageStream?.appendChild(message);
    message.scrollIntoView({ block: 'nearest' });
  };

  messageForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const plain = messageInput?.value.trim();
    if (!plain || !messageKey) return;

    const submit = messageForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    setLocalizedText(boundaryStatus, '브라우저에서 암호화 중', 'Encrypting locally');

    try {
      const encrypted = await encryptBytes(messageKey, encoder.encode(plain));
      const decrypted = await decryptBytes(messageKey, encrypted.iv, encrypted.cipher);
      const verified = decoder.decode(decrypted) === plain;
      renderPayload(boundaryOutput, encrypted.payload);
      if (verified) {
        setLocalizedText(
          boundaryStatus,
          `검증 완료 / ${encrypted.payload.byteLength}바이트`,
          `Verified / ${encrypted.payload.byteLength} bytes`,
        );
      } else {
        setLocalizedText(boundaryStatus, '검증 실패', 'Verification failed');
      }
      appendMessage(plain);
      messageInput.value = '';
      addAudit('MESSAGE_ENCRYPTED', 'TESSERA');
    } catch (error) {
      setLocalizedText(boundaryStatus, '암호화 실패', 'Encryption failed');
      console.error('Message proof failed', error);
    } finally {
      submit.disabled = false;
      messageInput?.focus();
    }
  });

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  };

  const downloadVaultItem = async (id) => {
    const item = vaultItems.get(id);
    if (!item?.key) return;
    const decrypted = await decryptBytes(item.key, item.iv, item.cipher);
    const blob = new Blob([decrypted], { type: item.type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = item.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    addAudit('FILE_DECRYPTED', 'DIGITAL VAULT');
  };

  const revokeVaultItem = (id, row) => {
    const item = vaultItems.get(id);
    if (!item) return;
    item.key = null;
    row.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
    });
    const state = row.querySelector('[data-item-state]');
    setLocalizedText(state, '접근키 폐기 / 접근 불가', 'Key revoked / inaccessible');
    addAudit('FILE_KEY_REVOKED', 'DIGITAL VAULT');
  };

  const appendVaultItem = (id, file) => {
    vaultList?.querySelector('.vault-list__empty')?.remove();
    const row = document.createElement('article');
    row.className = 'vault-item';

    const info = document.createElement('div');
    const state = document.createElement('span');
    state.dataset.itemState = '';
    setLocalizedText(
      state,
      `암호화됨 / ${formatSize(file.size)}`,
      `Encrypted / ${formatSize(file.size)}`,
    );
    const name = document.createElement('strong');
    name.textContent = file.name;
    info.append(state, name);

    const actions = document.createElement('div');
    actions.className = 'vault-item__actions';
    const download = document.createElement('button');
    download.type = 'button';
    download.dataset.ko = '복호화 다운로드';
    download.dataset.en = 'Decrypt';
    download.textContent = pick(download.dataset.ko, download.dataset.en);
    download.addEventListener('click', () => downloadVaultItem(id));
    const revoke = document.createElement('button');
    revoke.type = 'button';
    revoke.dataset.ko = '접근키 폐기';
    revoke.dataset.en = 'Revoke';
    revoke.textContent = pick(revoke.dataset.ko, revoke.dataset.en);
    revoke.addEventListener('click', () => revokeVaultItem(id, row));
    actions.append(download, revoke);
    row.append(info, actions);
    vaultList?.prepend(row);
  };

  const clearIssuedCredentials = () => {
    issuedCredentials = null;
    if (credentialVaultId) credentialVaultId.textContent = '';
    if (credentialPassword) credentialPassword.textContent = '';
    if (credentialResult) credentialResult.hidden = true;
  };

  const issuanceErrorMessage = (message) => {
    const messages = {
      'Authenticator assurance level 2 required': '인증 앱 검증을 다시 완료한 뒤 시도하세요.',
      'Organization administrator required': '조직 관리자만 계정을 발급할 수 있습니다.',
      'Unable to verify administrator membership': '관리자 권한을 확인하지 못했습니다.',
      'Unable to issue a unique VAULT account': '고유한 VAULT ID를 발급하지 못했습니다. 다시 시도하세요.',
      'Account issuance could not be completed': '계정과 조직 권한을 함께 생성하지 못했습니다.',
    };
    return messages[message] || message || '계정을 발급하지 못했습니다.';
  };

  const copyCredential = async (value) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  };

  adminIssueForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!adminAccess || !activeIdentity?.organization?.id) return;

    const submit = adminIssueForm.querySelector('button[type="submit"]');
    const controls = adminIssueForm.querySelectorAll('button, input');
    controls.forEach((control) => { control.disabled = true; });
    clearIssuedCredentials();
    adminFeedback?.classList.remove('is-error');
    setLocalizedText(adminFeedback, '서버에서 임시 자격증명을 생성하고 있습니다.', 'Generating temporary credentials on the server.');

    try {
      issuedCredentials = await window.vaultIdentity.issueAccount(activeIdentity.organization.id);
      credentialVaultId.textContent = issuedCredentials.vaultId;
      credentialPassword.textContent = issuedCredentials.temporaryPassword;
      credentialResult.hidden = false;
      adminIssueForm.reset();
      adminFeedback?.classList.remove('is-error');
      setLocalizedText(adminFeedback, '계정이 발급되었습니다. 자격증명은 이 화면에 한 번만 표시됩니다.', 'Account issued. These credentials are shown once.');
      addAudit('ACCOUNT_ISSUED', 'ACCESS OFFICE');
      credentialResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      setLocalizedText(adminFeedback, issuanceErrorMessage(error.message), error.message || 'Account issuance failed.');
      adminFeedback?.classList.add('is-error');
    } finally {
      controls.forEach((control) => { control.disabled = false; });
      if (submit) submit.disabled = false;
    }
  });

  credentialCopyButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const value = issuedCredentials?.[button.dataset.copyCredential];
      if (!value) return;
      try {
        await copyCredential(value);
        setLocalizedText(adminFeedback, '클립보드에 복사했습니다.', 'Copied to clipboard.');
        adminFeedback?.classList.remove('is-error');
      } catch {
        setLocalizedText(adminFeedback, '복사하지 못했습니다. 화면의 값을 직접 기록하세요.', 'Copy failed. Record the value directly from the screen.');
        adminFeedback?.classList.add('is-error');
      }
    });
  });

  credentialClose?.addEventListener('click', () => {
    clearIssuedCredentials();
    setLocalizedText(adminFeedback, '화면에서 임시 자격증명을 폐기했습니다.', 'Temporary credentials cleared from the screen.');
    adminFeedback?.classList.remove('is-error');
  });

  fileInput?.addEventListener('change', async () => {
    const [file] = fileInput.files || [];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setLocalizedText(fileStatus, '파일이 10MB를 초과합니다', 'File exceeds 10 MB');
      fileInput.value = '';
      return;
    }

    setLocalizedText(fileStatus, '업로드 전 암호화 중', 'Encrypting before upload');
    try {
      const key = await createKey();
      const plainBytes = new Uint8Array(await file.arrayBuffer());
      const encrypted = await encryptBytes(key, plainBytes);
      const id = makeId(6);
      vaultItems.set(id, {
        key,
        iv: encrypted.iv,
        cipher: encrypted.cipher,
        name: file.name,
        type: file.type,
      });
      renderPayload(fileOutput, encrypted.payload);
      setLocalizedText(
        fileStatus,
        `암호화됨 / ${formatSize(encrypted.payload.byteLength)}`,
        `Encrypted / ${formatSize(encrypted.payload.byteLength)}`,
      );
      appendVaultItem(id, file);
      addAudit('FILE_ENCRYPTED', 'DIGITAL VAULT');
    } catch (error) {
      setLocalizedText(fileStatus, '암호화 실패', 'Encryption failed');
      console.error('File proof failed', error);
    } finally {
      fileInput.value = '';
    }
  });

  const initialize = async (identity) => {
    if (!window.crypto?.subtle) {
      setLocalizedText(keyState, 'Web Crypto를 사용할 수 없음', 'Web Crypto unavailable');
      messageForm?.querySelector('button[type="submit"]')?.setAttribute('disabled', '');
      fileInput?.setAttribute('disabled', '');
      return;
    }

    activeIdentity = identity;
    adminAccess = identity.mode === 'SUPABASE' && String(identity.role).toLowerCase() === 'admin';
    if (adminNav) adminNav.hidden = !adminAccess;
    if (adminOrganization) adminOrganization.textContent = identity.organization.name;
    const shortDeviceId = identity.device.id.split('-')[0].toUpperCase();
    if (deviceId) deviceId.textContent = `${shortDeviceId} / ${identity.device.fingerprint}`;
    messageKey = await createKey();
    setLocalizedText(
      keyState,
      '기기 검증 완료 / 세션 콘텐츠 키 준비됨',
      'Device verified / Session content key ready',
    );
    messageForm?.querySelector('button[type="submit"]')?.removeAttribute('disabled');
    fileInput?.removeAttribute('disabled');
    addAudit('IDENTITY_VERIFIED', identity.mode);
    addAudit('DEVICE_KEY_READY', 'TRUST KERNEL');
    if (adminAccess && window.location.hash === '#admin') showView('admin');
  };

  if (viewNames[window.location.hash.slice(1)]) showHashView();
  else showView('signal');

  window.addEventListener('vault:identity-ready', (event) => initialize(event.detail).catch((error) => {
    setLocalizedText(keyState, '초기화 실패', 'Initialization failed');
    console.error('Trust Lab initialization failed', error);
  }), { once: true });
})();
