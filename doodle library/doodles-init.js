// doodles-init.js — Inițializare uniformă pe toate paginile Caiet de Jocuri
// Plasează mâzgălituri în afara conținutului, în marginile libere ale paginii.
(function () {
  'use strict';

  Doodles.spritePath = '';

  function run() {
    // Caută cel mai îngust element de conținut dintre candidații cunoscuți
    // (diferite pagini folosesc selectori diferiți: .page, .arena, main, header)
    var candidates = ['.page', '.arena', 'main', 'header'];
    var contentW = window.innerWidth;
    for (var i = 0; i < candidates.length; i++) {
      var el = document.querySelector(candidates[i]);
      if (el) {
        var w = el.getBoundingClientRect().width;
        if (w >= 200 && w < contentW) contentW = w;
      }
    }

    // Calculează cât spațiu liber e în stânga/dreapta față de viewport
    var margin = Math.floor((window.innerWidth - contentW) / 2) - 10;
    if (margin < 28) return; // ecran prea îngust

    // minSpacing = dimensiunea celui mai mare doodle (md=48px) + 10px gap
    // ca să nu se suprapună vertical niciodată
    var minSpacing = 58;

    // Câte doodle-uri încap pe fiecare parte fără suprapunere
    var pageHeight = Math.max(document.body.scrollHeight, window.innerHeight);
    var perSide    = Math.floor(pageHeight / minSpacing);
    var count      = perSide * 2; // stânga + dreapta

    Doodles.scatterMargins({
      container:   document.body,
      count:       count,
      sides:       ['left', 'right'],
      marginWidth: margin,
      categories:  ['scribbles', 'imaginary', 'boredom', 'animals', 'characters', 'text'],
      sizes:       ['xs', 'sm', 'md'],
      minSpacing:  minSpacing,
      fadeRange:   ['light', 'medium'],
      seed:        42
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
}());
