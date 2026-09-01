(() => {
  const settings = document.querySelector('[data-mobile-settings]');
  const vaultActions = document.querySelector('[data-vault-actions]');
  const settingsFeedback = document.querySelector('[data-mobile-settings-feedback]');
  const installButton = document.querySelector('[data-install-app]');
  const installStatus = document.querySelector('[data-install-status]');
  const passkeyButton = document.querySelector('[data-passkey-register]');
  const passkeyStatus = document.querySelector('[data-passkey-status]');
  let installPrompt = null;

  const setFeedback = (message, isError = false) => {
    if (!settingsFeedback) return;
    settingsFeedback.textContent = message;
    settingsFeedback.classList.toggle('is-error', isError);
  };

  const closeSheets = () => {
    if (settings) settings.hidden = true;
    if (vaultActions) vaultActions.hidden = true;
    document.documentElement.classList.remove('has-mobile-sheet');
    const textForm = document.querySelector('[data-vault-text-form]');
    textForm?.reset();
    if (textForm) textForm.hidden = true;
    document.querySelector('.mobile-action-list')?.removeAttribute('hidden');
  };

  const openSheet = (sheet) => {
    closeSheets();
    if (sheet) sheet.hidden = false;
    document.documentElement.classList.add('has-mobile-sheet');
    sheet?.querySelector('.mobile-sheet__panel')?.focus?.();
  };

  document.querySelectorAll('[data-mobile-settings-open]').forEach((button) => {
    button.addEventListener('click', () => openSheet(settings));
  });

  document.querySelectorAll('[data-sheet-close]').forEach((button) => {
    button.addEventListener('click', closeSheets);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSheets();
  });

  document.querySelector('[data-mobile-sign-out]')?.addEventListener('click', () => {
    document.querySelector('[data-sign-out]')?.click();
  });

  document.querySelector('[data-mobile-admin]')?.addEventListener('click', () => {
    closeSheets();
    window.location.hash = 'admin';
  });

  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  const updateInstallState = () => {
    if (!installButton || !installStatus) return;
    if (isStandalone()) {
      installButton.disabled = true;
      installStatus.textContent = '이 기기에 설치되어 있습니다.';
      return;
    }
    if (installPrompt) {
      installButton.disabled = false;
      installStatus.textContent = '아이콘과 독립 실행 화면을 추가합니다.';
      return;
    }
    if (isIos) {
      installButton.disabled = false;
      installStatus.textContent = 'Safari 공유 버튼에서 홈 화면에 추가하세요.';
      return;
    }
    installButton.disabled = true;
    installStatus.textContent = window.isSecureContext
      ? '브라우저의 설치 메뉴에서도 추가할 수 있습니다.'
      : 'HTTPS 주소에서 설치할 수 있습니다.';
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    updateInstallState();
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    updateInstallState();
    setFeedback('THE VAULT가 이 기기에 설치되었습니다.');
  });

  installButton?.addEventListener('click', async () => {
    if (isIos && !installPrompt) {
      setFeedback('Safari 하단의 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택하세요.');
      return;
    }
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    installPrompt = null;
    setFeedback(choice.outcome === 'accepted'
      ? '설치 요청을 완료했습니다.'
      : '설치를 취소했습니다. 언제든 다시 설치할 수 있습니다.');
    updateInstallState();
  });

  const updatePasskeyState = async () => {
    if (!passkeyButton || !passkeyStatus) return;
    const supported = window.isSecureContext && 'PublicKeyCredential' in window;
    passkeyButton.disabled = !supported;
    if (!supported) {
      passkeyStatus.textContent = window.isSecureContext
        ? '이 브라우저에서 패스키를 지원하지 않습니다.'
        : 'HTTPS 주소에서 연결할 수 있습니다.';
      return;
    }
    try {
      const available = await window.PublicKeyCredential
        .isUserVerifyingPlatformAuthenticatorAvailable();
      passkeyStatus.textContent = available
        ? '지문·Face ID·기기 화면 잠금을 연결합니다.'
        : '보안키 또는 동기화된 패스키를 사용할 수 있습니다.';
    } catch {
      passkeyStatus.textContent = '이 기기의 패스키 지원 여부를 확인하지 못했습니다.';
    }
  };

  passkeyButton?.addEventListener('click', async () => {
    passkeyButton.disabled = true;
    setFeedback('기기의 지문·Face ID·화면 잠금으로 패스키 생성을 승인하세요.');
    try {
      await window.vaultIdentity?.registerPasskey();
      passkeyStatus.textContent = '이 계정에 패스키가 연결되었습니다.';
      setFeedback('다음 로그인부터 패스키를 선택할 수 있습니다. 중요한 작업에는 TOTP 인증이 계속 필요합니다.');
    } catch (error) {
      const disabled = /disabled|not enabled|passkey_disabled/i.test(error?.message || '');
      setFeedback(disabled
        ? 'Supabase의 패스키 기능을 먼저 활성화하고 고정 HTTPS 도메인을 등록해야 합니다.'
        : (error?.message || '패스키를 연결하지 못했습니다.'), true);
      passkeyButton.disabled = false;
    }
  });

  if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((error) => {
        console.warn('THE VAULT service worker registration failed:', error);
      });
    });
  }

  updateInstallState();
  void updatePasskeyState();
})();
