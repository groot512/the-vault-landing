(() => {
  const toggle = document.querySelector('[data-push-toggle]');
  const label = document.querySelector('[data-push-label]');
  const status = document.querySelector('[data-push-status]');
  const title = document.title;
  const bindingKey = 'vault.push.binding.v1';
  let identity = null;
  let registration = null;
  let publicKey = '';
  let enabled = false;
  let busy = false;
  let unread = 0;
  const badges = [...document.querySelectorAll('[data-view-target="signal"]')].map((button) => {
    const badge = document.createElement('span');
    badge.className = 'tessera-unread-badge';
    badge.hidden = true;
    button.appendChild(badge);
    return badge;
  });
  const binding = () => {
    try { return JSON.parse(localStorage.getItem(bindingKey) || 'null'); } catch { return null; }
  };
  const note = (text) => { if (status) status.textContent = text; };
  const updateToggle = () => {
    if (toggle) {
      toggle.disabled = busy || !registration || !publicKey || !identity;
      toggle.setAttribute('aria-pressed', String(enabled));
    }
    if (label) label.textContent = enabled ? '이 기기 알림 끄기' : '새 메시지 알림 받기';
  };
  const bytes = (key) => Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const tellWorker = async (message) => {
    const worker = registration?.active;
    if (!worker) throw new Error('앱 업데이트 중입니다. 잠시 후 다시 시도하세요.');
    await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => reject(new Error('알림 설정 응답이 없습니다. 앱을 다시 열어주세요.')), 5000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        channel.port1.close();
        event.data?.ok ? resolve() : reject(new Error('알림 설정을 저장하지 못했습니다.'));
      };
      worker.postMessage(message, [channel.port2]);
    });
  };
  const setUnread = (value) => {
    unread = Number.isFinite(Number(value)) ? Math.min(9999, Math.max(0, Math.floor(Number(value)))) : 0;
    badges.forEach((badge) => {
      badge.hidden = unread === 0;
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.setAttribute('aria-label', `안 읽은 메시지 ${unread}개`);
    });
    document.title = unread ? `(${unread > 99 ? '99+' : unread}) ${title}` : title;
    const task = unread ? navigator.setAppBadge?.(unread) : navigator.clearAppBadge?.();
    task?.catch(() => {});
    if (!unread && registration?.active) {
      registration.active.postMessage({ type: 'VAULT_PUSH_READ', subscriptionId: binding()?.id });
    }
  };
  // Explicit logout first removes the server subscription. Do not pretend it
  // succeeded offline. No session token or private content goes to the worker.
  const disable = async () => {
    const saved = binding();
    if (saved && identity?.userId === saved.userId) await window.vaultIdentity.removePush(saved.id);
    if (registration) {
      const sub = await registration.pushManager.getSubscription();
      if (saved || sub) await tellWorker({ type: 'VAULT_PUSH_BIND', subscriptionId: null });
      if (sub && !await sub.unsubscribe()) throw new Error('브라우저 알림 해제에 실패했습니다.');
    }
    localStorage.removeItem(bindingKey);
    enabled = false;
    setUnread(0);
    updateToggle();
    note('이 기기에서는 알림을 받지 않습니다.');
  };
  window.vaultNotifications = Object.freeze({ setUnread, disable });

  const initialize = async (actor) => {
    identity = actor?.mode === 'SUPABASE' ? actor : null;
    if (!identity) { note('실제 계정으로 로그인한 뒤 사용할 수 있습니다.'); return; }
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      note('이 환경은 푸시를 지원하지 않습니다. iPhone은 Safari에서 홈 화면에 설치한 앱으로 열어주세요.');
      return;
    }
    try {
      registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('앱을 닫았다가 다시 열어주세요.')), 10000)),
      ]);
      let saved = binding();
      const sub = await registration.pushManager.getSubscription();
      if (saved && (saved.userId !== identity.userId || saved.deviceId !== identity.device.id)) {
        // An origin shares its push subscription across accounts. Never rebind
        // another account's endpoint; discard it and require a fresh opt-in.
        await tellWorker({ type: 'VAULT_PUSH_BIND', subscriptionId: null });
        if (sub && !await sub.unsubscribe()) throw new Error('이전 계정 알림을 해제한 후 다시 시도하세요.');
        localStorage.removeItem(bindingKey);
        saved = null;
      }
      const config = await window.vaultIdentity.pushConfig();
      publicKey = config?.enabled && /^[A-Za-z0-9_-]{87}$/.test(config.publicKey || '') ? config.publicKey : '';
      if (!publicKey) { note('서버 알림 연결 준비 중입니다. 앱 안의 안 읽은 숫자는 사용할 수 있습니다.'); return; }
      enabled = Boolean(saved && sub && Notification.permission === 'granted');
      if (enabled) {
        const id = await window.vaultIdentity.registerPush(sub.toJSON());
        localStorage.setItem(bindingKey, JSON.stringify({ id, userId: identity.userId, deviceId: identity.device.id }));
        await tellWorker({ type: 'VAULT_PUSH_BIND', subscriptionId: id });
      }
      note(Notification.permission === 'denied'
        ? '알림이 차단되어 있습니다. 휴대폰 또는 브라우저 사이트 설정에서 알림을 허용하세요.'
        : enabled ? '알림 사용 중 · 대화 내용은 표시하지 않습니다.' : '눌러서 허용하면 앱을 닫아도 새 메시지 알림을 받을 수 있습니다.');
    } catch {
      note('알림 서버 또는 앱 연결을 확인하지 못했습니다. 앱을 다시 열어주세요.');
    } finally { updateToggle(); }
  };
  toggle?.addEventListener('click', async () => {
    if (busy || !identity || !registration || !publicKey) return;
    busy = true;
    updateToggle();
    let newlySubscribed = null;
    try {
      if (enabled) { await disable(); return; }
      // Request permission directly from the user's tap (required by iOS).
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        note(permission === 'denied' ? '알림이 차단되었습니다. 사이트 설정에서 허용할 수 있습니다.' : '알림 허용을 취소했습니다. 언제든 다시 설정할 수 있습니다.');
        return;
      }
      const previous = await registration.pushManager.getSubscription();
      if (previous && !await previous.unsubscribe()) throw new Error('기존 알림 설정을 해제하지 못했습니다.');
      newlySubscribed = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(publicKey) });
      const id = await window.vaultIdentity.registerPush(newlySubscribed.toJSON());
      localStorage.setItem(bindingKey, JSON.stringify({ id, userId: identity.userId, deviceId: identity.device.id }));
      await tellWorker({ type: 'VAULT_PUSH_BIND', subscriptionId: id });
      enabled = true;
      setUnread(unread);
      note('알림을 켰습니다. 다른 계정에서 메시지를 보내 잠금화면 알림을 확인해보세요.');
    } catch {
      if (newlySubscribed) await newlySubscribed.unsubscribe().catch(() => {});
      note('알림 연결에 실패했습니다. 연결 상태와 서버 설정을 확인하고 다시 시도하세요.');
    } finally { busy = false; updateToggle(); }
  });
  window.addEventListener('vault:identity-ready', (event) => void initialize(event.detail));
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type !== 'VAULT_PUSH_OPEN') return;
    window.location.hash = 'signal';
    document.querySelector('[data-conversation-back]')?.click();
  });
  window.addEventListener('vault:identity-conflict', () => {
    identity = null;
    enabled = false;
    setUnread(0);
    updateToggle();
    // Auth may already belong to a different account: only local cleanup here.
    if (registration) {
      void tellWorker({ type: 'VAULT_PUSH_BIND', subscriptionId: null }).catch(() => {});
      void registration.pushManager.getSubscription().then((sub) => sub?.unsubscribe()).catch(() => {});
    }
    localStorage.removeItem(bindingKey);
  });
})();
