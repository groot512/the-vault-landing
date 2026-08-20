(() => {
  const STORAGE_KEY = 'vault.language';
  const DEFAULT_LANGUAGE = 'ko';
  const pairs = [
    ['더 볼트', 'THE VAULT'],
    ['테세러', 'TESSERA'],
    ['디지털 볼트', 'DIGITAL VAULT'],
    ['트러스트 랩', 'TRUST LAB'],
    ['더 볼트 룸', 'THE VAULT ROOM'],
    ['더 볼트 전체 메뉴', 'THE VAULT global navigation'],
    ['테세러 세부 메뉴', 'TESSERA submenu'],
    ['디지털 볼트 세부 메뉴', 'DIGITAL VAULT submenu'],
    ['트러스트 랩 세부 메뉴', 'TRUST LAB submenu'],
    ['테세러 ↗', 'TESSERA ↗'],
    ['디지털 볼트 ↗', 'DIGITAL VAULT ↗'],
    ['트러스트 랩 ↗', 'TRUST LAB ↗'],
    ['철학', 'Philosophy'],
    ['비전', 'Vision'],
    ['접근 방식', 'Approach'],
    ['개요', 'Overview'],
    ['기술 증명', 'Proof'],
    ['구조', 'Architecture'],
    ['개발 현황', 'Status'],
    ['테세러 증명', 'Tessera Proof'],
    ['볼트 증명', 'Vault Proof'],
    ['감사 기록', 'Audit'],
    ['메뉴', 'Menu'],
    ['닫기', 'Close'],
    ['본문으로 건너뛰기', 'Skip to content'],
    ['작업영역으로 건너뛰기', 'Skip to workspace'],
    ['프라이빗 보안 아키텍처', 'Private Security Architecture'],
    ['신뢰는', 'Trust is'],
    ['보이지 않지만', 'invisible, yet'],
    ['설계할 수', 'it can be'],
    ['있습니다.', 'designed.'],
    ['공간, 통신, 데이터를', 'We protect space, communication, and data'],
    ['하나의 신뢰 구조로 보호합니다.', 'through one architecture of trust.'],
    ['스크롤하여 확인', 'Scroll to reveal'],
    ['브랜드 철학', 'Brand Philosophy'],
    ['보안은 감추는 기술이 아니라,', 'Security is not the art of concealment,'],
    ['신뢰가 무너지지 않도록', 'but the work of ensuring trust'],
    ['환경 전체를 설계하는 일입니다.', 'does not collapse.'],
    ['공간 → 통신 → 보관', 'Space → Signal → Archive'],
    ['가장 중요한 대화를 지키는 공간에서 시작해,', 'Beginning with the room that protects the most important conversations,'],
    ['대화가 전달되고 데이터가 보관되는', 'we extend protection to every moment'],
    ['모든 순간으로 확장합니다.', 'when conversation travels and data remains.'],
    ['보안의 세 가지 경계', 'Three Security Boundaries'],
    ['공간 보안', 'Secure Space'],
    ['통신 보안', 'Secure Signal'],
    ['데이터 보안', 'Secure Archive'],
    ['브랜드 스토리', 'Brand Story'],
    ['시각 정체성', 'Visual Identity'],
    ['브랜드 적용', 'Brand Applications'],
    ['프라이빗 상담', 'Private Consultation'],
    ['브라우저 프로토타입', 'Browser prototype'],
    ['인증된 제품이 아닙니다', 'Not a certified product'],
    ['보관 서비스가 아닙니다', 'Not a storage service'],
    ['안전한 통신', 'Secure Signal'],
    ['안전한 보관', 'Secure Archive'],
    ['신원 / 기기 / 경계', 'Identity / Device / Boundary'],
    ['암호화 / 권한 / 만료', 'Encrypt / Grant / Expire'],
    ['프라이빗 파일럿 목표 · 2026', 'Private pilot target · 2026'],
    ['브라우저 기술 증명', 'Browser Proof'],
    ['사용자 기기 / 평문', 'User device / Plaintext'],
    ['전송 경계 / 암호문', 'Transport boundary / Ciphertext'],
    ['로컬 파일 / 업로드 전', 'Local file / Before upload'],
    ['오브젝트 저장소 / 암호화된 데이터', 'Object storage / Encrypted payload'],
    ['이 브라우저에서 암호화', 'Encrypt in this browser'],
    ['업로드 전에 암호화', 'Encrypt before upload'],
    ['증명 대기 중', 'Waiting for proof'],
    ['신뢰 커널', 'Trust Kernel'],
    ['신원', 'Identity'],
    ['암호화 전송', 'Encrypted Delivery'],
    ['내용 없는 감사', 'Content-free Audit'],
    ['클라이언트 암호화', 'Client Encryption'],
    ['통제된 접근', 'Controlled Access'],
    ['정의된 생명주기', 'Defined Lifecycle'],
    ['통신에서 보관으로', 'Signal to Archive'],
    ['정직한 개발 현황', 'Honest Status'],
    ['현재', 'Now'],
    ['구현', 'Build'],
    ['검증', 'Validate'],
    ['검토', 'Review'],
    ['트러스트 랩 열기', 'Open Trust Lab'],
    ['테세러로 돌아가기', 'Return to TESSERA'],
    ['디지털 볼트 보기', 'View DIGITAL VAULT'],
    ['로컬 미리보기', 'Local Preview'],
    ['서버 없이 기기 등록 흐름을 먼저 확인합니다.', 'Preview the device enrollment flow without a server.'],
    ['실명을 요구하지 않습니다. VAULT ID와 조직명은 이 브라우저에만 저장됩니다.', 'No legal name is required. Your VAULT ID and organization stay in this browser.'],
    ['계정은 접근 권한을 증명하고, 기기 키는 콘텐츠 경계를 지킵니다. 두 역할을 분리해 신뢰를 설계합니다.', 'The account proves access rights while the device key protects content. Trust begins by separating those roles.'],
    ['Supabase 설정 전입니다. 로컬 프리뷰로 기기 등록을 검증할 수 있습니다.', 'Supabase is not configured. You can validate device enrollment in the local preview.'],
    ['볼트 ID', 'VAULT ID'],
    ['조직명', 'Organization'],
    ['비공개 프로젝트', 'Private Project'],
    ['기기 등록', 'Register device'],
    ['로그인', 'Sign in'],
    ['가입 신청', 'Request access'],
    ['휴대폰 번호', 'Phone number'],
    ['비밀번호', 'Password'],
    ['휴대폰 확인', 'Phone verification'],
    ['문자로 받은 6자리 인증번호를 입력하세요.', 'Enter the six-digit code sent by SMS.'],
    ['인증번호는 일회용이며 비밀번호나 복구키를 문자로 전송하지 않습니다.', 'The code is single-use. Passwords and recovery keys are never sent by SMS.'],
    ['인증번호', 'Verification code'],
    ['가입 확인', 'Confirm access'],
    ['조직 경계', 'Organization boundary'],
    ['첫 번째 보안 작업공간을 만듭니다.', 'Create your first secure workspace.'],
    ['생성한 사용자는 관리자 역할을 가지며, 멤버 초대는 다음 단계에서 연결합니다.', 'The creator becomes an administrator; member invitations come in the next phase.'],
    ['조직 만들기', 'Create organization'],
    ['마지막 복구 수단', 'Last-resort recovery'],
    ['12개 복구 코드워드를 오프라인에 보관하세요.', 'Store these 12 recovery codewords offline.'],
    ['이 문구는 다시 표시되지 않으며 문자·분석 로그·서버 원문에 저장되지 않습니다.', 'This phrase will not be shown again or stored in SMS, analytics, or server plaintext.'],
    ['복구키 인쇄', 'Print recovery key'],
    ['표시된 단어 중 요청한 세 단어를 입력하세요.', 'Enter the three requested words.'],
    ['보관 확인 및 계속', 'Confirm storage and continue'],
    ['인증', 'Authentication'],
    ['로컬 미리보기 상태', 'Local preview'],
    ['개인 키', 'Private key'],
    ['내보낼 수 없는 IndexedDB 키', 'IndexedDB / Non-exportable'],
    ['서버 기록', 'Server record'],
    ['공개 키와 기기 상태만', 'Public key + device status only'],
    ['제품', 'Products'],
    ['콘텐츠 없는 이벤트', 'Content-free events'],
    ['신원 확인 대기', 'Identity pending'],
    ['세션 종료', 'End session'],
    ['프로토타입 경계', 'Prototype boundary'],
    ['기기', 'Device'],
    ['등록 중', 'Registering'],
    ['키 상태', 'Key state'],
    ['로컬 키 생성 중', 'Generating local key'],
    ['암호화할 메시지', 'Message to encrypt'],
    ['민감한 프로젝트 메시지를 입력하세요.', 'Enter a sensitive project message.'],
    ['암호화하여 전송', 'Encrypt and send'],
    ['파일 선택', 'Select file'],
    ['파일 암호화', 'Encrypt file']
  ];

  const normalize = (value) => value.replace(/\s+/g, ' ').trim();
  const koToEn = new Map(pairs.map(([ko, en]) => [normalize(ko), en]));
  const enToKo = new Map(pairs.map(([ko, en]) => [normalize(en), ko]));
  enToKo.set('Tessera', '테세러');
  enToKo.set('Digital Vault', '디지털 볼트');
  enToKo.set('Trust Lab', '트러스트 랩');
  enToKo.set('Tessera ↗', '테세러 ↗');
  enToKo.set('Digital Vault ↗', '디지털 볼트 ↗');
  enToKo.set('Trust Lab ↗', '트러스트 랩 ↗');
  let language = localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : DEFAULT_LANGUAGE;
  let translationQueued = false;

  const translateBrandNames = (value, targetLanguage) => {
    const replacements = targetLanguage === 'ko'
      ? [
          ['THE VAULT ROOM', '더 볼트 룸'],
          ['DIGITAL VAULT', '디지털 볼트'],
          ['Digital Vault', '디지털 볼트'],
          ['TRUST LAB', '트러스트 랩'],
          ['Trust Lab', '트러스트 랩'],
          ['TESSERA', '테세러'],
          ['Tessera', '테세러'],
          ['THE VAULT', '더 볼트'],
        ]
      : [
          ['더 볼트 룸', 'THE VAULT ROOM'],
          ['디지털 볼트', 'DIGITAL VAULT'],
          ['트러스트 랩', 'TRUST LAB'],
          ['테세러', 'TESSERA'],
          ['더 볼트', 'THE VAULT'],
        ];
    return replacements.reduce((translated, [from, to]) => translated.split(from).join(to), value);
  };

  const translateValue = (value, targetLanguage) => {
    const key = normalize(value);
    if (!key) return value;
    const replacement = targetLanguage === 'en' ? koToEn.get(key) : enToKo.get(key);
    if (!replacement) return translateBrandNames(value, targetLanguage);
    const leading = value.match(/^\s*/)?.[0] ?? '';
    const trailing = value.match(/\s*$/)?.[0] ?? '';
    return `${leading}${replacement}${trailing}`;
  };

  const translateTextNodes = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest('script, style, code, pre, textarea, [data-no-i18n]')) {
          return NodeFilter.FILTER_REJECT;
        }
        return normalize(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const translated = translateValue(node.nodeValue, language);
      if (translated !== node.nodeValue) node.nodeValue = translated;
    });
  };

  const translateAttributes = (root) => {
    const elements = root.querySelectorAll?.('[aria-label], [title], [placeholder], meta[name="description"]') ?? [];
    elements.forEach((element) => {
      ['aria-label', 'title', 'placeholder', 'content'].forEach((attribute) => {
        if (element.hasAttribute(attribute)) {
          const current = element.getAttribute(attribute);
          const translated = translateValue(current, language);
          if (translated !== current) element.setAttribute(attribute, translated);
        }
      });
    });
  };

  const applyExplicitTranslations = (root) => {
    const elements = root.querySelectorAll?.('[data-ko][data-en]') ?? [];
    elements.forEach((element) => {
      const value = element.dataset[language];
      if (element.hasAttribute('data-i18n-html')) {
        if (element.innerHTML !== value) element.innerHTML = value;
      } else if (element.textContent !== value) {
        element.textContent = value;
      }
    });
  };

  const updateToggles = () => {
    document.querySelectorAll('[data-language-toggle]').forEach((button) => {
      const label = language === 'ko' ? '영어로 보기' : 'View in Korean';
      const pressed = String(language === 'en');
      const current = button.querySelector('[data-language-current]');
      const next = button.querySelector('[data-language-next]');
      if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
      if (current.textContent !== language.toUpperCase()) current.textContent = language.toUpperCase();
      if (next.textContent !== (language === 'ko' ? 'EN' : 'KO')) next.textContent = language === 'ko' ? 'EN' : 'KO';
    });
  };

  const apply = (root = document) => {
    document.documentElement.lang = language;
    applyExplicitTranslations(root);
    translateTextNodes(root);
    translateAttributes(root);
    updateToggles();
  };

  const setLanguage = (nextLanguage) => {
    language = nextLanguage === 'en' ? 'en' : 'ko';
    localStorage.setItem(STORAGE_KEY, language);
    apply();
    window.dispatchEvent(new CustomEvent('vault:languagechange', { detail: { language } }));
  };

  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-language-toggle]');
    if (toggle) setLanguage(language === 'ko' ? 'en' : 'ko');
  });

  document.addEventListener('DOMContentLoaded', () => {
    apply();
    const observer = new MutationObserver(() => {
      if (translationQueued) return;
      translationQueued = true;
      requestAnimationFrame(() => {
        translationQueued = false;
        apply();
      });
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  });
  window.vaultI18n = {
    apply,
    current: () => language,
    pick: (ko, en) => language === 'ko' ? ko : en,
    setLanguage
  };
})();
