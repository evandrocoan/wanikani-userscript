// ==UserScript==
// @name         WaniKani Community prioritize Japanese glyphs
// @namespace    https://github.com/patarapolw
// @version      0.1.3
// @description  Prioritization of Japanese glyphs for Han unification
// @author       polv
// @license      MIT
// @match        https://community.wanikani.com/*
// @icon         https://www.google.com/s2/favicons?domain=community.wanikani.com
// @grant        none
// ==/UserScript==

(() => {
  // src/shared/inject-lang.ts
  function injectLangHTML(lang) {
    const obs = new MutationObserver(() => {
      if (document.documentElement.lang !== lang) {
        document.documentElement.lang = lang;
      }
    });
    obs.observe(document.documentElement, { attributeFilter: ["lang"] });
    document.documentElement.lang = lang;
  }

  // src/forum-jp-glyphs.ts
  injectLangHTML("ja-JP");
})();
