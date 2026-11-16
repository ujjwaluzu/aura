// Native view timelines need no scroll handler. Older browsers scrub paused
// Web Animations using geometry cached only when the layout changes.
const root = document.documentElement;
const preference = matchMedia('(prefers-reduced-motion: reduce)');
const targets = [...document.querySelectorAll('[data-motion]')];
const native = root.dataset.scrollMotion === 'native';
const settled = new WeakSet();
let disposeFallback;

function prepareMotion() {
  disposeFallback?.();
  disposeFallback = undefined;
  if (preference.matches) {
    delete root.dataset.scrollMotion;
    return;
  }
  if (native) {
    root.dataset.scrollMotion = 'native';
    return;
  }
  if (typeof Element.prototype.animate !== 'function') return;

  root.dataset.scrollMotion = 'fallback';
  let frame = 0;
  let dirty = true;
  let settleVisible = true;
  let viewport = 0;
  let effects = [];
  let disposed = false;

  function measure() {
    viewport = innerHeight;
    const position = scrollY;
    // Read every box/style before creating or updating effects. offsetTop is
    // independent of both the scroll translate and the hover transform.
    const boxes = targets.map((element) => {
      let top = 0;
      for (let box = element; box; box = box.offsetParent) top += box.offsetTop;
      const style = getComputedStyle(element);
      return {
        element,
        top,
        height: element.offsetHeight,
        stagger: parseFloat(style.getPropertyValue('--motion-stagger')) / 100,
        distance: parseFloat(style.getPropertyValue('--motion-distance')),
        opacity: parseFloat(style.getPropertyValue('--motion-opacity')),
        parallax: parseFloat(style.getPropertyValue('--motion-parallax')),
      };
    });
    effects.forEach(({ animation }) => animation.cancel());
    effects = boxes.flatMap((box) => {
      const { element, top, height, distance, opacity, parallax } = box;
      if (settleVisible && top < position + viewport && top + height > position)
        settled.add(element);
      if (settled.has(element)) return [];
      const screenshot = element.dataset.motion === 'screenshot';
      const animation = element.animate(
        screenshot
          ? [
              { translate: `0 ${parallax}px` },
              { translate: `0 ${-parallax}px` },
            ]
          : [
              { opacity, translate: `0 ${distance}px` },
              { opacity: 1, translate: '0 0px' },
            ],
        {
          duration: 1000,
          fill: 'both',
          easing: screenshot ? 'linear' : 'cubic-bezier(.22, 1, .36, 1)',
        },
      );
      animation.pause();
      return [{ ...box, screenshot, animation }];
    });
    settleVisible = false;
    dirty = false;
  }

  function update() {
    frame = 0;
    if (dirty) measure();
    const position = scrollY;
    effects.forEach(({ top, height, stagger, screenshot, animation }) => {
      const passage = viewport + height;
      const start = top - viewport + (screenshot ? 0 : passage * stagger);
      const range = passage * (screenshot ? 1 : 0.2);
      animation.currentTime =
        Math.max(0, Math.min(1, (position - start) / range)) * 1000;
    });
  }

  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(update);
  }
  function invalidate() {
    dirty = true;
    schedule();
  }
  function restore() {
    settleVisible = true;
    invalidate();
  }

  const observer = new ResizeObserver(invalidate);
  observer.observe(document.body);
  targets.forEach((element) => observer.observe(element));
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', invalidate);
  window.addEventListener('pageshow', restore);
  document.fonts.ready.then(() => {
    if (!disposed) invalidate();
  });
  update();

  disposeFallback = () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', invalidate);
    window.removeEventListener('pageshow', restore);
    effects.forEach(({ animation }) => animation.cancel());
  };
}

preference.addEventListener('change', prepareMotion);
prepareMotion();
