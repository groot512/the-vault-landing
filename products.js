(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = window.matchMedia('(min-width: 52.01rem)');
  const encoder = new TextEncoder();
  const proofDemos = [...document.querySelectorAll('[data-crypto-proof]')];
  const stories = [...document.querySelectorAll('[data-product-story]')];

  const setReady = () => requestAnimationFrame(() => root.classList.add('is-ready'));

  const buildField = (field) => {
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 96; index += 1) {
      fragment.appendChild(document.createElement('span'));
    }
    field.appendChild(fragment);
  };

  document.querySelectorAll('[data-product-field]').forEach(buildField);

  const bytesToBase64 = (bytes) => {
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return window.btoa(binary);
  };

  const renderCiphertext = (target, value) => {
    target.replaceChildren();
    const groups = value.match(/.{1,12}/g) || [value];
    groups.forEach((group, index) => {
      const node = document.createElement(index % 7 === 0 ? 'span' : 'b');
      node.textContent = `${group} `;
      if (node.tagName === 'B') node.style.fontWeight = 'inherit';
      target.appendChild(node);
    });
  };

  const runProof = async (demo) => {
    const button = demo.querySelector('[data-proof-action]');
    const output = demo.querySelector('[data-proof-output]');
    const status = demo.querySelector('[data-proof-status]');
    const plain = demo.dataset.plaintext || '';

    if (!button || !output || !status) return;

    if (!window.crypto?.subtle) {
      status.textContent = 'Web Crypto unavailable';
      output.textContent = '이 브라우저에서는 암호화 Proof를 실행할 수 없습니다.';
      button.disabled = true;
      return;
    }

    button.disabled = true;
    status.textContent = 'Encrypting on this device';
    output.textContent = '암호화 경계를 준비하고 있습니다…';

    try {
      const key = await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      );
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const plainBytes = encoder.encode(plain);
      const encrypted = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        plainBytes,
      );
      const cipherBytes = new Uint8Array(encrypted);
      const payload = new Uint8Array(iv.length + cipherBytes.length);
      payload.set(iv);
      payload.set(cipherBytes, iv.length);

      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        cipherBytes,
      );
      const verified = new TextDecoder().decode(decrypted) === plain;

      renderCiphertext(output, bytesToBase64(payload));
      status.textContent = verified
        ? `Local round-trip verified · ${payload.byteLength} bytes`
        : 'Verification failed';
    } catch (error) {
      status.textContent = 'Proof failed';
      output.textContent = '암호화 Proof 실행 중 오류가 발생했습니다.';
      console.error('Client-side proof failed', error);
    } finally {
      button.disabled = false;
    }
  };

  proofDemos.forEach((demo) => {
    const button = demo.querySelector('[data-proof-action]');
    button?.addEventListener('click', () => runProof(demo));

    if (reduceMotion.matches) {
      runProof(demo);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          runProof(demo);
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(demo);
  });

  const resetStory = (story) => {
    const steps = [...story.querySelectorAll('[data-story-step]')];
    const index = story.querySelector('[data-story-index]');
    steps.forEach((step) => step.classList.add('is-active'));
    if (index) index.textContent = '01';
  };

  const updateStory = (story) => {
    const steps = [...story.querySelectorAll('[data-story-step]')];
    const index = story.querySelector('[data-story-index]');
    if (!steps.length) return;

    if (reduceMotion.matches || !desktop.matches) {
      resetStory(story);
      return;
    }

    const rect = story.getBoundingClientRect();
    const travel = Math.max(1, rect.height - window.innerHeight);
    const progress = Math.min(1, Math.max(0, -rect.top / travel));
    const activeIndex = Math.min(steps.length - 1, Math.round(progress * (steps.length - 1)));

    steps.forEach((step, stepIndex) => {
      step.classList.toggle('is-active', stepIndex === activeIndex);
    });
    if (index) index.textContent = String(activeIndex + 1).padStart(2, '0');
  };

  let frame = 0;
  const render = () => {
    stories.forEach(updateStory);
    frame = requestAnimationFrame(render);
  };

  const handleMotionChange = () => {
    stories.forEach(updateStory);
  };

  if (document.readyState === 'complete') {
    setReady();
  } else {
    window.addEventListener('load', setReady, { once: true });
  }

  frame = requestAnimationFrame(render);
  reduceMotion.addEventListener('change', handleMotionChange);
  desktop.addEventListener('change', handleMotionChange);
  window.addEventListener('pagehide', () => cancelAnimationFrame(frame), { once: true });
})();
