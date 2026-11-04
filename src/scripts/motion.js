// Scroll motion: GSAP and ScrollTrigger, with Lenis smoothing the scroll. Nothing moves under "reduce motion".
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });
document.fonts?.ready.then(() => ScrollTrigger.refresh());

export { gsap, ScrollTrigger };
const motion = '(prefers-reduced-motion: no-preference)';

export let lenis = null;
gsap.matchMedia().add(motion, () => {
  const nav = document.getElementById('navigation');
  lenis = new Lenis({ lerp: 0.09, anchors: { offset: -(nav?.offsetHeight ?? 0) } });
  const tick = time => lenis.raf(time * 1000);
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return () => { gsap.ticker.remove(tick); gsap.ticker.lagSmoothing(500, 33); lenis.destroy(); lenis = null; };
});

// Runs a section's setup under gsap.matchMedia. A failing setup is reverted with every attribute
// it changed, so its section keeps the static layout and the rest of the page still moves.
export const scene = (id, setup) => {
  const media = gsap.matchMedia();
  const log = new MutationObserver(() => {});
  log.observe(document.documentElement, { attributes: true, attributeOldValue: true, subtree: true });
  try { media.add(motion, setup); }
  catch (error) {
    media.revert();
    for (const { target, attributeName, oldValue } of log.takeRecords().reverse()) {
      if (oldValue == null) target.removeAttribute(attributeName); else target.setAttribute(attributeName, oldValue);
    }
    console.error(`[motion] scene ${id} failed; its section stays static`, error);
  }
  finally { log.disconnect(); }
};

// Layout position from offsets, so transforms already applied by a scroll animation don't skew it.
export const box = element => {
  let x = 0, y = 0;
  for (let node = element; node; node = node.offsetParent) { x += node.offsetLeft; y += node.offsetTop; }
  const w = element.offsetWidth, h = element.offsetHeight;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
};

// True when section b follows section a, so a hand-off between them still makes sense after a reorder.
export const adjacent = (a, b) => {
  const order = [...document.querySelectorAll('[data-8b-section]')].map(section => section.id).filter(id => id !== 'navigation');
  return order.includes(a) && order[order.indexOf(a) + 1] === b;
};

// .is-offscreen pauses a section's endless CSS loops.
export const watchOffscreen = element => new IntersectionObserver(([entry]) => element.classList.toggle('is-offscreen', !entry.isIntersecting)).observe(element);

const splitWords = element => {
  const original = element.innerHTML;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    const fragment = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach(part => {
      if (!part) return;
      if (/^\s+$/.test(part)) return fragment.append(part);
      const word = document.createElement('span');
      word.className = 'ink__word';
      word.textContent = part;
      fragment.append(word);
    });
    node.replaceWith(fragment);
  });
  return () => { element.innerHTML = original; };
};

// data-8b-motion: rise (a heading slides up and its dot drops in), ink (words darken with the scroll),
// iris (an image opens from a circle).
scene('effects', () => {
  const bound = name => [...document.querySelectorAll(`[data-8b-motion~="${name}"]`)];
  bound('rise').forEach(element => {
    const dot = element.querySelector('.m-dot');
    const timeline = gsap.timeline({ paused: true })
      .fromTo(element, { yPercent: 38, clipPath: 'inset(0% -6% 100% -6%)' }, { yPercent: 0, clipPath: 'inset(-30% -6% -30% -6%)', duration: 0.95, ease: 'expo.out', clearProps: 'clipPath,transform' }, 0);
    if (dot) timeline.fromTo(dot, { scale: 0, yPercent: -260 }, { scale: 1, yPercent: 0, duration: 0.75, ease: 'back.out(2.2)', clearProps: 'transform' }, 0.42);
    ScrollTrigger.create({ trigger: element, start: 'top 88%', once: true, animation: timeline });
  });
  const reverts = bound('ink').map(element => {
    const revert = splitWords(element);
    gsap.fromTo(element.querySelectorAll('.ink__word'), { opacity: 0.16 }, { opacity: 1, duration: 0.3, stagger: 0.06, ease: 'none', scrollTrigger: { trigger: element, start: 'top 88%', end: 'bottom 68%', scrub: 0.4 } });
    return revert;
  });
  bound('iris').forEach(element => {
    const image = element.querySelector('img');
    const timeline = gsap.timeline({ paused: true })
      .fromTo(element, { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)', duration: 1.15, ease: 'expo.inOut', clearProps: 'clipPath' }, 0);
    if (image) timeline.fromTo(image, { scale: 1.2 }, { scale: 1, duration: 1.5, ease: 'expo.out', clearProps: 'transform' }, 0.15);
    ScrollTrigger.create({ trigger: element, start: 'top 86%', once: true, animation: timeline });
  });
  return () => reverts.forEach(revert => revert());
});
