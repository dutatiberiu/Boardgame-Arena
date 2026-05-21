/* ============================================================
 * doodles.js — Bibliotecă de doodle-uri pentru Doodle Club
 * ============================================================
 *
 * Funcționalități:
 *   1. Auto-discovery: elementele cu data-doodle sunt înlocuite cu SVG-ul corespunzător
 *   2. API programatic: Doodles.insert(target, options) și Doodles.scatter(target, options)
 *   3. Plasare random pe margini cu Doodles.scatterMargins(options)
 *
 * Folosire de bază în HTML:
 *   <span data-doodle="d05" data-size="md" data-rotate="-8"></span>
 *   <span data-doodle="random" data-category="animals"></span>
 *
 * Folosire programatică:
 *   Doodles.scatterMargins({ count: 12, sides: ['left', 'right'] });
 *
 * Note:
 *   - Trebuie inclus doodles.svg în pagină (inline sau prin <object>/<img>)
 *   - Calea către sprite-ul SVG poate fi setată prin Doodles.spritePath = '/assets/doodles.svg'
 * ============================================================ */

(function (global) {
  'use strict';

  // ID-uri disponibile, organizate pe categorii (pentru filtrare aleatoare)
  const CATEGORIES = {
    characters: ['d01', 'd02', 'd03', 'd04', 'd05', 'd06', 'd07', 'd08'],
    scribbles:  ['d09', 'd10', 'd11', 'd12', 'd13', 'd14', 'd15', 'd16'],
    imaginary:  ['d17', 'd18', 'd19', 'd20', 'd21', 'd22', 'd23', 'd24'],
    text:       ['d25', 'd26', 'd27', 'd28', 'd29', 'd30', 'd31', 'd32'],
    animals:    ['d33', 'd34', 'd35', 'd36', 'd37', 'd38', 'd39', 'd40'],
    boredom:    ['d41', 'd42', 'd43', 'd44', 'd45', 'd46', 'd47', 'd48']
  };
  const ALL_IDS = Object.values(CATEGORIES).flat();

  const Doodles = {
    spritePath: 'doodles.svg',

    /**
     * Generează un <svg> pentru doodle-ul cu ID-ul specificat
     * @param {string} id - ex. 'd05'
     * @param {object} opts - { size, rotate, fade, ink, accent, hoverWiggle }
     * @returns {SVGElement}
     */
    create(id, opts = {}) {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.classList.add('doodle');

      if (opts.size)   svg.setAttribute('data-size', opts.size);
      if (opts.rotate !== undefined) svg.setAttribute('data-rotate', opts.rotate);
      if (opts.fade)   svg.setAttribute('data-fade', opts.fade);
      if (opts.hoverWiggle) svg.setAttribute('data-hover', 'wiggle');

      // Inline color overrides (opțional)
      if (opts.ink)    svg.style.color = opts.ink;
      if (opts.accent) svg.style.setProperty('--accent', opts.accent);

      const use = document.createElementNS(NS, 'use');
      use.setAttribute('href', `${this.spritePath}#${id}`);
      svg.appendChild(use);

      return svg;
    },

    /**
     * Alege un ID aleator (opțional dintr-o categorie anume)
     * @param {string|null} category - 'characters' | 'scribbles' | ... | null pentru toate
     */
    randomId(category = null) {
      const pool = category && CATEGORIES[category] ? CATEGORIES[category] : ALL_IDS;
      return pool[Math.floor(Math.random() * pool.length)];
    },

    /**
     * Înlocuiește toate elementele <span data-doodle="..."> cu SVG-urile lor
     * Apelează automat la DOMContentLoaded
     */
    autoReplace(root = document) {
      const placeholders = root.querySelectorAll('[data-doodle]');
      placeholders.forEach(el => {
        if (el.dataset.doodleProcessed) return; // evită dublarea

        let id = el.dataset.doodle;
        if (id === 'random') {
          id = this.randomId(el.dataset.category);
        }
        if (!ALL_IDS.includes(id)) {
          console.warn(`[Doodles] ID necunoscut: ${id}`);
          return;
        }

        const svg = this.create(id, {
          size:        el.dataset.size,
          rotate:      el.dataset.rotate,
          fade:        el.dataset.fade,
          ink:         el.dataset.ink,
          accent:      el.dataset.accent,
          hoverWiggle: el.dataset.hover === 'wiggle'
        });

        // Mută atributele de poziționare (style cu top/left/right/bottom)
        if (el.style.cssText) svg.style.cssText += el.style.cssText;
        // Mută clasele suplimentare
        el.classList.forEach(c => svg.classList.add(c));

        el.replaceWith(svg);
      });
    },

    /**
     * Inserează un doodle ca copil al elementului `target`
     * @param {Element|string} target - element sau CSS selector
     * @param {object} opts - { id, category, size, rotate, fade, position }
     */
    insert(target, opts = {}) {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) return null;

      const id = opts.id || this.randomId(opts.category);
      const svg = this.create(id, opts);

      if (opts.position) {
        svg.style.position = 'absolute';
        Object.assign(svg.style, opts.position); // ex. { top: '20px', left: '10px' }
      }

      el.appendChild(svg);
      return svg;
    },

    /**
     * Risipește doodle-uri aleatoriu pe marginile paginii sau ale unui container
     * @param {object} opts - {
     *   count: număr de doodle-uri (default 10),
     *   container: elementul în care se inserează (default body),
     *   sides: ['left', 'right', 'top', 'bottom'] (default toate),
     *   marginWidth: cât de „lat" e marginea în px (default 80),
     *   categories: filtrare ['scribbles', 'boredom'] (default toate),
     *   sizes: ['sm', 'md', 'lg'] (default mixt),
     *   minSpacing: distanță minimă verticală între doodle-uri (default 120px),
     *   seed: pentru reproducere (opțional, integer)
     * }
     */
    scatterMargins(opts = {}) {
      const config = Object.assign({
        count: 10,
        container: document.body,
        sides: ['left', 'right'],
        marginWidth: 80,
        categories: null,
        sizes: ['sm', 'md', 'lg'],
        minSpacing: 120,
        fadeRange: ['light', 'medium'],
        rotateRange: [-12, 12],
        seed: null
      }, opts);

      // PRNG cu seed (Mulberry32) pentru reproducere
      const rng = config.seed !== null ? mulberry32(config.seed) : Math.random;

      // Container container pentru toate doodle-urile
      let wrap = config.container.querySelector('.doodle-margins');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'doodle-margins';
        config.container.style.position = config.container.style.position || 'relative';
        config.container.prepend(wrap);
      }

      const placedY = { left: [], right: [], top: [], bottom: [] };
      const height = config.container.scrollHeight || config.container.offsetHeight || window.innerHeight;
      const width  = config.container.offsetWidth || window.innerWidth;

      for (let i = 0; i < config.count; i++) {
        const side = config.sides[Math.floor(rng() * config.sides.length)];
        const size = config.sizes[Math.floor(rng() * config.sizes.length)];
        const fade = config.fadeRange[Math.floor(rng() * config.fadeRange.length)];
        const rotate = Math.round(
          config.rotateRange[0] + rng() * (config.rotateRange[1] - config.rotateRange[0])
        );
        const category = config.categories
          ? config.categories[Math.floor(rng() * config.categories.length)]
          : null;
        const id = this.randomId(category);

        const svg = this.create(id, { size, fade, rotate });

        // Plasare cu evitare suprapuneri
        let position;
        let tries = 0;
        do {
          position = this._randomMarginPosition(side, width, height, config.marginWidth, rng);
          tries++;
        } while (
          tries < 20 &&
          this._tooClose(position, placedY[side], config.minSpacing)
        );
        placedY[side].push(position.anchor);

        Object.assign(svg.style, position.css);
        wrap.appendChild(svg);
      }

      return wrap;
    },

    /** @internal */
    _randomMarginPosition(side, w, h, marginW, rng) {
      const offset = Math.round(rng() * marginW);
      const css = {};
      let anchor;
      switch (side) {
        case 'left':
          css.left = `${offset}px`;
          css.top = `${Math.round(rng() * (h - 100))}px`;
          anchor = parseInt(css.top);
          break;
        case 'right':
          css.right = `${offset}px`;
          css.top = `${Math.round(rng() * (h - 100))}px`;
          anchor = parseInt(css.top);
          break;
        case 'top':
          css.top = `${offset}px`;
          css.left = `${marginW + Math.round(rng() * (w - 2 * marginW - 100))}px`;
          anchor = parseInt(css.left);
          break;
        case 'bottom':
          css.bottom = `${offset}px`;
          css.left = `${marginW + Math.round(rng() * (w - 2 * marginW - 100))}px`;
          anchor = parseInt(css.left);
          break;
      }
      return { css, anchor };
    },

    /** @internal */
    _tooClose(pos, placed, minSpacing) {
      return placed.some(y => Math.abs(y - pos.anchor) < minSpacing);
    },

    /** Returnează toate categoriile disponibile (pentru debug/UI) */
    categories() { return Object.keys(CATEGORIES); },
    /** Returnează toate ID-urile disponibile */
    allIds() { return [...ALL_IDS]; }
  };

  // Mulberry32 PRNG — deterministic, cu seed
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = seed;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Auto-replace la încărcare
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Doodles.autoReplace());
  } else {
    Doodles.autoReplace();
  }

  global.Doodles = Doodles;

})(window);
