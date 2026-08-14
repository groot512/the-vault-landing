(() => {
  const nav = document.querySelector('[data-global-nav]');
  if (!nav) return;

  const body = document.body;
  const menuToggle = nav.querySelector('[data-global-nav-toggle]');
  const submenuToggles = [...nav.querySelectorAll('[data-submenu-toggle]')];
  const mobileLayout = window.matchMedia('(max-width: 58rem)');

  const closeSubmenus = (except = null) => {
    submenuToggles.forEach((toggle) => {
      if (toggle !== except) toggle.setAttribute('aria-expanded', 'false');
    });
  };

  const closeMenu = () => {
    nav.classList.remove('is-open');
    body.classList.remove('has-open-nav');
    menuToggle?.setAttribute('aria-expanded', 'false');
    closeSubmenus();
  };

  menuToggle?.addEventListener('click', () => {
    const willOpen = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', willOpen);
    body.classList.toggle('has-open-nav', willOpen);
    menuToggle.setAttribute('aria-expanded', String(willOpen));
    if (!willOpen) closeSubmenus();
  });

  submenuToggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const willOpen = toggle.getAttribute('aria-expanded') !== 'true';
      closeSubmenus(toggle);
      toggle.setAttribute('aria-expanded', String(willOpen));
    });
  });

  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  mobileLayout.addEventListener('change', closeMenu);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
})();
