// ==UserScript==
// @name         WaniKani Autoplay Sentence Audio
// @namespace    polv/wanikani
// @version      0.1
// @description  Autoplay audio sentences (via ImmersionKit.com), with customizability (via Anki-Connect)
// @author       polv
// @match        *://www.wanikani.com/review/session*
// @match        *://www.wanikani.com/extra_study/session*
// @match        *://www.wanikani.com/lesson/session*
// @require      https://greasyfork.org/scripts/430565-wanikani-item-info-injector/code/WaniKani%20Item%20Info%20Injector.user.js?version=1057854
// @require      https://raw.githubusercontent.com/patarapolw/wanikani-userscript/master/userscripts/shared/ankiconnect.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wanikani.com
// @grant        none
// ==/UserScript==

// TODO:
// @match        *://www.wanikani.com/*vocabulary/*

// @ts-check
/// <reference path="./types/wanikani.d.ts" />
/// <reference path="./types/item-info.d.ts" />
/// <reference path="./types/ankiconnect.d.ts" />
/// <reference path="./types/immersion-kit.d.ts" />

/// <reference path="./types/autoplay.user.d.ts" />
(function () {
  'use strict';

  // OPTIONS
  // TODO: Use wkof's dialog

  /**
   * See https://github.com/patarapolw/wanikani-userscript/blob/master/userscripts/types/autoplay.user.d.ts for typing
   *
   * @type {ScriptOptions}
   *
   * Remove IMMERSION_KIT or ANKI key to disable lookup
   */
  const OPTS = {
    HIDE_SENTENCE_JA: true,
    HIDE_SENTENCE_EN: 'remove',
    NUMBER_OF_SENTENCES: 3,
    IMMERSION_KIT: {
      priority: [
        'Death Note',
        'Hunter x Hunter',
        'Fullmetal Alchemist Brotherhood',
        "Kino's Journey",
        'Your Name',
        'Bakemonogatari',
      ],
    },
    ANKI: {
      model: 'yomichan-terms',
      searchFields: {
        vocabulary: ['JapaneseWanikani', 'Japanese'],
        reading: ['Reading'],
      },
      outFields: {
        sentence: [
          {
            ja: 'Sentence',
            audio: 'SentenceAudio',
            en: 'SentenceMeaning',
          },
        ],
      },
    },
    LOG: {
      immersionKit: false,
    },
  };

  // SCRIPT START

  const HTML_CLASS = 'wk-autoplay';
  const FURIGANA_FIELDS = new Set(
    OPTS.ANKI
      ? [
          ...OPTS.ANKI.searchFields.vocabulary,
          ...OPTS.ANKI.outFields.sentence.map((s) => s.ja).filter((f) => f),
        ]
      : undefined,
  );
  const ankiconnect = new AnkiConnect();

  const HIDDEN_UNTIL_HOVER_CLASS = 'hidden-until-hover';

  document.head.append(
    Object.assign(document.createElement('style'), {
      className: 'style--' + HTML_CLASS,
      innerHTML: `
    .${HTML_CLASS} .${HIDDEN_UNTIL_HOVER_CLASS}:not(:hover) {
      background-color:#ccc;
      color:#ccc;
      text-shadow:none;
    }

    .${HTML_CLASS} summary {
      display: revert;
    }
    `,
    }),
  );

  /** @type {import("./types/wanikani").WKCurrent<'vocabulary'>} */
  let current;
  /** @type {ISentence[]} */
  let sentences = [];
  /** @type {HTMLElement[]} */
  const autoplayDivArray = [];

  const onNewVocabulary = () => {
    autoplayDivArray.map((el) => el.remove());
    autoplayDivArray.splice(0, autoplayDivArray.length);

    sentences = [];

    setTimeout(() => {
      let key = 'currentItem';
      if (document.URL.includes('/lesson/session')) {
        key = $.jStorage.get('l/quizActive')
          ? 'l/currentQuizItem'
          : 'l/currentLesson';
      }

      const c =
        /** @type {import("./types/wanikani").WKCurrent<'vocabulary'>} */ (
          $.jStorage.get(key)
        );

      if (!c || !('voc' in c)) {
        return;
      }
      current = c;

      if (OPTS.ANKI) {
        const { model: noteType, searchFields, outFields } = OPTS.ANKI;
        const { voc, kana } = current;

        ankiconnect
          .send('findNotes', {
            query: [
              `"note:${noteType}"`,
              `(${searchFields.vocabulary
                .map((f) => `"${f}:${voc}"`)
                .join(' OR ')})`,
              `(${kana
                .flatMap((r) => searchFields.reading.map((f) => `"${f}:${r}"`))
                .join(' OR ')})`,
            ].join(' '),
          })
          .then((notes) => ankiconnect.send('notesInfo', { notes }))
          .then((notes) => {
            /**
             * @param {Pick<INote, 'fields'>} note
             * @param {string} fieldName
             */
            function getField(note, fieldName) {
              let { value = '' } = note.fields[fieldName] || {};

              if (FURIGANA_FIELDS.has(fieldName)) {
                value = value
                  .replace(/(\[.+?\])(.)/g, '$1 $2')
                  .replace(
                    /(^| )([^ \[]+)\[([^\]]+)\]/g,
                    '<ruby>$1<rt>$2</rt></ruby>',
                  );
              }

              return value;
            }

            const filteredNotes = notes
              .sort((n1, n2) =>
                [n1, n2]
                  .map((n1) =>
                    searchFields.vocabulary.findIndex((f) => getField(n1, f)),
                  )
                  .reduce((prev, c) => prev - c),
              )
              .filter((n) =>
                searchFields.reading
                  .flatMap((f) => getField(n, f).split('\n'))
                  .some((r) => kana.includes(r.trim())),
              );

            const n =
              filteredNotes.find((n) =>
                outFields.sentence.map((f) => getField(n, f.audio)),
              ) || filteredNotes[0];

            if (n) {
              sentences = outFields.sentence
                .map((f) => {
                  const out = {
                    ja: f.ja ? getField(n, f.ja) : undefined,
                    en: f.en ? getField(n, f.en) : undefined,
                    audio: '',
                  };

                  const m = /\[sound\:(.+?)\]/.exec(getField(n, f.audio));
                  if (m) {
                    const filename = m[1];

                    // [sound:https://...] works in AnkiDroid
                    if (/:\/\//.exec(filename)) {
                      out.audio = m[1];
                    } else {
                      ankiconnect
                        .send('retrieveMediaFile', { filename })
                        .then((r) => {
                          let mimeType = 'audio/mpeg';
                          const ext = m[1].replace(/^.+\./, '');
                          switch (ext) {
                            default:
                              mimeType = `audio/${ext}`;
                          }

                          out.audio = `data:${mimeType};base64,${r}`;
                        });
                    }
                  }

                  return out;
                })
                .filter(
                  (s) =>
                    (OPTS.HIDE_SENTENCE_JA === 'remove' ? false : s.ja) ||
                    s.audio,
                );

              if (sentences.length) {
                appender.renew();
              }
            }
          })
          .then(() => {
            const { IMMERSION_KIT } = OPTS;
            if (IMMERSION_KIT) {
              fetch(
                `https://api.immersionkit.com/look_up_dictionary?keyword=${voc}`,
              )
                .then((r) => r.json())
                .then((r) => {
                  const {
                    data: [{ examples }],
                  } = /** @type {ImmersionKitResult} */ (r);

                  /** @type {{[type: string]: (typeof examples)} & {'': {[type: string]: (typeof examples)}}} */
                  const sortedExamples = {};
                  /** @type {typeof examples} */
                  let remainingExamples = examples;

                  for (const p of IMMERSION_KIT.priority) {
                    /** @type {typeof examples} */
                    const currentExamples = [];
                    /** @type {typeof examples} */
                    const nextRemainingExamples = [];

                    for (const ex of remainingExamples) {
                      if (ex.deck_name === p) {
                        currentExamples.push(ex);
                      } else {
                        nextRemainingExamples.push(ex);
                      }
                    }

                    sortedExamples[p] = currentExamples;
                    remainingExamples = nextRemainingExamples;
                  }

                  sortedExamples[''] = remainingExamples.reduce((prev, c) => {
                    prev[c.deck_name] = prev[c.deck_name] || [];
                    prev[c.deck_name].push(c);
                    return prev;
                  }, {});

                  if (OPTS.LOG.immersionKit)
                    (window.unsafeWindow || window).console.log(sortedExamples);

                  for (const ss of [
                    ...IMMERSION_KIT.priority.map((p) => sortedExamples[p]),
                    Object.values(sortedExamples['']).reduce(
                      (prev, c) => [...prev, ...c],
                      [],
                    ),
                  ]) {
                    for (const s of shuffleArray(ss)) {
                      sentences.push({
                        ja: `${s.sentence} (${s.deck_name})`,
                        audio: s.sound_url,
                        en: s.translation,
                      });
                    }
                  }

                  appender.renew();
                });
            }
          });
      }
    }, 50);
  };

  const appender = wkItemInfo
    .on('lesson,lessonQuiz,review,extraStudy')
    .forType('vocabulary')
    .under('reading')
    .spoiling('reading')
    .appendAtTop('Autoplay Sentences', (state) => {
      if (!current) return;
      if (current.id !== state.id) return;

      const outputDiv = document.createElement('div');
      outputDiv.className = HTML_CLASS;

      /** @type {HTMLAudioElement | null} */
      let vocabAudioEl = null;
      if (current.aud) {
        /**
         * @type {Record<string, HTMLAudioElement>}
         */
        const vocabAudioEls = {};
        current.aud.map((a) => {
          const identifier = `${a.pronunciation}:${a.voice_actor_id}`;
          let audioEl = vocabAudioEls[identifier];
          if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.style.display = 'none';

            vocabAudioEls[identifier] = audioEl;
          }

          const source = document.createElement('source');
          source.type = a.content_type;
          source.src = a.url;

          audioEl.append(source);
        });

        const vocabAudioElArray = Object.values(vocabAudioEls);
        const n = Math.floor(vocabAudioElArray.length * Math.random());
        vocabAudioEl = vocabAudioElArray[n];
        outputDiv.append(vocabAudioEl);
        vocabAudioElArray.map((el, i) => (i !== n ? el.remove() : null));
      }

      let hasSentences = false;
      /** @type {HTMLAudioElement[]} */
      const sentenceAudioElArray = [];

      /**
       *
       * @param {HTMLElement} target
       * @param {ISentence[]} ss
       */
      const createSentenceSection = (target, ss) => {
        return ss.map((s) => {
          const section = document.createElement('section');

          if (s.ja && OPTS.HIDE_SENTENCE_JA !== 'remove') {
            const p = document.createElement('p');
            if (OPTS.HIDE_SENTENCE_JA) {
              p.className = HIDDEN_UNTIL_HOVER_CLASS;
            }
            p.lang = 'ja';
            p.innerText = s.ja;
            section.append(p);
          }

          if (s.audio) {
            const audio = document.createElement('audio');
            audio.setAttribute('data-sentence', '');
            audio.controls = true;

            audio.preload = 'none';
            audio.src = s.audio;

            const activateAudio = () => {
              if (!audio.src) {
                audio.src = s.audio;
              }
            };

            sentenceAudioElArray.push(audio);

            const p = document.createElement('p');
            p.append(audio);

            p.addEventListener('click', activateAudio);
            p.addEventListener('mouseenter', activateAudio);
            p.addEventListener('touchstart', activateAudio);

            section.append(p);
          }

          if (s.en && OPTS.HIDE_SENTENCE_EN !== 'remove') {
            const p = document.createElement('p');
            if (OPTS.HIDE_SENTENCE_EN) {
              p.className = HIDDEN_UNTIL_HOVER_CLASS;
            }
            p.lang = 'ja';
            p.innerText = s.en;
            section.append(p);
          }

          if (section.innerHTML) {
            hasSentences = true;
            target.append(section);
          }
        });
      };

      createSentenceSection(
        outputDiv,
        sentences.slice(0, OPTS.NUMBER_OF_SENTENCES),
      );

      let needAutoplay = true;

      if (autoplayDivArray[0]) {
        if (autoplayDivArray[0].querySelector('audio[data-sentence]')) {
          needAutoplay = false;
        }
      }
      if (autoplayDivArray[1]) {
        needAutoplay = false;
      }

      if (needAutoplay) {
        const autoplayDiv = document.createElement('div');
        autoplayDiv.style.display = 'none';

        if (!autoplayDivArray[0] && vocabAudioEl) {
          const el1 = /** @type {HTMLAudioElement} */ (
            vocabAudioEl.cloneNode(true)
          );
          el1.autoplay = true;
          autoplayDiv.append(el1);

          const firstSent = sentenceAudioElArray[0];
          if (firstSent) {
            const el2 = /** @type {HTMLAudioElement} */ (
              firstSent.cloneNode(true)
            );
            autoplayDiv.append(el2);
            el1.onended = () => {
              el2.play();
              el1.onended = null;
            };
          }
        } else {
          const firstSent = sentenceAudioElArray[0];
          if (firstSent) {
            const el2 = /** @type {HTMLAudioElement} */ (
              firstSent.cloneNode(true)
            );
            autoplayDiv.append(el2);

            el2.autoplay = true;
          }
        }

        autoplayDivArray.push(autoplayDiv);
        document.body.append(autoplayDiv);
      }

      if (sentences.length > OPTS.NUMBER_OF_SENTENCES) {
        const details = document.createElement('details');

        const summary = document.createElement('summary');
        summary.innerText = 'Additional Examples';
        details.append(summary);

        createSentenceSection(
          details,
          sentences.slice(OPTS.NUMBER_OF_SENTENCES),
        );
        outputDiv.append(details);
      }

      if (outputDiv.innerHTML && hasSentences) {
        return outputDiv;
      } else {
        outputDiv.remove();
      }
    });

  // $.jStorage.listenKeyChange('*', (key, state) =>
  //   (window.unsafeWindow || window).console.log(
  //     key,
  //     state,
  //     $.jStorage.get(key),
  //   ),
  // );

  $.jStorage.listenKeyChange('questionCount', onNewVocabulary);
  $.jStorage.listenKeyChange('l/currentLesson', onNewVocabulary);
  $.jStorage.listenKeyChange('l/currentQuizItem', onNewVocabulary);
  onNewVocabulary();

  /**
   * Fisher-Yates (aka Knuth) Shuffle
   *
   * https://stackoverflow.com/a/2450976/9023855
   *
   * @type {<T>(arr: T[]) => T[]}
   */
  function shuffleArray(array) {
    let currentIndex = array.length;
    let randomIndex;

    // While there remain elements to shuffle.
    while (currentIndex != 0) {
      // Pick a remaining element.
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;

      // And swap it with the current element.
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex],
        array[currentIndex],
      ];
    }

    return array;
  }
})();