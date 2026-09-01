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
  const messageFileInput = document.querySelector('[data-message-file-input]');
  const messageFileTrigger = document.querySelector('[data-message-file-trigger]');
  const contactSelect = document.querySelector('[data-contact-select]');
  const contactRefresh = document.querySelector('[data-contact-refresh]');
  const contactSearch = document.querySelector('[data-contact-search]');
  const contactList = document.querySelector('[data-contact-list]');
  const messageFeedback = document.querySelector('[data-message-feedback]');
  const composerFeedback = document.querySelector('[data-composer-feedback]');
  const messageNetwork = document.querySelector('[data-message-network]');
  const signalSummary = document.querySelector('[data-signal-summary]');
  const tesseraShell = document.querySelector('[data-tessera-shell]');
  const selfNickname = document.querySelector('[data-self-nickname]');
  const selfVaultId = document.querySelector('[data-self-vault-id]');
  const selfAvatar = document.querySelector('[data-self-avatar]');
  const nicknameToggle = document.querySelector('[data-nickname-toggle]');
  const nicknameForm = document.querySelector('[data-nickname-form]');
  const nicknameInput = document.querySelector('#tessera-nickname');
  const contactName = document.querySelector('[data-contact-name]');
  const contactMeta = document.querySelector('[data-contact-meta]');
  const contactAvatar = document.querySelector('[data-contact-avatar]');
  const conversationBack = document.querySelector('[data-conversation-back]');
  const securityToggle = document.querySelector('[data-security-toggle]');
  const securityClose = document.querySelector('[data-security-close]');
  const securityPanel = document.querySelector('[data-security-panel]');
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
  const memberList = document.querySelector('[data-member-list]');
  const memberFeedback = document.querySelector('[data-member-feedback]');
  const memberRefresh = document.querySelector('[data-member-refresh]');
  const vaultItems = new Map();
  let messageKey = null;
  let tesseraContacts = [];
  let conversationSummaries = new Map();
  let activeContact = null;
  let unsubscribeMessages = null;
  const renderedMessageIds = new Set();
  let realtimeSubscribedOnce = false;
  let reconnectSyncPromise = null;
  let activeIdentity = null;
  let issuedCredentials = null;
  let adminAccess = false;
  let memberLoading = false;
  let memberRecords = [];
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

  const base64ToBytes = (value) => {
    const binary = window.atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
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

  const createPortableFileKey = () => window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
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

  const derivePeerKey = async (contact, info) => {
    const peerKey = await window.crypto.subtle.importKey(
      'jwk',
      contact.publicKeyJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );
    const sharedBits = await window.crypto.subtle.deriveBits({
      name: 'ECDH',
      public: peerKey,
    }, activeIdentity.device.privateKey, 256);
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      sharedBits,
      'HKDF',
      false,
      ['deriveKey'],
    );
    const devicePair = [activeIdentity.device.id, contact.deviceId].sort().join(':');
    const salt = await window.crypto.subtle.digest(
      'SHA-256',
      encoder.encode(`TESSERA:${activeIdentity.organization.id}:${devicePair}`),
    );
    return window.crypto.subtle.deriveKey({
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: encoder.encode(info),
    }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  };

  const deriveTesseraKey = (contact) => derivePeerKey(contact, 'TESSERA-MESSAGE-MVP-V1');

  const deriveVaultShareKey = (contact) => derivePeerKey(contact, 'TESSERA-VAULT-FILE-KEY-V1');

  const deriveVaultWrappingKey = () => deriveTesseraKey({
    deviceId: activeIdentity.device.id,
    publicKeyJwk: activeIdentity.device.publicKeyJwk,
  });

  const digestBase64 = async (bytes) => bytesToBase64(new Uint8Array(
    await window.crypto.subtle.digest('SHA-256', bytes),
  ));

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
    if (permittedName === 'admin' && adminAccess) void loadMembers();
  };

  navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.dataset.viewTarget;
      showView(name);
      window.history.replaceState(null, '', `#${name}`);
      if (name === 'signal') acknowledgeVisibleConversation();
    });
  });

  const showHashView = () => {
    const name = window.location.hash.slice(1);
    if (viewNames[name]) showView(name);
  };

  window.addEventListener('hashchange', showHashView);

  const setMessageFeedback = (ko, en, isError = false) => {
    setLocalizedText(messageFeedback, ko, en);
    messageFeedback?.classList.toggle('is-error', isError);
    setLocalizedText(composerFeedback, ko, en);
    if (composerFeedback) composerFeedback.hidden = false;
    composerFeedback?.classList.toggle('is-error', isError);
  };

  const messageErrorText = (error) => {
    if (error?.message === 'SESSION_CONFLICT') {
      return pick(
        '다른 탭에서 로그인 계정이 바뀌었습니다. 서로 다른 계정 테스트는 다른 브라우저나 Chrome 프로필을 사용하세요.',
        'The account changed in another tab. Use separate browsers or Chrome profiles to test two accounts.',
      );
    }
    const message = error?.message || pick('알 수 없는 오류', 'Unknown error');
    return error?.code ? `${message} (${error.code})` : message;
  };

  const contactLabel = (contact) => contact?.nickname || contact?.vaultId || pick('알 수 없는 사용자', 'Unknown user');

  const avatarLetter = (value) => [...String(value || 'V').trim()][0]?.toUpperCase() || 'V';

  const renderSelfProfile = () => {
    const vaultId = activeIdentity?.vaultId || activeIdentity?.displayName || 'VAULT ID';
    const nickname = activeIdentity?.nickname || pick('별명 미설정', 'Nickname not set');
    if (selfNickname) selfNickname.textContent = nickname;
    if (selfVaultId) selfVaultId.textContent = `@${vaultId}`;
    if (selfAvatar) selfAvatar.textContent = avatarLetter(activeIdentity?.nickname || vaultId);
    if (nicknameInput) nicknameInput.value = activeIdentity?.nickname || '';
  };

  const renderConversationHead = () => {
    if (!activeContact) {
      setLocalizedText(contactName, '대화를 선택하세요', 'Choose a conversation');
      setLocalizedText(
        contactMeta,
        '같은 조직의 구성원을 선택하면 대화를 시작할 수 있습니다.',
        'Choose a member in your organization to start messaging.',
      );
      if (contactAvatar) contactAvatar.textContent = 'T';
      tesseraShell?.classList.remove('has-conversation');
      return;
    }
    if (contactName) contactName.textContent = contactLabel(activeContact);
    if (contactMeta) {
      const deviceCount = tesseraContacts.filter((contact) => (
        contact.userId === activeContact.userId && contact.deviceId
      )).length;
      contactMeta.textContent = activeContact.deviceId
        ? `@${activeContact.vaultId} · ${pick(`${deviceCount}개 기기 암호화`, `${deviceCount} encrypted device${deviceCount === 1 ? '' : 's'}`)}`
        : `@${activeContact.vaultId} · ${pick('기기 미등록', 'No registered device')}`;
    }
    if (contactAvatar) contactAvatar.textContent = avatarLetter(contactLabel(activeContact));
    tesseraShell?.classList.add('has-conversation');
  };

  const formatMessageTime = (value = new Date()) => new Intl.DateTimeFormat(
    window.vaultI18n?.current() === 'en' ? 'en-GB' : 'ko-KR',
    { hour: '2-digit', minute: '2-digit', hour12: false },
  ).format(new Date(value));

  const formatConversationTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    const today = new Date();
    const sameDay = date.getFullYear() === today.getFullYear()
      && date.getMonth() === today.getMonth()
      && date.getDate() === today.getDate();
    return new Intl.DateTimeFormat(
      window.vaultI18n?.current() === 'en' ? 'en-GB' : 'ko-KR',
      sameDay ? { hour: '2-digit', minute: '2-digit', hour12: false } : { month: '2-digit', day: '2-digit' },
    ).format(date);
  };

  const receiptLabel = (message) => {
    if (message?.read_at) return pick('읽음', 'Read');
    if (message?.delivered_at) return pick('전달됨', 'Delivered');
    return pick('전송됨', 'Sent');
  };

  const messageDisplayId = (message) => message?.message_group_id || message?.id || '';

  const receiptRank = (value) => ({ sent: 0, delivered: 1, read: 2 }[value] ?? 0);

  const messageTargetsActiveDevice = (message) => {
    const actorId = activeIdentity?.userId;
    const actorDeviceId = activeIdentity?.device?.id;
    if (!actorId || !actorDeviceId) return false;
    if (message.sender_id === actorId) return message.sender_device_id === actorDeviceId;
    if (message.recipient_id === actorId) return message.recipient_device_id === actorDeviceId;
    return false;
  };

  const updateMessageReceipt = (message) => {
    const displayId = messageDisplayId(message);
    if (!displayId || message.sender_id !== activeIdentity?.userId) return;
    const node = [...(messageStream?.querySelectorAll('[data-message-id]') || [])]
      .find((candidate) => candidate.dataset.messageId === displayId);
    const state = node?.querySelector('[data-message-state]');
    if (!state) return;
    const nextReceipt = message.read_at ? 'read' : (message.delivered_at ? 'delivered' : 'sent');
    if (receiptRank(nextReceipt) < receiptRank(state.dataset.receipt)) return;
    state.textContent = receiptLabel(message);
    state.dataset.receipt = nextReceipt;
  };

  const appendMessage = (text, {
    mine = true,
    sender: senderName = activeIdentity?.displayName || pick('인증된 사용자', 'Verified User'),
    createdAt = new Date().toISOString(),
    id = '',
    failed = false,
    system = false,
    deliveredAt = null,
    readAt = null,
    attachment = null,
  } = {}) => {
    if (id && renderedMessageIds.has(id)) return;
    if (id) renderedMessageIds.add(id);
    if (!system) messageStream?.querySelectorAll('[data-empty-conversation]').forEach((item) => item.remove());
    const message = document.createElement('article');
    message.className = `message ${system ? 'message--system' : (failed ? 'message--failed' : (mine ? 'message--mine' : 'message--theirs'))}`;
    if (id) message.dataset.messageId = id;
    if (system) message.dataset.emptyConversation = '';
    const sender = document.createElement('span');
    sender.textContent = `${failed ? 'TRUST KERNEL' : senderName} · ${formatMessageTime(createdAt)}`;
    const body = document.createElement('p');
    if (attachment) {
      const attachmentButton = document.createElement('button');
      attachmentButton.type = 'button';
      attachmentButton.className = 'message__attachment';
      attachmentButton.innerHTML = `<span>${pick('암호화 파일', 'Encrypted file')}</span><strong></strong><small>${pick('디지털 볼트에서 열기', 'Open in Digital Vault')} →</small>`;
      attachmentButton.querySelector('strong').textContent = attachment.name;
      attachmentButton.addEventListener('click', async () => {
        showView('archive');
        window.history.replaceState(null, '', '#archive');
        try {
          await loadPersistentVaultFiles();
        } catch (error) {
          setLocalizedText(fileStatus, `파일 목록을 불러오지 못했습니다: ${messageErrorText(error)}`, `Could not load files: ${messageErrorText(error)}`);
        }
      });
      body.appendChild(attachmentButton);
    } else {
      body.textContent = text;
    }
    message.append(sender, body);
    if (mine && !system && !failed) {
      const state = document.createElement('small');
      state.className = 'message__state';
      state.dataset.messageState = '';
      state.dataset.receipt = readAt ? 'read' : (deliveredAt ? 'delivered' : 'sent');
      state.textContent = receiptLabel({ delivered_at: deliveredAt, read_at: readAt });
      message.appendChild(state);
    }
    messageStream?.appendChild(message);
    message.scrollIntoView({ block: 'nearest' });
  };

  const contactForMessage = (message) => {
    if (!activeContact) return null;
    const peerDeviceId = message.sender_id === activeIdentity.userId
      ? message.recipient_device_id
      : message.sender_device_id;
    return tesseraContacts.find((contact) => (
      contact.userId === activeContact.userId && contact.deviceId === peerDeviceId
    )) || null;
  };

  const decryptTesseraMessage = async (message) => {
    const contact = contactForMessage(message);
    if (!contact) throw new Error('Message device key is unavailable.');
    const key = await deriveTesseraKey(contact);
    const decrypted = await decryptBytes(
      key,
      base64ToBytes(message.iv),
      base64ToBytes(message.ciphertext),
    );
    return decoder.decode(decrypted);
  };

  const conversationIsVisible = () => {
    const signalView = document.querySelector('[data-view="signal"]');
    const mobileDirectoryOpen = window.matchMedia('(max-width: 720px)').matches
      && !tesseraShell?.classList.contains('has-conversation');
    return document.visibilityState === 'visible'
      && !signalView?.hidden
      && !mobileDirectoryOpen;
  };

  const acknowledgeActiveConversation = async (state = 'delivered') => {
    if (activeIdentity?.mode !== 'SUPABASE' || !activeContact?.userId) return;
    const receipts = await window.vaultIdentity.acknowledgeTesseraMessages({
      organizationId: activeIdentity.organization.id,
      senderId: activeContact.userId,
      recipientDeviceId: activeIdentity.device.id,
      state,
    });
    receipts.forEach(updateMessageReceipt);
    if (state === 'read' && receipts.length) {
      const summary = conversationSummaries.get(activeContact.userId);
      if (summary) conversationSummaries.set(activeContact.userId, { ...summary, unreadCount: 0 });
      renderContactDirectory();
    }
  };

  const acknowledgeLoadedConversation = async () => {
    try {
      await acknowledgeActiveConversation('delivered');
      if (conversationIsVisible()) await acknowledgeActiveConversation('read');
    } catch (error) {
      console.warn('Message receipt could not be synchronized:', messageErrorText(error));
    }
  };

  const renderRemoteMessage = async (message, { acknowledge = true } = {}) => {
    if (!activeContact) return;
    if (!messageTargetsActiveDevice(message)) return;
    const actorId = activeIdentity.userId;
    const belongsToActiveConversation = (
      (message.sender_id === actorId && message.recipient_id === activeContact.userId)
      || (message.sender_id === activeContact.userId && message.recipient_id === actorId)
    );
    if (!belongsToActiveConversation) return;
    const displayId = messageDisplayId(message);
    if (renderedMessageIds.has(displayId)) {
      updateMessageReceipt(message);
      return;
    }
    try {
      const plain = await decryptTesseraMessage(message);
      let attachment = null;
      try {
        const parsed = JSON.parse(plain);
        if (parsed?.v === 1 && parsed?.kind === 'vault-file' && parsed?.fileId && parsed?.name) {
          attachment = parsed;
        }
      } catch {
        // Normal text messages are intentionally not JSON.
      }
      const mine = message.sender_id === actorId;
      appendMessage(attachment ? attachment.name : plain, {
        mine,
        sender: mine ? activeIdentity.displayName : activeContact.vaultId,
        createdAt: message.created_at,
        id: displayId,
        deliveredAt: message.delivered_at,
        readAt: message.read_at,
        attachment,
      });
      if (attachment && !mine) {
        try {
          await loadPersistentVaultFiles();
        } catch (error) {
          console.warn('Shared vault file could not be synchronized:', messageErrorText(error));
        }
      }
      if (!mine && acknowledge) await acknowledgeLoadedConversation();
    } catch {
      appendMessage(
        pick('이 기기에서는 메시지를 복호화할 수 없습니다.', 'This device cannot decrypt the message.'),
        { mine: false, createdAt: message.created_at, id: displayId, failed: true },
      );
    }
  };

  const loadConversation = async () => {
    renderedMessageIds.clear();
    messageStream?.replaceChildren();
    if (!activeContact) {
      setMessageFeedback('대화할 구성원 기기를 선택하세요.', 'Choose a member device to start a conversation.');
      return;
    }
    setMessageFeedback(`${activeContact.vaultId}의 암호문을 불러오고 있습니다.`, `Loading ciphertext for ${activeContact.vaultId}.`);
    try {
      const messages = await window.vaultIdentity.listTesseraMessages(
        activeIdentity.organization.id,
        activeContact.userId,
        activeIdentity.device.id,
      );
      if (!messages.length) {
        appendMessage(
          pick('아직 메시지가 없습니다. 첫 암호화 메시지를 전송하세요.', 'No messages yet. Send the first encrypted message.'),
          { mine: false, sender: 'TRUST KERNEL', system: true },
        );
      } else {
        for (const message of messages) await renderRemoteMessage(message, { acknowledge: false });
        await acknowledgeLoadedConversation();
      }
      setMessageFeedback(
        `${activeContact.vaultId} · ${tesseraContacts.filter((contact) => contact.userId === activeContact.userId && contact.deviceId).length}개 기기 · 암호화 채널 준비`,
        `${activeContact.vaultId} · ${tesseraContacts.filter((contact) => contact.userId === activeContact.userId && contact.deviceId).length} devices · encrypted channel ready`,
      );
    } catch (error) {
      setMessageFeedback(
        `대화를 불러오지 못했습니다: ${messageErrorText(error)}`,
        `Conversation failed to load: ${messageErrorText(error)}`,
        true,
      );
    }
  };

  const normalizeContact = (contact) => ({
    userId: contact.user_id,
    vaultId: contact.vault_id,
    nickname: contact.nickname,
    deviceId: contact.device_id,
    publicKeyJwk: contact.public_key_jwk,
    fingerprint: contact.fingerprint,
    lastSeenAt: contact.last_seen_at,
  });

  const directoryPeople = () => {
    const people = new Map();
    tesseraContacts.forEach((contact) => {
      const existing = people.get(contact.userId);
      if (!existing || (!existing.deviceId && contact.deviceId)) people.set(contact.userId, contact);
    });
    return [...people.values()]
      .map((contact) => ({
        ...contact,
        ...(conversationSummaries.get(contact.userId) || {}),
      }))
      .sort((left, right) => {
        const activity = new Date(right.lastMessageAt || 0) - new Date(left.lastMessageAt || 0);
        return activity || contactLabel(left).localeCompare(contactLabel(right));
      });
  };

  const loadTesseraSummaries = async () => {
    if (activeIdentity?.mode !== 'SUPABASE') return;
    const summaries = await window.vaultIdentity.listTesseraConversationSummaries(
      activeIdentity.organization.id,
      activeIdentity.device.id,
    );
    conversationSummaries = new Map(summaries.map((summary) => [summary.user_id, {
      lastMessageAt: summary.last_message_at,
      unreadCount: Number(summary.unread_count || 0),
    }]));
    renderContactDirectory();
  };

  const renderContactDirectory = () => {
    if (!contactList) return;
    const query = String(contactSearch?.value || '').trim().toLocaleLowerCase();
    const matches = directoryPeople().filter((contact) => (
      !query
      || contact.vaultId.toLocaleLowerCase().includes(query)
      || String(contact.nickname || '').toLocaleLowerCase().includes(query)
    ));
    contactList.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.textContent = query
        ? pick('검색 결과가 없습니다.', 'No matching people found.')
        : pick('같은 조직의 다른 구성원이 없습니다.', 'No other members in this organization.');
      contactList.appendChild(empty);
      return;
    }
    matches.forEach((contact) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'contact-item';
      button.disabled = !contact.deviceId;
      button.classList.toggle('is-active', activeContact?.userId === contact.userId);
      button.setAttribute('aria-pressed', String(activeContact?.userId === contact.userId));

      const avatar = document.createElement('span');
      avatar.className = 'tessera-avatar contact-item__avatar';
      avatar.textContent = avatarLetter(contactLabel(contact));
      avatar.setAttribute('aria-hidden', 'true');

      const identity = document.createElement('div');
      const name = document.createElement('strong');
      const meta = document.createElement('small');
      name.textContent = contactLabel(contact);
      meta.textContent = contact.deviceId
        ? `@${contact.vaultId} · ${contact.lastMessageAt ? formatConversationTime(contact.lastMessageAt) : pick('새 대화', 'New conversation')}`
        : `@${contact.vaultId} · ${pick('기기 미등록', 'No device')}`;
      identity.append(name, meta);

      const activity = document.createElement('span');
      activity.className = 'contact-item__activity';
      if (contact.unreadCount > 0) {
        const unread = document.createElement('strong');
        unread.textContent = contact.unreadCount > 99 ? '99+' : String(contact.unreadCount);
        unread.setAttribute('aria-label', pick(`안 읽은 메시지 ${contact.unreadCount}개`, `${contact.unreadCount} unread messages`));
        activity.appendChild(unread);
      } else {
        const available = document.createElement('i');
        available.setAttribute('aria-label', contact.deviceId ? pick('대화 가능', 'Available') : pick('기기 미등록', 'No device'));
        activity.appendChild(available);
      }
      button.append(avatar, identity, activity);
      button.addEventListener('click', () => {
        activeContact = contact;
        contactSelect.value = contact.deviceId;
        messageFileTrigger?.removeAttribute('disabled');
        renderContactDirectory();
        renderConversationHead();
        void loadConversation();
      });
      contactList.appendChild(button);
    });
  };

  const loadTesseraContacts = async () => {
    if (activeIdentity?.mode !== 'SUPABASE') return;
    contactSelect.disabled = true;
    contactRefresh.disabled = true;
    setMessageFeedback('조직 구성원과 기기 공개키를 확인하고 있습니다.', 'Loading organization members and device public keys.');
    try {
      tesseraContacts = (await window.vaultIdentity.listTesseraContacts(
        activeIdentity.organization.id,
      )).map(normalizeContact);
      await loadTesseraSummaries();
      const previousDeviceId = activeContact?.deviceId || contactSelect.value;
      contactSelect.replaceChildren();
      const messageReadyContacts = tesseraContacts.filter((contact) => contact.deviceId);
      if (!messageReadyContacts.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = pick('대화 가능한 구성원 기기가 없습니다', 'No message-ready member device');
        contactSelect.appendChild(option);
        activeContact = null;
        renderContactDirectory();
        renderConversationHead();
        messageForm?.querySelector('button[type="submit"]')?.setAttribute('disabled', '');
        messageFileTrigger?.setAttribute('disabled', '');
        setMessageFeedback(
          directoryPeople().length
            ? '구성원은 보이지만 등록된 기기가 없습니다. 상대방이 다시 로그인해 기기를 등록해야 합니다.'
            : '같은 조직의 다른 구성원이 없습니다.',
          directoryPeople().length
            ? 'Members were found, but none has a registered device. Ask them to sign in again.'
            : 'No other members were found in this organization.',
        );
        return;
      }
      messageReadyContacts.forEach((contact) => {
        const option = document.createElement('option');
        option.value = contact.deviceId;
        option.textContent = `${contactLabel(contact)} · ${contact.fingerprint}`;
        option.dataset.noI18n = '';
        contactSelect.appendChild(option);
      });
      contactSelect.value = messageReadyContacts.some((contact) => contact.deviceId === previousDeviceId)
        ? previousDeviceId
        : messageReadyContacts[0].deviceId;
      activeContact = tesseraContacts.find((contact) => contact.deviceId === contactSelect.value);
      contactSelect.disabled = false;
      renderContactDirectory();
      renderConversationHead();
      await loadConversation();
      messageForm?.querySelector('button[type="submit"]')?.removeAttribute('disabled');
      messageFileTrigger?.removeAttribute('disabled');
    } catch (error) {
      messageForm?.querySelector('button[type="submit"]')?.setAttribute('disabled', '');
      messageFileTrigger?.setAttribute('disabled', '');
      setMessageFeedback(
        `메시지 기능을 준비하지 못했습니다: ${messageErrorText(error)}`,
        `Messaging could not be prepared: ${messageErrorText(error)}`,
        true,
      );
    } finally {
      contactRefresh.disabled = false;
    }
  };

  const handleRealtimeMessage = async (message) => {
    try {
      await renderRemoteMessage(message);
      await loadTesseraSummaries();
    } catch (error) {
      console.warn('Conversation summary could not be synchronized:', messageErrorText(error));
    }
  };

  const startTesseraSubscription = () => {
    unsubscribeMessages?.();
    unsubscribeMessages = window.vaultIdentity.subscribeTesseraMessages(
      activeIdentity.organization.id,
      (message) => void handleRealtimeMessage(message),
      updateMessageReceipt,
      (status) => {
        if (status === 'SUBSCRIBED') {
          if (messageNetwork) messageNetwork.textContent = 'ONLINE / SYNCED';
          messageForm?.querySelector('button[type="submit"]')?.toggleAttribute('disabled', !activeContact);
          messageFileTrigger?.toggleAttribute('disabled', !activeContact);
          if (realtimeSubscribedOnce && activeContact && !reconnectSyncPromise) {
            reconnectSyncPromise = Promise.all([loadConversation(), loadTesseraSummaries()]).finally(() => {
              reconnectSyncPromise = null;
            });
          }
          realtimeSubscribedOnce = true;
          return;
        }
        if (messageNetwork) messageNetwork.textContent = status;
      },
    );
  };

  contactSelect?.addEventListener('change', () => {
    activeContact = tesseraContacts.find((contact) => contact.deviceId === contactSelect.value) || null;
    messageFileTrigger?.toggleAttribute('disabled', !activeContact);
    renderContactDirectory();
    renderConversationHead();
    void loadConversation();
  });

  contactRefresh?.addEventListener('click', () => void loadTesseraContacts());
  contactSearch?.addEventListener('input', renderContactDirectory);

  conversationBack?.addEventListener('click', () => {
    tesseraShell?.classList.remove('has-conversation');
  });

  const acknowledgeVisibleConversation = () => {
    if (conversationIsVisible()) {
      void acknowledgeActiveConversation('read').catch((error) => {
        console.warn('Read receipt could not be synchronized:', messageErrorText(error));
      });
    }
  };

  document.addEventListener('visibilitychange', acknowledgeVisibleConversation);
  window.addEventListener('focus', acknowledgeVisibleConversation);
  window.addEventListener('offline', () => {
    if (messageNetwork) messageNetwork.textContent = 'OFFLINE';
    messageForm?.querySelector('button[type="submit"]')?.setAttribute('disabled', '');
    messageFileTrigger?.setAttribute('disabled', '');
    setMessageFeedback(
      '네트워크 연결이 끊겼습니다. 작성 중인 내용은 유지되며 재연결 후 대화를 동기화합니다.',
      'You are offline. Your draft is preserved and the conversation will sync after reconnecting.',
    );
  });
  window.addEventListener('online', () => {
    if (activeIdentity?.mode !== 'SUPABASE') return;
    if (messageNetwork) messageNetwork.textContent = 'RECONNECTING';
    startTesseraSubscription();
  });

  const setSecurityPanel = (open) => {
    securityPanel?.classList.toggle('is-open', open);
    securityToggle?.setAttribute('aria-expanded', String(open));
  };

  securityToggle?.addEventListener('click', () => {
    setSecurityPanel(!securityPanel?.classList.contains('is-open'));
  });
  securityClose?.addEventListener('click', () => setSecurityPanel(false));

  nicknameToggle?.addEventListener('click', () => {
    if (activeIdentity?.mode !== 'SUPABASE') return;
    const open = nicknameForm?.hidden ?? true;
    nicknameForm.hidden = !open;
    nicknameToggle.setAttribute('aria-expanded', String(open));
    if (open) nicknameInput?.focus();
  });

  nicknameForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nickname = nicknameInput?.value.trim();
    if (!nickname) return;
    const submit = nicknameForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await window.vaultIdentity.setTesseraNickname(nickname);
      renderSelfProfile();
      nicknameForm.hidden = true;
      nicknameToggle?.setAttribute('aria-expanded', 'false');
      setMessageFeedback('별명을 저장했습니다.', 'Nickname saved.');
    } catch (error) {
      setMessageFeedback(
        `별명을 저장하지 못했습니다: ${messageErrorText(error)}`,
        `Nickname could not be saved: ${messageErrorText(error)}`,
        true,
      );
    } finally {
      submit.disabled = false;
    }
  });

  const activeRecipientDevices = () => [...new Map(
    tesseraContacts
      .filter((contact) => contact.userId === activeContact?.userId && contact.deviceId)
      .map((contact) => [contact.deviceId, contact]),
  ).values()];

  const sendTesseraPayload = async (plainBytes) => {
    if (!activeContact) throw new Error('대화 상대 기기를 선택하세요.');
    const recipientDevices = activeRecipientDevices();
    if (!recipientDevices.length) throw new Error('상대방의 활성 기기가 없습니다.');
    const messageGroupId = window.crypto.randomUUID();
    const envelopes = [];
    const encryptedPayloads = [];
    for (const contact of recipientDevices) {
      const key = await deriveTesseraKey(contact);
      const encrypted = await encryptBytes(key, plainBytes);
      encryptedPayloads.push(encrypted.payload);
      envelopes.push({
        message_group_id: messageGroupId,
        organization_id: activeIdentity.organization.id,
        sender_id: activeIdentity.userId,
        recipient_id: activeContact.userId,
        sender_device_id: activeIdentity.device.id,
        recipient_device_id: contact.deviceId,
        algorithm: 'ECDH-P256/HKDF-SHA256/AES-256-GCM',
        iv: bytesToBase64(encrypted.iv),
        ciphertext: bytesToBase64(encrypted.cipher),
      });
    }
    renderPayload(boundaryOutput, encryptedPayloads[0]);
    const storedMessages = await window.vaultIdentity.sendTesseraMessages(envelopes);
    for (const stored of storedMessages) await renderRemoteMessage(stored);
    await loadTesseraSummaries();
    return { recipientDevices, encryptedPayloads };
  };

  messageForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const plain = messageInput?.value.trim();
    if (!plain) return;
    const plainBytes = encoder.encode(plain);
    if (plainBytes.byteLength > 8000) {
      setMessageFeedback(
        `메시지가 너무 깁니다: ${plainBytes.byteLength.toLocaleString()} / 8,000바이트`,
        `Message is too long: ${plainBytes.byteLength.toLocaleString()} / 8,000 bytes`,
        true,
      );
      return;
    }

    const submit = messageForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    setLocalizedText(boundaryStatus, '브라우저에서 암호화 중', 'Encrypting locally');

    try {
      if (activeIdentity?.mode === 'SUPABASE') {
        const { recipientDevices, encryptedPayloads } = await sendTesseraPayload(plainBytes);
        const totalCiphertextBytes = encryptedPayloads.reduce((total, payload) => total + payload.byteLength, 0);
        setLocalizedText(
          boundaryStatus,
          `${recipientDevices.length}개 기기 암호문 저장 / ${totalCiphertextBytes}바이트`,
          `${recipientDevices.length} device envelope${recipientDevices.length === 1 ? '' : 's'} stored / ${totalCiphertextBytes} bytes`,
        );
        setMessageFeedback(
          `${recipientDevices.length}개 활성 기기로 암호화된 메시지를 전송했습니다.`,
          `Encrypted message sent to ${recipientDevices.length} active device${recipientDevices.length === 1 ? '' : 's'}.`,
        );
      } else {
        if (!messageKey) throw new Error('세션 키가 준비되지 않았습니다.');
        const encrypted = await encryptBytes(messageKey, plainBytes);
        const decrypted = await decryptBytes(messageKey, encrypted.iv, encrypted.cipher);
        const verified = decoder.decode(decrypted) === plain;
        renderPayload(boundaryOutput, encrypted.payload);
        setLocalizedText(
          boundaryStatus,
          verified ? `로컬 검증 / ${encrypted.payload.byteLength}바이트` : '검증 실패',
          verified ? `Local proof / ${encrypted.payload.byteLength} bytes` : 'Verification failed',
        );
        if (verified) appendMessage(plain);
      }
      messageInput.value = '';
      addAudit('MESSAGE_ENCRYPTED', 'TESSERA');
    } catch (error) {
      setLocalizedText(boundaryStatus, '암호화 실패', 'Encryption failed');
      setMessageFeedback(
        `메시지를 전송하지 못했습니다: ${messageErrorText(error)}`,
        `Message could not be sent: ${messageErrorText(error)}`,
        true,
      );
      console.error('Message operation failed:', JSON.stringify({
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      }));
    } finally {
      submit.disabled = activeIdentity?.mode === 'SUPABASE' && !activeContact;
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
    let cipher = item.cipher;
    if (item.remote) {
      setLocalizedText(fileStatus, '암호문 다운로드 중', 'Downloading ciphertext');
      const stored = await window.vaultIdentity.downloadVaultObject(item.objectPath);
      cipher = new Uint8Array(await stored.arrayBuffer());
      const actualDigest = await digestBase64(cipher);
      if (actualDigest !== item.ciphertextSha256) {
        throw new Error('암호문 무결성 검증에 실패했습니다.');
      }
    }
    const decrypted = await decryptBytes(item.key, item.iv, cipher);
    const blob = new Blob([decrypted], { type: item.type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = item.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setLocalizedText(fileStatus, '복호화 다운로드 완료', 'Decrypted download ready');
    addAudit('FILE_DECRYPTED', 'DIGITAL VAULT');
  };

  const revokeVaultItem = async (id, row) => {
    const item = vaultItems.get(id);
    if (!item || item.isOwner === false) return;
    if (item.remote) {
      setLocalizedText(fileStatus, '접근키 폐기 중', 'Revoking file key');
      await window.vaultIdentity.revokeVaultFile(id);
    }
    item.key = null;
    row.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
    });
    const state = row.querySelector('[data-item-state]');
    setLocalizedText(state, '접근키 폐기 / 접근 불가', 'Key revoked / inaccessible');
    setLocalizedText(fileStatus, '접근키 폐기 / 서버 암호문 유지', 'Key revoked / ciphertext retained');
    addAudit('FILE_KEY_REVOKED', 'DIGITAL VAULT');
  };

  const appendVaultItem = (id, file, options = {}) => {
    vaultList?.querySelector('.vault-list__empty')?.remove();
    const row = document.createElement('article');
    row.className = 'vault-item';

    const info = document.createElement('div');
    const state = document.createElement('span');
    state.dataset.itemState = '';
    setLocalizedText(
      state,
      options.revoked
        ? '접근키 폐기 / 접근 불가'
        : `${options.isOwner === false ? '받은 암호화 파일' : (options.remote ? '서버 암호문' : '암호화됨')} / ${formatSize(file.size)}`,
      options.revoked
        ? 'Key revoked / inaccessible'
        : `${options.isOwner === false ? 'Received encrypted file' : (options.remote ? 'Stored ciphertext' : 'Encrypted')} / ${formatSize(file.size)}`,
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
    download.disabled = Boolean(options.revoked);
    download.addEventListener('click', async () => {
      try {
        await downloadVaultItem(id);
      } catch (error) {
        setLocalizedText(
          fileStatus,
          `복호화하지 못했습니다: ${messageErrorText(error)}`,
          `Could not decrypt: ${messageErrorText(error)}`,
        );
      }
    });
    const revoke = document.createElement('button');
    revoke.type = 'button';
    revoke.dataset.ko = '접근키 폐기';
    revoke.dataset.en = 'Revoke';
    revoke.textContent = pick(revoke.dataset.ko, revoke.dataset.en);
    revoke.disabled = Boolean(options.revoked);
    revoke.addEventListener('click', async () => {
      try {
        await revokeVaultItem(id, row);
      } catch (error) {
        setLocalizedText(
          fileStatus,
          `접근키를 폐기하지 못했습니다: ${messageErrorText(error)}`,
          `Could not revoke key: ${messageErrorText(error)}`,
        );
      }
    });
    actions.appendChild(download);
    if (options.isOwner !== false) actions.appendChild(revoke);
    row.append(info, actions);
    vaultList?.prepend(row);
  };

  const unwrapVaultFile = async (record) => {
    const isOwner = !record.owner_id || record.owner_id === activeIdentity.userId;
    if (record.revoked_at || !record.wrapped_key_ciphertext) {
      return {
        id: record.id,
        name: pick('폐기된 암호화 파일', 'Revoked encrypted file'),
        type: 'application/octet-stream',
        size: Number(record.ciphertext_bytes || 0),
        revoked: true,
        isOwner,
      };
    }
    const wrappingKey = isOwner
      ? await deriveVaultWrappingKey()
      : await deriveVaultShareKey({
        deviceId: record.wrapping_device_id,
        publicKeyJwk: record.wrapping_public_key_jwk,
      });
    const rawKey = new Uint8Array(await decryptBytes(
      wrappingKey,
      base64ToBytes(record.wrapped_key_iv),
      base64ToBytes(record.wrapped_key_ciphertext),
    ));
    const key = await window.crypto.subtle.importKey(
      'raw', rawKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    );
    rawKey.fill(0);
    const metadataBytes = await decryptBytes(
      key,
      base64ToBytes(record.metadata_iv),
      base64ToBytes(record.metadata_ciphertext),
    );
    const metadata = JSON.parse(decoder.decode(metadataBytes));
    return {
      id: record.id,
      key,
      iv: base64ToBytes(record.file_iv),
      name: String(metadata.name || pick('암호화 파일', 'Encrypted file')),
      type: String(metadata.type || 'application/octet-stream'),
      size: Number(metadata.size || Math.max(0, Number(record.ciphertext_bytes || 16) - 16)),
      objectPath: record.object_path,
      ciphertextSha256: record.ciphertext_sha256,
      remote: true,
      revoked: false,
      ownerId: record.owner_id,
      isOwner,
    };
  };

  const loadPersistentVaultFiles = async () => {
    if (activeIdentity?.mode !== 'SUPABASE') return;
    setLocalizedText(fileStatus, '서버 암호문 목록 동기화 중', 'Syncing stored ciphertext');
    const records = await window.vaultIdentity.listVaultFiles(
      activeIdentity.organization.id,
      activeIdentity.device.id,
    );
    vaultItems.clear();
    vaultList?.replaceChildren();
    for (const record of [...records].reverse()) {
      const item = await unwrapVaultFile(record);
      vaultItems.set(item.id, item);
      appendVaultItem(item.id, item, { remote: true, revoked: item.revoked, isOwner: item.isOwner });
    }
    if (!records.length && vaultList) {
      const empty = document.createElement('p');
      empty.className = 'vault-list__empty';
      empty.textContent = pick('아직 보관된 암호화 파일이 없습니다.', 'No encrypted files are stored yet.');
      vaultList.append(empty);
    }
    setLocalizedText(
      fileStatus,
      `${records.length}개 암호화 파일 동기화`,
      `${records.length} encrypted file${records.length === 1 ? '' : 's'} synced`,
    );
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

  const memberErrorMessage = (message) => {
    const messages = {
      'Authenticator assurance level 2 required': '인증 앱 검증을 다시 완료한 뒤 시도하세요.',
      'Organization administrator required': '조직 관리자만 구성원 접근을 관리할 수 있습니다.',
      'Unable to verify administrator membership': '관리자 권한을 확인하지 못했습니다.',
      'Unable to load organization members': '조직 구성원 목록을 불러오지 못했습니다.',
      'Unable to load member profiles': '구성원 VAULT ID를 불러오지 못했습니다.',
      'Unable to load member authentication state': '구성원의 로그인 상태를 불러오지 못했습니다.',
      'Administrators cannot change their own access': '관리자는 자신의 접근을 변경할 수 없습니다.',
      'Only member access can be changed': '일반 멤버의 접근만 변경할 수 있습니다.',
      'Unable to update member access': '구성원 접근 상태를 변경하지 못했습니다.',
    };
    return messages[message] || message || '구성원 정보를 처리하지 못했습니다.';
  };

  const formatMemberDate = (value) => {
    if (!value) return pick('기록 없음', 'No record');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return pick('기록 없음', 'No record');
    return new Intl.DateTimeFormat(window.vaultI18n?.current() === 'en' ? 'en-GB' : 'ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  };

  const changeMemberAccess = async (member, action, button) => {
    const restoring = action === 'restore';
    const prompt = restoring
      ? pick(`${member.vaultId}의 접근을 복구할까요?`, `Restore access for ${member.vaultId}?`)
      : pick(`${member.vaultId}의 로그인을 정지할까요? 계정은 삭제되지 않습니다.`, `Suspend sign-in for ${member.vaultId}? The account will not be deleted.`);
    if (!window.confirm(prompt)) return;

    button.disabled = true;
    if (memberRefresh) memberRefresh.disabled = true;
    memberFeedback?.classList.remove('is-error');
    setLocalizedText(
      memberFeedback,
      restoring ? '접근을 복구하고 있습니다.' : '접근을 정지하고 있습니다.',
      restoring ? 'Restoring access.' : 'Suspending access.',
    );
    try {
      await window.vaultIdentity.manageMembers(
        activeIdentity.organization.id,
        action,
        member.userId,
      );
      addAudit(restoring ? 'MEMBER_ACCESS_RESTORED' : 'MEMBER_ACCESS_SUSPENDED', 'ACCESS OFFICE');
      await loadMembers(true);
      setLocalizedText(
        memberFeedback,
        restoring ? `${member.vaultId}의 접근을 복구했습니다.` : `${member.vaultId}의 접근을 정지했습니다.`,
        restoring ? `Access restored for ${member.vaultId}.` : `Access suspended for ${member.vaultId}.`,
      );
    } catch (error) {
      setLocalizedText(memberFeedback, memberErrorMessage(error.message), error.message || 'Member access update failed.');
      memberFeedback?.classList.add('is-error');
    } finally {
      button.disabled = false;
      if (memberRefresh) memberRefresh.disabled = false;
    }
  };

  const renderMembers = () => {
    if (!memberList) return;
    if (!memberRecords.length) {
      const empty = document.createElement('p');
      empty.className = 'member-list__empty';
      setLocalizedText(empty, '등록된 구성원이 없습니다.', 'No organization members found.');
      memberList.replaceChildren(empty);
      return;
    }

    const rows = memberRecords.map((member) => {
      const row = document.createElement('article');
      row.className = 'member-row';

      const identity = document.createElement('div');
      identity.className = 'member-row__identity';
      const vaultId = document.createElement('strong');
      vaultId.textContent = member.vaultId;
      vaultId.dataset.noI18n = '';
      const role = document.createElement('span');
      role.textContent = String(member.role).toUpperCase();
      identity.append(vaultId, role);

      const state = document.createElement('div');
      state.className = `member-row__state is-${member.status}`;
      const stateLabel = document.createElement('strong');
      setLocalizedText(
        stateLabel,
        member.status === 'suspended' ? '접근 정지' : '활성',
        member.status === 'suspended' ? 'Suspended' : 'Active',
      );
      const dates = document.createElement('span');
      dates.textContent = pick(
        `가입 ${formatMemberDate(member.createdAt)} · 최근 로그인 ${formatMemberDate(member.lastSignInAt)}`,
        `Joined ${formatMemberDate(member.createdAt)} · Last sign-in ${formatMemberDate(member.lastSignInAt)}`,
      );
      state.append(stateLabel, dates);

      const action = document.createElement('div');
      action.className = 'member-row__action';
      if (String(member.role).toLowerCase() === 'member') {
        const button = document.createElement('button');
        button.type = 'button';
        const nextAction = member.status === 'suspended' ? 'restore' : 'suspend';
        setLocalizedText(
          button,
          nextAction === 'restore' ? '접근 복구' : '접근 정지',
          nextAction === 'restore' ? 'Restore access' : 'Suspend access',
        );
        button.addEventListener('click', () => changeMemberAccess(member, nextAction, button));
        action.appendChild(button);
      } else {
        const protectedLabel = document.createElement('span');
        setLocalizedText(protectedLabel, '관리자 보호', 'Admin protected');
        action.appendChild(protectedLabel);
      }

      row.append(identity, state, action);
      return row;
    });
    memberList.replaceChildren(...rows);
  };

  const loadMembers = async (force = false) => {
    if (!adminAccess || !activeIdentity?.organization?.id || memberLoading) return;
    if (memberRecords.length && !force) {
      renderMembers();
      return;
    }
    memberLoading = true;
    if (memberRefresh) memberRefresh.disabled = true;
    memberFeedback?.classList.remove('is-error');
    setLocalizedText(memberFeedback, '조직 구성원을 불러오고 있습니다.', 'Loading organization members.');
    try {
      const data = await window.vaultIdentity.manageMembers(activeIdentity.organization.id);
      memberRecords = data.members;
      renderMembers();
      setLocalizedText(memberFeedback, `${memberRecords.length}명의 접근 상태를 확인했습니다.`, `${memberRecords.length} access records loaded.`);
    } catch (error) {
      setLocalizedText(memberFeedback, memberErrorMessage(error.message), error.message || 'Member list failed.');
      memberFeedback?.classList.add('is-error');
    } finally {
      memberLoading = false;
      if (memberRefresh) memberRefresh.disabled = false;
    }
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
      await loadMembers(true);
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

  memberRefresh?.addEventListener('click', () => loadMembers(true));
  window.addEventListener('vault:languagechange', renderMembers);

  const storeVaultFile = async (file, recipientDevices = []) => {
    let uploadedObjectPath = '';
    let registered = false;
    let rawKey = null;
    try {
      const key = activeIdentity?.mode === 'SUPABASE'
        ? await createPortableFileKey()
        : await createKey();
      const plainBytes = new Uint8Array(await file.arrayBuffer());
      const encrypted = await encryptBytes(key, plainBytes);
      const id = activeIdentity?.mode === 'SUPABASE'
        ? window.crypto.randomUUID()
        : makeId(6);
      const item = {
        key,
        iv: encrypted.iv,
        cipher: encrypted.cipher,
        name: file.name,
        type: file.type,
        size: file.size,
      };

      if (activeIdentity?.mode === 'SUPABASE') {
        const metadata = encoder.encode(JSON.stringify({
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
        }));
        const encryptedMetadata = await encryptBytes(key, metadata);
        rawKey = new Uint8Array(await window.crypto.subtle.exportKey('raw', key));
        const wrappingKey = await deriveVaultWrappingKey();
        const wrappedKey = await encryptBytes(wrappingKey, rawKey);
        uploadedObjectPath = `${activeIdentity.organization.id}/${activeIdentity.userId}/${id}.vault`;
        const ciphertextSha256 = await digestBase64(encrypted.cipher);
        await window.vaultIdentity.uploadVaultObject(
          uploadedObjectPath,
          new Blob([encrypted.cipher], { type: 'application/octet-stream' }),
        );
        await window.vaultIdentity.registerVaultFile({
          requested_file_id: id,
          requested_organization_id: activeIdentity.organization.id,
          requested_device_id: activeIdentity.device.id,
          requested_object_path: uploadedObjectPath,
          requested_file_iv: bytesToBase64(encrypted.iv),
          requested_metadata_iv: bytesToBase64(encryptedMetadata.iv),
          requested_metadata_ciphertext: bytesToBase64(encryptedMetadata.cipher),
          requested_ciphertext_bytes: encrypted.cipher.byteLength,
          requested_ciphertext_sha256: ciphertextSha256,
          requested_wrapped_key_iv: bytesToBase64(wrappedKey.iv),
          requested_wrapped_key_ciphertext: bytesToBase64(wrappedKey.cipher),
        });
        registered = true;
        if (recipientDevices.length) {
          const envelopes = [];
          for (const contact of recipientDevices) {
            const shareKey = await deriveVaultShareKey(contact);
            const wrappedShareKey = await encryptBytes(shareKey, rawKey);
            envelopes.push({
              recipient_device_id: contact.deviceId,
              wrapped_key_iv: bytesToBase64(wrappedShareKey.iv),
              wrapped_key_ciphertext: bytesToBase64(wrappedShareKey.cipher),
            });
          }
          await window.vaultIdentity.shareVaultFile({
            fileId: id,
            recipientId: activeContact.userId,
            wrappingDeviceId: activeIdentity.device.id,
            envelopes,
          });
        }
        const protectedKey = await window.crypto.subtle.importKey(
          'raw',
          rawKey,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        );
        Object.assign(item, {
          key: protectedKey,
          objectPath: uploadedObjectPath,
          ciphertextSha256,
          remote: true,
          ownerId: activeIdentity.userId,
          isOwner: true,
        });
        uploadedObjectPath = '';
      }
      return { id, item, encrypted };
    } catch (error) {
      if (uploadedObjectPath && !registered) {
        try {
          await window.vaultIdentity.removeVaultObject(uploadedObjectPath);
        } catch (cleanupError) {
          console.error('Vault object cleanup failed', cleanupError);
        }
      }
      throw error;
    } finally {
      rawKey?.fill(0);
    }
  };

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
      const { id, item, encrypted } = await storeVaultFile(file);
      vaultItems.set(id, item);
      renderPayload(fileOutput, encrypted.payload);
      setLocalizedText(
        fileStatus,
        activeIdentity?.mode === 'SUPABASE'
          ? `서버에 암호문만 보관 / ${formatSize(encrypted.cipher.byteLength)}`
          : `암호화됨 / ${formatSize(encrypted.payload.byteLength)}`,
        activeIdentity?.mode === 'SUPABASE'
          ? `Ciphertext stored / ${formatSize(encrypted.cipher.byteLength)}`
          : `Encrypted / ${formatSize(encrypted.payload.byteLength)}`,
      );
      appendVaultItem(id, file, { remote: activeIdentity?.mode === 'SUPABASE', isOwner: true });
      addAudit('FILE_ENCRYPTED', 'DIGITAL VAULT');
    } catch (error) {
      setLocalizedText(fileStatus, `파일을 보관하지 못했습니다: ${messageErrorText(error)}`, `File could not be stored: ${messageErrorText(error)}`);
      console.error('File proof failed', error);
    } finally {
      fileInput.value = '';
    }
  });

  messageFileTrigger?.addEventListener('click', () => {
    if (!activeContact) {
      setMessageFeedback('먼저 대화 상대를 선택하세요.', 'Choose a conversation first.', true);
      return;
    }
    messageFileInput?.click();
  });

  messageFileInput?.addEventListener('change', async () => {
    const [file] = messageFileInput.files || [];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setMessageFeedback('첨부 파일은 10MB 이하여야 합니다.', 'Attachment must be 10 MB or smaller.', true);
      messageFileInput.value = '';
      return;
    }
    messageFileTrigger.disabled = true;
    setMessageFeedback('파일을 암호화하고 상대방 기기별 접근키를 만들고 있습니다.', 'Encrypting the file and preparing per-device access keys.');
    try {
      if (activeIdentity?.mode !== 'SUPABASE') throw new Error('파일 공유는 서버 인증 모드에서 사용할 수 있습니다.');
      const recipientDevices = activeRecipientDevices();
      if (!recipientDevices.length) throw new Error('상대방의 활성 기기가 없습니다.');
      const { id, item, encrypted } = await storeVaultFile(file, recipientDevices);
      vaultItems.set(id, item);
      appendVaultItem(id, file, { remote: true, isOwner: true });
      renderPayload(fileOutput, encrypted.payload);
      const reference = encoder.encode(JSON.stringify({
        v: 1,
        kind: 'vault-file',
        fileId: id,
        name: file.name,
        size: file.size,
      }));
      const sent = await sendTesseraPayload(reference);
      setLocalizedText(
        boundaryStatus,
        `${sent.recipientDevices.length}개 기기 파일 참조 암호문 저장`,
        `Encrypted file reference stored for ${sent.recipientDevices.length} device${sent.recipientDevices.length === 1 ? '' : 's'}`,
      );
      setMessageFeedback(
        `${file.name} · ${sent.recipientDevices.length}개 기기에 암호화 전달됨`,
        `${file.name} · encrypted for ${sent.recipientDevices.length} device${sent.recipientDevices.length === 1 ? '' : 's'}`,
      );
      setLocalizedText(fileStatus, '파일 공유용 암호문 보관 완료', 'Shared ciphertext stored');
      addAudit('FILE_SHARED', 'TESSERA / DIGITAL VAULT');
    } catch (error) {
      setMessageFeedback(`파일을 보내지 못했습니다: ${messageErrorText(error)}`, `File could not be sent: ${messageErrorText(error)}`, true);
      try {
        await loadPersistentVaultFiles();
      } catch {
        // The owner copy is recovered on the next vault refresh.
      }
    } finally {
      messageFileInput.value = '';
      messageFileTrigger.disabled = !activeContact || !navigator.onLine;
    }
  });

  const initialize = async (identity) => {
    if (!window.crypto?.subtle) {
      setLocalizedText(keyState, 'Web Crypto를 사용할 수 없음', 'Web Crypto unavailable');
      messageForm?.querySelector('button[type="submit"]')?.setAttribute('disabled', '');
      messageFileTrigger?.setAttribute('disabled', '');
      fileInput?.setAttribute('disabled', '');
      return;
    }

    activeIdentity = identity;
    if (!activeIdentity.vaultId) activeIdentity.vaultId = activeIdentity.displayName;
    adminAccess = identity.mode === 'SUPABASE' && String(identity.role).toLowerCase() === 'admin';
    if (adminNav) adminNav.hidden = !adminAccess;
    if (adminOrganization) adminOrganization.textContent = identity.organization.name;
    const shortDeviceId = identity.device.id.split('-')[0].toUpperCase();
    if (deviceId) deviceId.textContent = `${shortDeviceId} / ${identity.device.fingerprint}`;
    renderSelfProfile();
    messageKey = await createKey();
    setLocalizedText(
      keyState,
      '기기 검증 완료 / 세션 콘텐츠 키 준비됨',
      'Device verified / Session content key ready',
    );
    fileInput?.removeAttribute('disabled');
    addAudit('IDENTITY_VERIFIED', identity.mode);
    addAudit('DEVICE_KEY_READY', 'TRUST KERNEL');
    if (identity.mode === 'SUPABASE') {
      setLocalizedText(signalSummary, '1:1 계정 · 다중 기기 암호화 MVP', '1:1 account · multi-device encryption MVP');
      if (messageNetwork) messageNetwork.textContent = 'CONNECTING';
      startTesseraSubscription();
      await loadTesseraContacts();
      try {
        await loadPersistentVaultFiles();
      } catch (error) {
        setLocalizedText(
          fileStatus,
          `디지털 볼트 서버 준비 필요: ${messageErrorText(error)}`,
          `Digital Vault backend required: ${messageErrorText(error)}`,
        );
      }
    } else {
      setLocalizedText(signalSummary, '로컬 암호화 증명 · 네트워크 없음', 'Local encryption proof · no network');
      if (messageNetwork) messageNetwork.textContent = 'DISABLED';
      if (nicknameToggle) nicknameToggle.hidden = true;
      if (contactSelect) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = pick('로컬 라운드트립 시연', 'Local round-trip proof');
        contactSelect.replaceChildren(option);
      }
      setLocalizedText(contactName, '로컬 암호화 시연', 'Local encryption proof');
      setLocalizedText(contactMeta, '서버 전송 없이 이 브라우저에서 왕복 검증합니다.', 'Verified in this browser without server transfer.');
      if (contactAvatar) contactAvatar.textContent = 'L';
      tesseraShell?.classList.add('has-conversation');
      if (contactList) {
        const note = document.createElement('p');
        note.textContent = pick('Supabase 로그인 시 같은 조직의 대화 상대가 여기에 표시됩니다.', 'Organization contacts appear here after Supabase sign-in.');
        contactList.replaceChildren(note);
      }
      setMessageFeedback('로컬 프리뷰에서는 서버 전송 없이 암호화 왕복만 검증합니다.', 'Local preview verifies encryption round-trip without a server.');
      messageForm?.querySelector('button[type="submit"]')?.removeAttribute('disabled');
      messageFileTrigger?.setAttribute('disabled', '');
    }
    if (adminAccess && window.location.hash === '#admin') showView('admin');
  };

  if (viewNames[window.location.hash.slice(1)]) showHashView();
  else showView('signal');

  window.addEventListener('vault:identity-ready', (event) => initialize(event.detail).catch((error) => {
    setLocalizedText(keyState, '초기화 실패', 'Initialization failed');
    console.error('Trust Lab initialization failed', error);
  }), { once: true });

  window.addEventListener('vault:identity-conflict', () => {
    unsubscribeMessages?.();
    messageForm?.querySelector('button[type="submit"]')?.setAttribute('disabled', '');
    messageFileTrigger?.setAttribute('disabled', '');
    if (messageNetwork) messageNetwork.textContent = 'SESSION CONFLICT';
    setMessageFeedback(
      '다른 탭에서 계정이 변경되었습니다. 두 계정 테스트는 서로 다른 브라우저 또는 Chrome 프로필에서 진행하세요.',
      'The account changed in another tab. Use separate browsers or Chrome profiles for two-account testing.',
      true,
    );
  });

  window.addEventListener('beforeunload', () => unsubscribeMessages?.());
})();
