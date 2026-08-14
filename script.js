(() => {
  const body = document.body;
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(pointer: fine)');
  const desktopLayout = window.matchMedia('(min-width: 46.01rem)');
  const hero = document.querySelector('.hero');
  const heroLines = [...document.querySelectorAll('#hero-title .hero__line > span')];
  const heroShine = document.querySelector('.hero__headline--shine');
  const heroStatement = document.querySelector('.hero__statement');
  const heroScrollCue = document.querySelector('.hero__scroll-cue');
  const philosophy = document.querySelector('.philosophy');
  const philosophyVideo = document.querySelector('.philosophy__video');
  const philosophyLetters = [...document.querySelectorAll('.philosophy__letter')];
  const vision = document.querySelector('.vision');
  const approach = document.querySelector('.approach');
  const approachChapters = [...document.querySelectorAll('.approach__chapter')];
  const approachTicks = [...document.querySelectorAll('.approach__tick')];
  const applications = document.querySelector('.applications');
  const applicationsTrack = document.querySelector('.applications__track');
  const revealElements = [...document.querySelectorAll('.reveal-on-view')];

  let lenis = null;
  let animationFrame = 0;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let heroHasScrolled = false;
  let heroMotionIsReset = false;
  let philosophyMotionIsReset = false;
  let approachMotionIsReset = false;
  let applicationsMotionIsReset = false;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const segmentProgress = (progress, start, end) => clamp((progress - start) / (end - start));
  const easeOutCubic = (progress) => 1 - (1 - progress) ** 3;

  const resetHeroMotion = () => {
    if (heroMotionIsReset) return;

    root.style.setProperty('--hero-scroll-y', '0px');
    heroLines.forEach((line) => {
      line.style.opacity = '1';
      line.style.transform = 'none';
    });
    if (heroStatement) {
      heroStatement.style.opacity = '1';
      heroStatement.style.transform = 'none';
    }
    heroScrollCue?.style.removeProperty('opacity');
    heroScrollCue?.style.removeProperty('transform');
    heroShine?.style.setProperty('--hero-shine-opacity', '0');
    heroShine?.style.setProperty('--hero-shine-x', '0em');
    heroMotionIsReset = true;
  };

  const updateHeroMotion = () => {
    if (!hero || reduceMotion.matches) {
      resetHeroMotion();
      return;
    }

    const rect = hero.getBoundingClientRect();
    const travel = Math.max(1, rect.height - window.innerHeight);
    const progress = clamp(-rect.top / travel);
    const lineStarts = [0.04, 0.15, 0.26, 0.37];

    heroMotionIsReset = false;
    heroLines.forEach((line, index) => {
      const reveal = easeOutCubic(segmentProgress(progress, lineStarts[index], lineStarts[index] + 0.23));
      line.style.opacity = reveal.toFixed(3);
      line.style.transform = `translate3d(0, ${((1 - reveal) * 112).toFixed(2)}%, 0)`;
    });

    const statementProgress = easeOutCubic(segmentProgress(progress, 0.58, 0.78));
    if (heroStatement) {
      heroStatement.style.opacity = statementProgress.toFixed(3);
      heroStatement.style.transform = `translate3d(0, ${((1 - statementProgress) * 12).toFixed(2)}px, 0)`;
    }

    if (progress > 0.01 && heroScrollCue) {
      heroHasScrolled = true;
      const cueExit = segmentProgress(progress, 0.06, 0.22);
      heroScrollCue.style.animation = 'none';
      heroScrollCue.style.opacity = (1 - cueExit).toFixed(3);
      heroScrollCue.style.transform = `translate3d(0, ${(-cueExit * 8).toFixed(2)}px, 0)`;
    } else if (heroHasScrolled && heroScrollCue) {
      heroScrollCue.style.animation = 'none';
      heroScrollCue.style.opacity = '1';
      heroScrollCue.style.transform = 'none';
    } else {
      heroScrollCue?.style.removeProperty('animation');
      heroScrollCue?.style.removeProperty('opacity');
      heroScrollCue?.style.removeProperty('transform');
    }

    const shineProgress = segmentProgress(progress, 0.68, 0.92);
    const shineOpacity = Math.sin(shineProgress * Math.PI) * 0.16;
    heroShine?.style.setProperty('--hero-shine-opacity', Math.max(0, shineOpacity).toFixed(3));
    heroShine?.style.setProperty('--hero-shine-x', `${(-0.06 + shineProgress * 0.105).toFixed(3)}em`);
    root.style.setProperty('--hero-scroll-y', `${(-progress * 18).toFixed(2)}px`);
  };

  const resetPhilosophyMotion = () => {
    if (philosophyMotionIsReset) return;

    philosophy?.style.setProperty('--philosophy-video-y', '0px');
    philosophyLetters.forEach((letter) => {
      letter.style.opacity = '1';
      letter.style.transform = 'none';
    });
    philosophyMotionIsReset = true;
  };

  const updatePhilosophyMotion = () => {
    if (!philosophy || reduceMotion.matches || !desktopLayout.matches) {
      resetPhilosophyMotion();
      return;
    }

    const rect = philosophy.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const settleProgress = clamp((viewportHeight * 0.84 - rect.top) / (viewportHeight * 0.62));
    const sectionProgress = clamp((viewportHeight - rect.top) / (rect.height + viewportHeight));

    philosophyMotionIsReset = false;

    philosophyLetters.forEach((letter, index) => {
      const delayedProgress = clamp((settleProgress - index * 0.018) / 0.78);
      const easedProgress = 1 - (1 - delayedProgress) ** 3;
      const remaining = 1 - easedProgress;
      const scatterX = Number(letter.dataset.sx) * remaining;
      const scatterY = Number(letter.dataset.sy) * remaining;
      const scatterRotation = Number(letter.dataset.sr) * remaining;

      letter.style.opacity = `${0.78 + easedProgress * 0.22}`;
      letter.style.transform = `translate3d(${scatterX.toFixed(2)}px, ${scatterY.toFixed(2)}px, 0) rotate(${scatterRotation.toFixed(2)}deg)`;
    });

    const videoOffset = (sectionProgress - 0.5) * 42;
    philosophy.style.setProperty('--philosophy-video-y', `${videoOffset.toFixed(2)}px`);
  };

  const resetVisionMotion = () => {
    if (!vision) return;

    vision.style.setProperty('--vision-progress', '1');
    vision.style.setProperty('--vision-from-x', '0px');
    vision.style.setProperty('--vision-silence-x', '0px');
    vision.style.setProperty('--vision-to-y', '0px');
    vision.style.setProperty('--vision-system-x', '0px');
  };

  const updateVisionMotion = () => {
    if (!vision || reduceMotion.matches || !desktopLayout.matches) {
      resetVisionMotion();
      return;
    }

    const rect = vision.getBoundingClientRect();
    const travel = Math.max(1, rect.height - window.innerHeight);
    const progress = clamp(-rect.top / travel);
    const inverse = 1 - progress;

    vision.style.setProperty('--vision-progress', progress.toFixed(4));
    vision.style.setProperty('--vision-from-x', `${(-window.innerWidth * 0.04 * inverse).toFixed(2)}px`);
    vision.style.setProperty('--vision-silence-x', `${(-window.innerWidth * 0.08 * inverse).toFixed(2)}px`);
    vision.style.setProperty('--vision-to-y', `${(32 * inverse).toFixed(2)}px`);
    vision.style.setProperty('--vision-system-x', `${(window.innerWidth * 0.08 * inverse).toFixed(2)}px`);
  };

  const resetApproachMotion = () => {
    if (approachMotionIsReset) return;

    approachChapters.forEach((chapter) => {
      chapter.style.removeProperty('opacity');
      chapter.style.removeProperty('transform');
      chapter.style.removeProperty('pointer-events');
    });
    approachTicks.forEach((tick, index) => tick.classList.toggle('is-active', index === 0));
    approachMotionIsReset = true;
  };

  const updateApproachMotion = () => {
    if (!approach || reduceMotion.matches || !desktopLayout.matches) {
      resetApproachMotion();
      return;
    }

    const rect = approach.getBoundingClientRect();
    const travel = Math.max(1, rect.height - window.innerHeight);
    const progress = clamp(-rect.top / travel);
    const timelinePosition = progress * (approachChapters.length - 1);
    const activeIndex = Math.round(timelinePosition);

    approachMotionIsReset = false;
    approachChapters.forEach((chapter, index) => {
      chapter.classList.toggle('is-active', index === activeIndex);
    });
    approachTicks.forEach((tick, index) => tick.classList.toggle('is-active', index === activeIndex));
  };

  const resetApplicationsMotion = () => {
    if (applicationsMotionIsReset) return;
    applications?.style.setProperty('--applications-x', '0px');
    applicationsMotionIsReset = true;
  };

  const updateApplicationsMotion = () => {
    if (!applications || !applicationsTrack || reduceMotion.matches || !desktopLayout.matches) {
      resetApplicationsMotion();
      return;
    }

    const rect = applications.getBoundingClientRect();
    const travel = Math.max(1, rect.height - window.innerHeight);
    const progress = clamp(-rect.top / travel);
    const horizontalTravel = Math.max(0, applicationsTrack.scrollWidth - window.innerWidth);

    applicationsMotionIsReset = false;
    applications.style.setProperty('--applications-x', `${(-horizontalTravel * progress).toFixed(2)}px`);
  };

  const setReady = () => {
    requestAnimationFrame(() => body.classList.add('is-ready'));
  };

  const updatePointerTarget = (event) => {
    if (reduceMotion.matches || !finePointer.matches) return;

    const normalizedX = event.clientX / window.innerWidth - 0.5;
    const normalizedY = event.clientY / window.innerHeight - 0.5;

    targetX = normalizedX * -12;
    targetY = normalizedY * -8;
  };

  const renderFrame = (time) => {
    if (lenis) lenis.raf(time);

    currentX += (targetX - currentX) * 0.075;
    currentY += (targetY - currentY) * 0.075;

    root.style.setProperty('--parallax-x', `${currentX.toFixed(2)}px`);
    root.style.setProperty('--parallax-y', `${currentY.toFixed(2)}px`);
    updateHeroMotion();
    updatePhilosophyMotion();
    updateVisionMotion();
    updateApproachMotion();
    updateApplicationsMotion();

    animationFrame = requestAnimationFrame(renderFrame);
  };

  const startMotion = () => {
    if (reduceMotion.matches) return;

    if (window.Lenis) {
      lenis = new window.Lenis({
        lerp: 0.085,
        smoothWheel: true,
        syncTouch: false,
        anchors: true,
        autoRaf: false,
      });
    }

    window.addEventListener('pointermove', updatePointerTarget, { passive: true });
    animationFrame = requestAnimationFrame(renderFrame);
  };

  const stopMotion = () => {
    window.removeEventListener('pointermove', updatePointerTarget);
    cancelAnimationFrame(animationFrame);
    lenis?.destroy();
    lenis = null;
    targetX = 0;
    targetY = 0;
    currentX = 0;
    currentY = 0;
    root.style.setProperty('--parallax-x', '0px');
    root.style.setProperty('--parallax-y', '0px');
    resetHeroMotion();
    resetPhilosophyMotion();
    resetVisionMotion();
    resetApproachMotion();
    resetApplicationsMotion();
  };

  const handleMotionPreference = () => {
    stopMotion();
    if (reduceMotion.matches) philosophyVideo?.pause();
    if (!reduceMotion.matches) startMotion();
  };

  if (philosophyVideo) {
    const videoObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !reduceMotion.matches) {
          philosophyVideo.play().catch(() => {});
        } else {
          philosophyVideo.pause();
        }
      },
      { threshold: 0.3 },
    );

    videoObserver.observe(philosophyVideo);
  }

  if (revealElements.length) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18 },
    );

    revealElements.forEach((element) => revealObserver.observe(element));
  }

  if (document.readyState === 'complete') {
    setReady();
  } else {
    window.addEventListener('load', setReady, { once: true });
  }

  startMotion();
  reduceMotion.addEventListener('change', handleMotionPreference);
})();
