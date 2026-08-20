(() => {
  const gate = document.querySelector('[data-identity-gate]');
  const lab = document.querySelector('[data-lab-shell]');
  const localPanel = document.querySelector('[data-local-panel]');
  const authPanel = document.querySelector('[data-auth-panel]');
  const otpPanel = document.querySelector('[data-otp-panel]');
  const organizationPanel = document.querySelector('[data-organization-panel]');
  const recoveryPanel = document.querySelector('[data-recovery-panel]');
  const localForm = document.querySelector('[data-local-form]');
  const authForm = document.querySelector('[data-auth-form]');
  const otpForm = document.querySelector('[data-otp-form]');
  const organizationForm = document.querySelector('[data-organization-form]');
  const recoveryForm = document.querySelector('[data-recovery-form]');
  const recoveryWordsList = document.querySelector('[data-recovery-words]');
  const recoveryFields = document.querySelector('[data-recovery-fields]');
  const recoveryPrint = document.querySelector('[data-recovery-print]');
  const authModeButtons = [...document.querySelectorAll('[data-auth-mode]')];
  const signupField = document.querySelector('[data-signup-field]');
  const authSubmit = document.querySelector('[data-auth-submit]');
  const feedback = document.querySelector('[data-identity-feedback]');
  const modeLabel = document.querySelector('[data-identity-mode]');
  const stepLabel = document.querySelector('[data-identity-step]');
  const authBoundary = document.querySelector('[data-auth-boundary]');
  const signOut = document.querySelector('[data-sign-out]');
  const identityName = document.querySelector('[data-identity-name]');
  const identityOrganization = document.querySelector('[data-identity-organization]');
  const identityRole = document.querySelector('[data-identity-role]');
  const workspaceIdentity = document.querySelector('[data-workspace-identity]');
  const config = window.VAULT_CONFIG || {};
  const localProfileKey = 'vault.identity.preview';
  const databaseName = 'vault-identity';
  const storeName = 'devices';
  let authMode = 'signin';
  let client = null;
  let activeSession = null;
  let currentIdentity = null;
  let pendingPhone = '';
  let pendingRecoveryIdentity = null;
  let activeRecoveryWords = [];
  let recoveryConfirmationIndices = [];

  const hasRemoteConfig = Boolean(
    config.supabaseUrl
      && config.supabasePublishableKey
      && /^https:\/\/.+\.supabase\.co$/.test(config.supabaseUrl),
  );

  const setFeedback = (message, isError = false) => {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('is-error', isError);
  };

  const setBusy = (form, busy) => {
    form?.querySelectorAll('button, input').forEach((control) => {
      control.disabled = busy;
    });
  };

  const openDeviceDatabase = () => new Promise((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'ownerKey' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const readDevice = async (ownerKey) => {
    const database = await openDeviceDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(ownerKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => database.close();
    });
  };

  const writeDevice = async (device) => {
    const database = await openDeviceDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(device);
      transaction.oncomplete = () => {
        database.close();
        resolve(device);
      };
      transaction.onerror = () => reject(transaction.error);
    });
  };

  const deleteDevice = async (ownerKey) => {
    const database = await openDeviceDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).delete(ownerKey);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  };

  const toHex = (bytes) => [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  const createDevice = async (ownerKey) => {
    const keyPair = await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey', 'deriveBits'],
    );
    const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const publicBytes = new TextEncoder().encode(JSON.stringify(publicKeyJwk));
    const digest = new Uint8Array(await window.crypto.subtle.digest('SHA-256', publicBytes));
    return writeDevice({
      ownerKey,
      id: window.crypto.randomUUID(),
      privateKey: keyPair.privateKey,
      publicKeyJwk,
      fingerprint: toHex(digest.slice(0, 8)).match(/.{1,4}/g).join(':'),
      algorithm: 'ECDH-P256',
      createdAt: new Date().toISOString(),
    });
  };

  const ensureDevice = async (ownerKey) => {
    const existing = await readDevice(ownerKey);
    return existing || createDevice(ownerKey);
  };

  const loadSupabaseLibrary = () => new Promise((resolve, reject) => {
    if (window.supabase?.createClient) {
      resolve(window.supabase);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve(window.supabase);
    script.onerror = () => reject(new Error('Supabase client library could not be loaded.'));
    document.head.appendChild(script);
  });

  const revealWorkspace = (identity) => {
    currentIdentity = identity;
    gate.hidden = true;
    lab.hidden = false;
    identityName.textContent = identity.displayName;
    identityOrganization.textContent = identity.organization.name;
    identityRole.textContent = `${identity.role} / ${identity.mode}`;
    workspaceIdentity.textContent = `${identity.displayName} / ${identity.organization.name}`;
    window.dispatchEvent(new CustomEvent('vault:identity-ready', { detail: identity }));
  };

  const selectConfirmationIndices = () => {
    const selected = new Set();
    while (selected.size < 3) {
      const [byte] = window.crypto.getRandomValues(new Uint8Array(1));
      selected.add(byte % 12);
    }
    return [...selected].sort((a, b) => a - b);
  };

  const showRecoveryPanel = async (identity) => {
    pendingRecoveryIdentity = identity;
    activeRecoveryWords = await window.vaultRecovery.generatePhrase();
    recoveryConfirmationIndices = selectConfirmationIndices();
    localPanel.hidden = true;
    authPanel.hidden = true;
    otpPanel.hidden = true;
    organizationPanel.hidden = true;
    recoveryPanel.hidden = false;
    stepLabel.textContent = '05 / Recovery';
    recoveryWordsList.replaceChildren(...activeRecoveryWords.map((word, index) => {
      const item = document.createElement('li');
      const number = document.createElement('span');
      const value = document.createElement('strong');
      number.textContent = String(index + 1).padStart(2, '0');
      value.textContent = word;
      item.append(number, value);
      return item;
    }));
    recoveryFields.replaceChildren(...recoveryConfirmationIndices.map((index) => {
      const wrapper = document.createElement('label');
      const label = document.createElement('span');
      const input = document.createElement('input');
      label.textContent = `${index + 1}번 코드워드`;
      input.name = `word-${index}`;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.required = true;
      wrapper.append(label, input);
      return wrapper;
    }));
    setFeedback('복구키를 오프라인에 기록한 뒤 세 코드워드로 보관 여부를 확인하세요.');
  };

  const hasRemoteRecovery = async (userId) => {
    const { data, error } = await client
      .from('recovery_credentials')
      .select('issued_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data?.issued_at);
  };

  const syncRemoteDevice = async (user, organization, device) => {
    const { error } = await client.from('devices').upsert({
      id: device.id,
      user_id: user.id,
      organization_id: organization.id,
      display_name: navigator.platform || 'Browser device',
      public_key_jwk: device.publicKeyJwk,
      fingerprint: device.fingerprint,
      key_algorithm: device.algorithm,
      status: 'active',
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw error;
  };

  const loadMembership = async (userId) => {
    const { data, error } = await client
      .from('memberships')
      .select('role, organizations(id, name, slug)')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  const completeRemoteIdentity = async (session) => {
    const membership = await loadMembership(session.user.id);
    if (!membership?.organizations) {
      activeSession = session;
      authPanel.hidden = true;
      organizationPanel.hidden = false;
      stepLabel.textContent = '03 / Organization';
      setFeedback('계정이 확인되었습니다. 첫 조직을 생성하세요.');
      return;
    }

    stepLabel.textContent = '04 / Device';
    setFeedback('기기 비공개 키를 확인하고 있습니다.');
    const device = await ensureDevice(`user:${session.user.id}`);
    await syncRemoteDevice(session.user, membership.organizations, device);
    const identity = {
      mode: 'SUPABASE',
      userId: session.user.id,
      displayName: session.user.user_metadata?.vault_id || `vault-${session.user.id.slice(0, 8)}`,
      phone: session.user.phone,
      organization: membership.organizations,
      role: membership.role,
      device,
    };
    if (await hasRemoteRecovery(session.user.id)) revealWorkspace(identity);
    else await showRecoveryPanel(identity);
  };

  const initializeRemote = async () => {
    await loadSupabaseLibrary();
    client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
    modeLabel.textContent = 'SUPABASE CONNECTED';
    authBoundary.textContent = 'Supabase Auth + RLS';
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session) {
      await completeRemoteIdentity(data.session);
      return;
    }
    authPanel.hidden = false;
    setFeedback('휴대폰 번호로 로그인하거나 새 VAULT ID 가입을 신청하세요.');
  };

  const initializeLocal = async () => {
    modeLabel.textContent = 'LOCAL PREVIEW / NO SERVER';
    localPanel.hidden = false;
    const saved = JSON.parse(window.localStorage.getItem(localProfileKey) || 'null');
    if (!saved) {
      setFeedback('Supabase 설정 전입니다. 로컬 프리뷰로 기기 등록을 검증할 수 있습니다.');
      return;
    }
    setFeedback('저장된 로컬 신원을 불러오고 있습니다.');
    const device = await ensureDevice(saved.ownerKey);
    const identity = { ...saved, device, mode: 'LOCAL PREVIEW' };
    if (saved.recoveryIssued) revealWorkspace(identity);
    else await showRecoveryPanel(identity);
  };

  authModeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      authMode = button.dataset.authMode;
      authModeButtons.forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle('is-active', active);
        candidate.setAttribute('aria-selected', String(active));
      });
      const signingUp = authMode === 'signup';
      signupField.hidden = !signingUp;
      authForm.elements.vaultId.required = signingUp;
      authForm.elements.password.autocomplete = signingUp ? 'new-password' : 'current-password';
      authSubmit.firstChild.textContent = signingUp ? '가입 신청 ' : '로그인 ';
      setFeedback(signingUp
        ? '실명은 수집하지 않습니다. 휴대폰 인증 후 VAULT ID가 활성화됩니다.'
        : '등록한 휴대폰 번호와 비밀번호를 입력하세요.');
    });
  });

  authForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(authForm);
    setBusy(authForm, true);
    setFeedback(authMode === 'signup' ? '계정을 생성하고 있습니다.' : '계정을 확인하고 있습니다.');
    const phone = String(formData.get('phone') || '').replace(/[\s()-]/g, '');
    const password = String(formData.get('password') || '');
    try {
      if (authMode === 'signup') {
        const vaultId = String(formData.get('vaultId') || '').trim().toLowerCase();
        const { data, error } = await client.auth.signUp({
          phone,
          password,
          options: { channel: 'sms', data: { vault_id: vaultId } },
        });
        if (error) throw error;
        if (!data.session) {
          pendingPhone = phone;
          authPanel.hidden = true;
          otpPanel.hidden = false;
          stepLabel.textContent = '02 / Phone';
          setFeedback('6자리 일회용 인증번호를 문자로 보냈습니다.');
          return;
        }
        await completeRemoteIdentity(data.session);
      } else {
        const { data, error } = await client.auth.signInWithPassword({ phone, password });
        if (error) throw error;
        await completeRemoteIdentity(data.session);
      }
    } catch (error) {
      setFeedback(error.message || '인증을 완료하지 못했습니다.', true);
    } finally {
      setBusy(authForm, false);
    }
  });

  otpForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(otpForm);
    setBusy(otpForm, true);
    setFeedback('휴대폰 인증번호를 확인하고 있습니다.');
    try {
      const { data, error } = await client.auth.verifyOtp({
        phone: pendingPhone,
        token: String(formData.get('token') || '').trim(),
        type: 'sms',
      });
      if (error) throw error;
      otpPanel.hidden = true;
      await completeRemoteIdentity(data.session);
    } catch (error) {
      setFeedback(error.message || '인증번호를 확인하지 못했습니다.', true);
    } finally {
      setBusy(otpForm, false);
    }
  });

  organizationForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeSession) return;
    const formData = new FormData(organizationForm);
    setBusy(organizationForm, true);
    setFeedback('조직 경계와 관리자 역할을 생성하고 있습니다.');
    const organizationName = String(formData.get('organizationName') || '').trim();
    try {
      const { error } = await client.rpc('create_organization', {
        organization_name: organizationName,
      });
      if (error) throw error;
      await completeRemoteIdentity(activeSession);
    } catch (error) {
      setFeedback(error.message || '조직을 생성하지 못했습니다.', true);
    } finally {
      setBusy(organizationForm, false);
    }
  });

  localForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(localForm);
    setBusy(localForm, true);
    setFeedback('비추출 기기 키를 생성하고 있습니다.');
    const saved = {
      ownerKey: `local:${window.crypto.randomUUID()}`,
      userId: null,
      displayName: String(formData.get('vaultId') || '').trim().toLowerCase(),
      organization: {
        id: null,
        name: String(formData.get('organizationName') || '').trim(),
        slug: null,
      },
      role: 'ADMIN',
      recoveryIssued: false,
    };
    try {
      const device = await ensureDevice(saved.ownerKey);
      window.localStorage.setItem(localProfileKey, JSON.stringify(saved));
      await showRecoveryPanel({ ...saved, device, mode: 'LOCAL PREVIEW' });
    } catch (error) {
      setFeedback(error.message || '기기를 등록하지 못했습니다.', true);
      setBusy(localForm, false);
    }
  });

  recoveryPrint?.addEventListener('click', () => window.print());

  recoveryForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(recoveryForm);
    const verified = recoveryConfirmationIndices.every((index) => (
      String(formData.get(`word-${index}`) || '').trim().toLowerCase()
        === activeRecoveryWords[index]
    ));
    if (!verified) {
      setFeedback('코드워드가 일치하지 않습니다. 표시된 복구키를 다시 확인하세요.', true);
      return;
    }

    setBusy(recoveryForm, true);
    setFeedback('복구키 원문을 폐기하고 검증값만 등록하고 있습니다.');
    try {
      const recoveryVerifier = await window.vaultRecovery.verifier(activeRecoveryWords);
      if (client) {
        const { error } = await client.rpc('register_recovery_credential', {
          recovery_verifier: recoveryVerifier,
        });
        if (error) throw error;
      } else {
        const saved = JSON.parse(window.localStorage.getItem(localProfileKey) || 'null');
        saved.recoveryIssued = true;
        saved.recoveryVerifier = recoveryVerifier;
        window.localStorage.setItem(localProfileKey, JSON.stringify(saved));
      }
      const identity = pendingRecoveryIdentity;
      activeRecoveryWords = [];
      recoveryWordsList.replaceChildren();
      recoveryFields.replaceChildren();
      pendingRecoveryIdentity = null;
      revealWorkspace(identity);
    } catch (error) {
      setFeedback(error.message || '복구키를 등록하지 못했습니다.', true);
      setBusy(recoveryForm, false);
    }
  });

  signOut?.addEventListener('click', async () => {
    signOut.disabled = true;
    if (client) await client.auth.signOut();
    else {
      if (currentIdentity?.ownerKey) await deleteDevice(currentIdentity.ownerKey);
      window.localStorage.removeItem(localProfileKey);
    }
    window.location.reload();
  });

  if (!window.crypto?.subtle || !window.indexedDB) {
    setFeedback('이 브라우저는 기기 키 저장에 필요한 Web Crypto 또는 IndexedDB를 지원하지 않습니다.', true);
    return;
  }

  const start = hasRemoteConfig ? initializeRemote : initializeLocal;
  start().catch((error) => {
    setFeedback(error.message || 'Identity 초기화에 실패했습니다.', true);
    if (hasRemoteConfig) {
      modeLabel.textContent = 'CONNECTION FAILED';
      authBoundary.textContent = 'Unavailable';
    }
  });
})();
