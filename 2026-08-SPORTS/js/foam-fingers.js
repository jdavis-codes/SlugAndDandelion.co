export function initFoamFingerEffects(options = {}) {
  const launchConfetti = typeof options.launchConfetti === "function"
    ? options.launchConfetti
    : null;
  const onTeamClick = typeof options.onTeamClick === "function"
    ? options.onTeamClick
    : null;

  wireFoamFingerScrollEffect();
  wireFoamFingerSpinEffect(launchConfetti, onTeamClick);
  wireScrolljack3DEffect();
}

function wireFoamFingerScrollEffect() {
  if (typeof window === "undefined" || !document.body) return;

  const mobileQuery = window.matchMedia("(max-width: 820px)");
  const DISMISS_SCROLL_Y = 28;
  let ticking = false;

  const getScrollY = () => {
    return (
      window.scrollY ||
      window.pageYOffset ||
      document.documentElement.scrollTop ||
      0
    );
  };

  const applyState = () => {
    ticking = false;

    const shouldDismiss = mobileQuery.matches && getScrollY() > DISMISS_SCROLL_Y;
    document.body.classList.toggle("foam-fingers-dismissed", shouldDismiss);
  };

  const queueApplyState = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(applyState);
  };

  window.addEventListener("scroll", queueApplyState, { passive: true });
  window.addEventListener("touchmove", queueApplyState, { passive: true });
  window.addEventListener("resize", queueApplyState, { passive: true });
  window.addEventListener("orientationchange", queueApplyState);

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", queueApplyState);
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(queueApplyState);
  }

  queueApplyState();
}

function wireFoamFingerSpinEffect(launchConfetti, onTeamClick) {
  const stacks = Array.from(document.querySelectorAll(".foam-finger-stack"));
  if (stacks.length === 0) return;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const notifySpinStateChange = () => {
    window.dispatchEvent(new CustomEvent("foam-finger-spin-state-change"));
  };

  const triggerSpin = (stack) => {
    for (const other of stacks) {
      if (other === stack) continue;
      other.classList.remove("is-active", "is-spinning");
    }

    stack.classList.add("is-active");
    stack.classList.remove("is-spinning");
    void stack.offsetWidth;
    stack.classList.add("is-spinning");
    notifySpinStateChange();
  };

  const triggerGloveConfetti = (stack) => {
    if (!launchConfetti) return;

    const rect = stack.getBoundingClientRect();
    const viewportWidth = Math.max(window.innerWidth || 1, 1);
    const isMobile = window.matchMedia("(max-width: 820px)").matches;

    const gloveColor = stack.classList.contains("foam-finger-stack-left")
      ? "#f26522"
      : "#1e88e5";

    const centerVw = clamp(((rect.left + (rect.width / 2)) / viewportWidth) * 100, 3, 97);
    const startTopVh = -12;

    launchConfetti({
      count: isMobile ? 40 : 64,
      centerVw,
      spreadVw: isMobile ? 22 : 16,
      startTopVh,
      colors: [gloveColor]
    });
  };

  const getFingerTeam = (stack) => {
    if (stack.classList.contains("foam-finger-stack-left")) return "toasters";
    if (stack.classList.contains("foam-finger-stack-right")) return "poppers";
    return null;
  };

  for (const stack of stacks) {
    stack.addEventListener("click", () => {
      triggerSpin(stack);
      triggerGloveConfetti(stack);

      const team = getFingerTeam(stack);
      if (team && onTeamClick) {
        void onTeamClick(team);
      }
    });

    const card = stack.querySelector(".foam-finger-card");
    card?.addEventListener("animationend", () => {
      stack.classList.remove("is-spinning");
      notifySpinStateChange();
    });
  }
}

function wireScrolljack3DEffect() {
  if (typeof window === "undefined") return;

  const ticket = document.querySelector(".ticket");
  const board = document.querySelector(".bleachers-board");
  const gloveStacks = Array.from(document.querySelectorAll(".foam-finger-stack"));
  if (!ticket && !board && gloveStacks.length === 0) return;

  const mobileQuery = window.matchMedia("(max-width: 820px)");
  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let ticking = false;
  let desktopListenersBound = false;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const getScrollY = () => {
    return (
      window.scrollY ||
      window.pageYOffset ||
      document.documentElement.scrollTop ||
      0
    );
  };

  const clearTransforms = () => {
    ticket?.style.removeProperty("transform");
    board?.style.removeProperty("transform");
    for (const stack of gloveStacks) {
      stack.style.removeProperty("--scroll-glove-rotate-x");
      stack.style.removeProperty("--scroll-glove-rotate-y");
      stack.style.removeProperty("--scroll-glove-depth");
    }
  };

  const apply = () => {
    ticking = false;

    if (mobileQuery.matches || reduceMotionQuery.matches || document.body.classList.contains("seat-picker-open")) {
      clearTransforms();
      return;
    }

    const y = getScrollY();
    const vh = Math.max(window.innerHeight || 1, 1);
    const isMobile = mobileQuery.matches;

    const primaryProgress = clamp(y / (vh * 1.2), 0, 1.4);
    const wave = Math.sin(y * 0.004);

    if (ticket) {
      const rotateX = -(isMobile ? 11 : 18) * primaryProgress;
      const rotateY = wave * (isMobile ? 5.6 : 20.4);
      ticket.style.transform = `perspective(1400px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
    }

    if (board) {
      const boardProgress = clamp((y - vh * 0.15) / (vh * 1.1), 0, 1.2);
      const rotateX = (1 - boardProgress) * (isMobile ? 4 : 1);
      const rotateY = -wave * (isMobile ? 4.4 : 8.4);
      board.style.transform = `perspective(1400px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
    }

    if (gloveStacks.length > 0) {
      const gloveProgress = clamp(y / (vh * 0.9), 0, 1.4);
      const gloveRotateX = (isMobile ? 30 : 44) * -(0.35 + gloveProgress * 1.65);
      const gloveDepth = (isMobile ? 24 : 48) * gloveProgress;
      const gloveWave = Math.sin(y * 0.03) * (isMobile ? 32 : 32);

      gloveStacks.forEach((stack, index) => {
        if (stack.classList.contains("is-spinning")) {
          stack.style.setProperty("--scroll-glove-rotate-x", "0deg");
          stack.style.setProperty("--scroll-glove-rotate-y", "0deg");
          stack.style.setProperty("--scroll-glove-depth", "0px");
          return;
        }

        const direction = index === 0 ? -1 : 1;
        const gloveRotateY = gloveWave * direction;

        stack.style.setProperty("--scroll-glove-rotate-x", `${gloveRotateX.toFixed(2)}deg`);
        stack.style.setProperty("--scroll-glove-rotate-y", `${gloveRotateY.toFixed(2)}deg`);
        stack.style.setProperty("--scroll-glove-depth", `${gloveDepth.toFixed(2)}px`);
      });
    }
  };

  const queueApply = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(apply);
  };

  const onSpinStateChange = () => {
    queueApply();
  };

  window.addEventListener("foam-finger-spin-state-change", onSpinStateChange);

  const addDesktopListeners = () => {
    if (desktopListenersBound) return;
    desktopListenersBound = true;
    window.addEventListener("scroll", queueApply, { passive: true });
    window.addEventListener("resize", queueApply, { passive: true });
    window.addEventListener("orientationchange", queueApply);
  };

  const removeDesktopListeners = () => {
    if (!desktopListenersBound) return;
    desktopListenersBound = false;
    window.removeEventListener("scroll", queueApply);
    window.removeEventListener("resize", queueApply);
    window.removeEventListener("orientationchange", queueApply);
  };

  const syncMode = () => {
    if (mobileQuery.matches || reduceMotionQuery.matches) {
      removeDesktopListeners();
      clearTransforms();
      return;
    }

    addDesktopListeners();
    queueApply();
  };

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", syncMode);
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(syncMode);
  }

  if (typeof reduceMotionQuery.addEventListener === "function") {
    reduceMotionQuery.addEventListener("change", syncMode);
  } else if (typeof reduceMotionQuery.addListener === "function") {
    reduceMotionQuery.addListener(syncMode);
  }

  syncMode();
}