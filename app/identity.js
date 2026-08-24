(() => {
  const gate = document.querySelector('[data-identity-gate]');
  const lab = document.querySelector('[data-lab-shell]');
  const localPanel = document.querySelector('[data-local-panel]');
  const authPanel = document.querySelector('[data-auth-panel]');
  const passwordPanel = document.querySelector('[data-password-panel]');
  const totpSetupPanel = document.querySelector('[data-totp-setup-panel]');
  const totpChallengePanel = document.querySelector('[data-totp-challenge-panel]');
  const organizationPanel = document.querySelector('[data-organization-panel]');
  const recoveryPanel = document.querySelector('[data-recovery-panel]');
  const localForm = document.querySelector('[data-local-form]');
  const authForm = document.querySelector('[data-auth-form]');
  const passwordForm = document.querySelector('[data-password-form]');
  const totpSetupForm = document.querySelector('[data-totp-setup-form]');
  const totpChallengeForm = document.querySelector('[data-totp-challenge-form]');
  const organizationForm = document.querySelector('[data-organization-form]');
  const recoveryForm = document.querySelector('[data-recovery-form]');
  const recoveryWordsList = document.querySelector('[data-recovery-words]');
  const recoveryFields = document.querySelector('[data-recovery-fields]');
  const recoveryPrint = document.querySelector('[data-recovery-print]');
  const authModeButtons = [...document.querySelectorAll('[data-auth-mode]')];
  const accessNote = document.querySelector('[data-access-note]');
  const totpQr = document.querySelector('[data-totp-qr]');
  const totpSecret = document.querySelector('[data-totp-secret]');
  const feedback = document.querySelector('[data-identity-feedback]');
  const modeLabel = document.querySelector('[data-identity-mode]');
  const stepLabel = document.querySelector('[data-identity-step]');
  const authBoundary = document.querySelector('[data-auth-boundary]');
  const authReset = document.querySelector('[data-auth-reset]');
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
  let pendingTotpFactorId = '';
  let pendingRecoveryIdentity = null;
  let activeRecoveryWords = [];
  let recoveryConfirmationIndices = [];

  const readFunctionError = async (error) => {
    try {
      const body = await error?.context?.json();
      if (body?.error) return body.error;
      if (body?.message) return body.message;
    } catch {
      // The response body is optional; fall back to the client error below.
    }
    return error?.message || 'Server request failed.';
  };

  window.vaultIdentity = Object.freeze({
    issueAccount: async (organizationId) => {
      if (!client || currentIdentity?.mode !== 'SUPABASE') {
        throw new Error('Supabase 관리자 세션이 필요합니다.');
      }
      if (String(currentIdentity.role).toLowerCase() !== 'admin') {
        throw new Error('조직 관리자만 계정을 발급할 수 있습니다.');
      }

      const { data, error } = await client.functions.invoke('issue-vault-account', {
        body: { organizationId },
      });
      if (error) throw new Error(await readFunctionError(error));
      if (!data?.account?.vaultId || !data.account.temporaryPassword) {
        throw new Error('발급 결과를 확인하지 못했습니다.');
      }
      return data.account;
    },
    manageMembers: async (organizationId, action = 'list', targetUserId = '') => {
      if (!client || currentIdentity?.mode !== 'SUPABASE') {
        throw new Error('Supabase 관리자 세션이 필요합니다.');
      }
      if (String(currentIdentity.role).toLowerCase() !== 'admin') {
        throw new Error('조직 관리자만 구성원 접근을 관리할 수 있습니다.');
      }

      const { data, error } = await client.functions.invoke('manage-vault-members', {
        body: { organizationId, action, targetUserId },
      });
      if (error) throw new Error(await readFunctionError(error));
      if (action === 'list' && !Array.isArray(data?.members)) {
        throw new Error('구성원 목록을 확인하지 못했습니다.');
      }
      return data;
    },
  });

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

  const remotePanels = [
    authPanel,
    passwordPanel,
    totpSetupPanel,
    totpChallengePanel,
    organizationPanel,
    recoveryPanel,
  ];

  const showOnlyPanel = (panel) => {
    remotePanels.forEach((candidate) => {
      if (candidate) candidate.hidden = candidate !== panel;
    });
  };

  const toInternalEmail = (vaultId) => `${vaultId}@auth.thevault.invalid`;

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
    showOnlyPanel(recoveryPanel);
    stepLabel.textContent = '06 / Recovery';
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

  const loadProfile = async (userId) => {
    const { data, error } = await client
      .from('profiles')
      .select('vault_id')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  };

  const completeRemoteIdentity = async (session) => {
    const membership = await loadMembership(session.user.id);
    if (!membership?.organizations) {
      activeSession = session;
      showOnlyPanel(organizationPanel);
      stepLabel.textContent = '04 / Organization';
      setFeedback('계정이 확인되었습니다. 첫 조직을 생성하세요.');
      return;
    }

    stepLabel.textContent = '05 / Device';
    setFeedback('기기 비공개 키를 확인하고 있습니다.');
    const profile = await loadProfile(session.user.id);
    const device = await ensureDevice(`user:${session.user.id}`);
    await syncRemoteDevice(session.user, membership.organizations, device);
    const identity = {
      mode: 'SUPABASE',
      userId: session.user.id,
      displayName: profile.vault_id,
      organization: membership.organizations,
      role: membership.role,
      device,
    };
    if (await hasRemoteRecovery(session.user.id)) revealWorkspace(identity);
    else await showRecoveryPanel(identity);
  };

  const beginTotpEnrollment = async () => {
    stepLabel.textContent = '03 / Authenticator';
    setFeedback('인증 앱 등록 정보를 생성하고 있습니다.');
    const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
    if (factorsError) throw factorsError;
    const unverified = (factors.all || []).filter((factor) => factor.status === 'unverified');
    await Promise.all(unverified.map((factor) => client.auth.mfa.unenroll({ factorId: factor.id })));
    const { data, error } = await client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'THE VAULT',
      issuer: 'THE VAULT',
    });
    if (error) throw error;
    pendingTotpFactorId = data.id;
    totpQr.src = data.totp.qr_code;
    totpSecret.textContent = data.totp.secret;
    showOnlyPanel(totpSetupPanel);
    setFeedback('QR 코드를 스캔한 뒤 인증 앱의 현재 6자리 코드를 입력하세요.');
  };

  const continueRemoteSession = async (session) => {
    const { data: verified, error: userError } = await client.auth.getUser();
    const serverUser = verified?.user;
    const accessSuspended = serverUser?.app_metadata?.vault_access === 'suspended';
    if (userError || !serverUser || accessSuspended) {
      await client.auth.signOut();
      if (accessSuspended || /ban|banned/i.test(userError?.message || '')) {
        throw new Error('이 계정의 접근이 정지되었습니다. 조직 관리자에게 문의하세요.');
      }
      throw userError || new Error('서버에서 로그인 상태를 확인하지 못했습니다.');
    }

    const verifiedSession = { ...session, user: serverUser };
    activeSession = verifiedSession;
    const { data: factors, error } = await client.auth.mfa.listFactors();
    if (error) throw error;
    const verifiedFactor = (factors.totp || []).find((factor) => factor.status === 'verified');
    if (!verifiedFactor) {
      const unfinishedFactor = (factors.all || []).find((factor) => (
        factor.factor_type === 'totp' && factor.status === 'unverified'
      ));
      if (unfinishedFactor) {
        await beginTotpEnrollment();
        return;
      }
      showOnlyPanel(passwordPanel);
      stepLabel.textContent = '02 / Password';
      setFeedback('최초 로그인입니다. 임시 비밀번호를 변경하세요.');
      return;
    }

    const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) throw assuranceError;
    if (assurance.currentLevel !== 'aal2') {
      pendingTotpFactorId = verifiedFactor.id;
      showOnlyPanel(totpChallengePanel);
      stepLabel.textContent = '02 / Verification';
      setFeedback('등록한 인증 앱의 현재 6자리 코드를 입력하세요.');
      return;
    }

    await completeRemoteIdentity(verifiedSession);
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
      authReset.hidden = false;
      await continueRemoteSession(data.session);
      return;
    }
    authPanel.hidden = false;
    setFeedback('관리자가 발급한 VAULT ID와 비밀번호를 입력하세요.');
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
      authForm.hidden = signingUp;
      accessNote.hidden = !signingUp;
      setFeedback(signingUp
        ? '실명·이메일·휴대폰 번호를 수집하지 않는 초대 전용 방식입니다.'
        : '관리자가 발급한 VAULT ID와 비밀번호를 입력하세요.');
    });
  });

  authForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(authForm);
    setBusy(authForm, true);
    setFeedback('계정을 확인하고 있습니다.');
    const vaultId = String(formData.get('vaultId') || '').trim().toLowerCase();
    const password = String(formData.get('password') || '');
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: toInternalEmail(vaultId),
        password,
      });
      if (error) throw error;
      await continueRemoteSession(data.session);
    } catch (error) {
      const message = error.message === 'Invalid login credentials'
        ? 'VAULT ID 또는 비밀번호가 올바르지 않습니다.'
        : (/ban|banned/i.test(error.message || '')
          ? '이 계정의 접근이 정지되었습니다. 조직 관리자에게 문의하세요.'
          : (error.message || '인증을 완료하지 못했습니다.'));
      setFeedback(message, true);
    } finally {
      setBusy(authForm, false);
    }
  });

  passwordForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(passwordForm);
    const newPassword = String(formData.get('newPassword') || '');
    const confirmPassword = String(formData.get('confirmPassword') || '');
    if (newPassword !== confirmPassword) {
      setFeedback('새 비밀번호가 서로 일치하지 않습니다.', true);
      return;
    }
    setBusy(passwordForm, true);
    setFeedback('새 비밀번호를 적용하고 있습니다.');
    try {
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw error;
      passwordForm.reset();
      await beginTotpEnrollment();
    } catch (error) {
      setFeedback(error.message || '비밀번호를 변경하지 못했습니다.', true);
    } finally {
      setBusy(passwordForm, false);
    }
  });

  const verifyTotp = async (form, next) => {
    const formData = new FormData(form);
    setBusy(form, true);
    setFeedback('인증 앱 코드를 확인하고 있습니다.');
    try {
      const { error } = await client.auth.mfa.challengeAndVerify({
        factorId: pendingTotpFactorId,
        code: String(formData.get('code') || '').trim(),
      });
      if (error) throw error;
      form.reset();
      const { data, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      await next(data.session);
    } catch (error) {
      setFeedback(error.message || '인증 앱 코드를 확인하지 못했습니다.', true);
    } finally {
      setBusy(form, false);
    }
  };

  totpSetupForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    verifyTotp(totpSetupForm, completeRemoteIdentity);
  });

  totpChallengeForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    verifyTotp(totpChallengeForm, completeRemoteIdentity);
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

  authReset?.addEventListener('click', async () => {
    authReset.disabled = true;
    setFeedback('현재 인증 세션을 종료하고 있습니다.');
    if (client) await client.auth.signOut();
    window.location.reload();
  });

  if (!window.crypto?.subtle || !window.indexedDB) {
    setFeedback('이 브라우저는 기기 키 저장에 필요한 Web Crypto 또는 IndexedDB를 지원하지 않습니다.', true);
    return;
  }

  const start = hasRemoteConfig ? initializeRemote : initializeLocal;
  start().catch((error) => {
    const accessSuspended = /접근이 정지|ban|banned/i.test(error.message || '');
    setFeedback(error.message || 'Identity 초기화에 실패했습니다.', true);
    if (hasRemoteConfig && accessSuspended) {
      modeLabel.textContent = 'SUPABASE CONNECTED';
      authBoundary.textContent = 'Supabase Auth + RLS';
      authReset.hidden = true;
      showOnlyPanel(authPanel);
    } else if (hasRemoteConfig) {
      modeLabel.textContent = 'CONNECTION FAILED';
      authBoundary.textContent = 'Unavailable';
    }
  });
})();
