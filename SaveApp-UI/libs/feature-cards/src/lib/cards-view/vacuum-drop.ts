/** Attribute that marks an element (a collection tile) as a place a card can be dragged into. */
export const CARD_DROP_TARGET_ATTR = 'data-card-drop-target';
/** Class put on the drop target while a card hovers over it. */
export const CARD_DROP_HOVER_CLASS = 'card-drop-hover';

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** The drop target under a point, with the collection id it carries. */
export function dropTargetAt(x: number, y: number): HTMLElement | null {
  return (
    document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>(`[${CARD_DROP_TARGET_ATTR}]`) ?? null
  );
}

/**
 * Leans the drag preview's content toward `target`, or back upright when it is null. The CSS transition
 * on `.drag-handle` makes it smooth; `--lean` (1 or -1) says which side the target is on.
 */
export function leanToward(target: HTMLElement | null, pointerX: number): void {
  const preview = document.querySelector<HTMLElement>('.cdk-drag-preview');
  if (!preview) return;
  preview.classList.toggle('lean-toward-target', !!target);
  if (target) {
    const box = target.getBoundingClientRect();
    preview.style.setProperty(
      '--lean',
      pointerX < box.left + box.width / 2 ? '1' : '-1',
    );
  }
}

/**
 * Plays the "vacuum" drop: a copy of the drag preview resists, funnels toward the target (the edge facing
 * it shrinks first, as if pulled into a nozzle) and is slurped in; the target's hover class (its open
 * lid) is removed once the card is in.
 * The copy goes next to the preview (inside the list, see cdkDragPreviewContainer) so it keeps the inherited styles.
 * The real preview should be hidden by the caller.
 */
export function suckInto(preview: HTMLElement, target: HTMLElement): void {
  if (reducedMotion()) {
    target.classList.remove(CARD_DROP_HOVER_CLASS);
    return;
  }
  const from = preview.getBoundingClientRect();
  const to = target.getBoundingClientRect();

  // Freeze the copy at the preview's on-screen box, so the transforms below start from where it is.
  const ghost = preview.cloneNode(true) as HTMLElement;
  ghost.classList.remove('vacuum-hidden', 'cdk-drag-animating');
  // CDK's inline styles (and popover attribute, in newer CDKs) can keep the copy hidden: start clean.
  ghost.removeAttribute('style');
  ghost.style.setProperty('--lean', preview.style.getPropertyValue('--lean')); // keep the lean direction
  ghost.removeAttribute('popover');
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: '0',
    boxSizing: 'border-box',
    transformOrigin: '50% 50%',
    pointerEvents: 'none',
    zIndex: '1000',
    transition: 'none',
  });
  preview.after(ghost);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const len = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / len, dy / len];
  // Tilting away the edge that faces the target makes that edge shrink first: the "nozzle" funnel.
  const at = (t: number, nudge: number, tilt: number, scale: number) =>
    `perspective(700px) translate(${dx * t + ux * nudge}px, ${dy * t + uy * nudge}px) ` +
    `rotateY(${ux * tilt}deg) rotateX(${-uy * tilt}deg) scale(${scale})`;

  const suck = ghost.animate(
    [
      {
        transform: at(0, 0, 0, 1),
        opacity: 1,
        filter: 'blur(0px)',
        easing: 'ease-out',
      },
      { transform: at(0, 14, 8, 0.98), offset: 0.1, easing: 'ease-in-out' }, // tug toward the nozzle
      { transform: at(0, -6, 0, 1), offset: 0.2, easing: 'ease-in-out' }, // resists
      { transform: at(0, 18, 25, 0.94), offset: 0.32, easing: 'ease-in-out' }, // tug again
      {
        transform: at(0.12, 0, 50, 0.8),
        opacity: 1,
        offset: 0.5,
        easing: 'cubic-bezier(0.7, 0, 1, 0.6)',
      },
      { transform: at(1, 0, 78, 0.02), opacity: 0.2, filter: 'blur(2px)' }, // slurp
    ],
    { duration: 750 },
  );
  // Keep the target's lid open until the card is in, then let it snap shut.
  suck.onfinish = suck.oncancel = () => {
    ghost.remove();
    target.classList.remove(CARD_DROP_HOVER_CLASS);
  };
}

/** Closes the gap a card leaves in the list. Cancel the returned animation to show it again. */
export function collapse(el: HTMLElement): Animation {
  return el.animate(
    [
      { height: `${el.offsetHeight}px`, opacity: 0 },
      { height: '0px', opacity: 0 },
    ],
    {
      duration: reducedMotion() ? 0 : 280,
      delay: reducedMotion() ? 0 : 200,
      easing: 'ease-in',
      fill: 'forwards',
    },
  );
}
