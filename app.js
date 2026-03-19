/* ========================================================================
   LingoPad — React PWA for Language Study & Memorization
   ======================================================================== */

const { useState, useEffect, useCallback, useMemo, useRef } = React;

// ─── LocalStorage Hook ───────────────────────────────────────────────────────
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch { return initialValue; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);
  return [value, setValue];
}

// ─── Speech Helpers ──────────────────────────────────────────────────────────
function useVoices() {
  const [voices, setVoices] = useState([]);
  useEffect(() => {
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length) setVoices(v);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);
  return voices;
}

function speak(text, voice) {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) { u.voice = voice; u.lang = voice.lang; }
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
  return u;
}

// ─── Theme Hook ──────────────────────────────────────────────────────────────
function useTheme() {
  const [theme, setTheme] = useLocalStorage('lingopad_theme', 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    const mc = document.querySelector('meta[name="theme-color"]');
    if (mc) mc.setAttribute('content', theme === 'light' ? '#f1f5f9' : '#6366f1');
  }, [theme]);
  const toggle = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  return [theme, toggle];
}

// ─── Unique ID Generator ─────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ─── Toast Component ─────────────────────────────────────────────────────────
function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);
  return React.createElement('div', { className: 'toast' }, message);
}

// ─── Confirm Modal ───────────────────────────────────────────────────────────
function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return React.createElement('div', { className: 'modal-overlay', onClick: onCancel },
    React.createElement('div', {
      className: 'modal-box animate-slide-up',
      onClick: e => e.stopPropagation()
    },
      React.createElement('h3', null, title),
      React.createElement('p', null, message),
      React.createElement('div', { className: 'modal-actions' },
        React.createElement('button', { className: 'btn btn-outline', onClick: onCancel }, 'Cancelar'),
        React.createElement('button', { className: 'btn btn-danger', onClick: onConfirm }, 'Eliminar')
      )
    )
  );
}

// ─── Voice Selector component (reusable) ────────────────────────────────────
function VoiceSelector({ voices, voiceName, onChange, style }) {
  const uniqueVoices = useMemo(() => {
    const seen = new Map();
    voices.forEach(v => {
      if (!seen.has(v.lang)) seen.set(v.lang, v);
    });
    return Array.from(seen.values());
  }, [voices]);

  return React.createElement('select', {
    className: 'lang-selector',
    value: voiceName || '',
    onChange: e => onChange(e.target.value),
    title: 'Idioma del texto',
    style: style || {}
  },
    React.createElement('option', { value: '', disabled: true }, '🌐 Seleccionar idioma'),
    !voices.length
      ? React.createElement('option', null, 'Cargando…')
      : uniqueVoices.map(v =>
          React.createElement('option', { key: v.name, value: v.name },
            `${v.lang} – ${v.name.slice(0, 22)}`
          )
        )
  );
}

// ─── Text List (Home) ────────────────────────────────────────────────────────
function TextList({ texts, onSelect, onDelete }) {
  const [confirmId, setConfirmId] = useState(null);

  if (!texts.length) {
    return React.createElement('div', { className: 'empty-state animate-slide-up' },
      React.createElement('div', { className: 'empty-state-icon' }, '📚'),
      React.createElement('div', { className: 'empty-state-text' },
        'Aún no tienes textos guardados.',
        React.createElement('br'),
        'Pulsa el botón ',
        React.createElement('strong', null, '+'),
        ' para añadir uno.'
      )
    );
  }
  return React.createElement('div', { className: 'text-list' },
    texts.map((t, i) =>
      React.createElement('div', { key: t.id, className: 'card animate-slide-up', style: { animationDelay: `${i * 0.04}s` } },
        React.createElement('div', {
          style: { cursor: 'pointer' },
          onClick: () => onSelect(t.id)
        },
          React.createElement('div', { className: 'card-title' }, t.title || 'Sin título'),
          React.createElement('div', { className: 'card-preview' }, t.content.slice(0, 120)),
          React.createElement('div', { className: 'card-meta' },
            React.createElement('span', null, new Date(t.updatedAt).toLocaleDateString()),
            React.createElement('span', null, '•'),
            React.createElement('span', null, `${t.content.split(/\s+/).length} palabras`),
            t.voiceName ? React.createElement('span', {
              className: 'lang-badge'
            }, '🌐 ' + (t.voiceName.split(' ')[0] || t.voiceName).slice(0, 12)) : null
          )
        ),
        React.createElement('div', { className: 'actions-row' },
          React.createElement('button', {
            className: 'btn btn-ghost btn-icon',
            title: 'Eliminar',
            onClick: e => { e.stopPropagation(); setConfirmId(t.id); }
          }, '🗑️')
        ),
        confirmId === t.id && React.createElement(ConfirmModal, {
          title: '¿Eliminar texto?',
          message: `Se eliminará "${t.title || 'Sin título'}" de forma permanente.`,
          onConfirm: () => { onDelete(t.id); setConfirmId(null); },
          onCancel: () => setConfirmId(null)
        })
      )
    )
  );
}

// ─── Text Editor ─────────────────────────────────────────────────────────────
function TextEditor({ initial, onSave, onCancel, voices }) {
  const [title, setTitle] = useState(initial ? initial.title : '');
  const [content, setContent] = useState(initial ? initial.content : '');
  const [voiceName, setVoiceName] = useState(initial ? (initial.voiceName || '') : '');

  const handleSave = () => {
    if (!content.trim()) return;
    onSave({ title: title.trim() || 'Sin título', content: content.trim(), voiceName });
  };

  return React.createElement('div', { className: 'animate-slide-up' },
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, 'Título'),
      React.createElement('input', {
        className: 'input',
        placeholder: 'Ej: Capítulo 1 – Present Perfect',
        value: title,
        onChange: e => setTitle(e.target.value)
      })
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, 'Idioma del texto'),
      React.createElement(VoiceSelector, {
        voices: voices,
        voiceName: voiceName,
        onChange: setVoiceName,
        style: { maxWidth: '100%', width: '100%' }
      })
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, 'Contenido'),
      React.createElement('textarea', {
        className: 'textarea',
        placeholder: 'Pega o escribe el texto que quieres estudiar…',
        value: content,
        onChange: e => setContent(e.target.value),
        rows: 10
      })
    ),
    React.createElement('div', { style: { display: 'flex', gap: '0.5rem' } },
      React.createElement('button', { className: 'btn btn-primary', onClick: handleSave }, '💾 Guardar'),
      React.createElement('button', { className: 'btn btn-outline', onClick: onCancel }, 'Cancelar')
    )
  );
}

// ─── Interactive Word ────────────────────────────────────────────────────────
function Word({ word, voice, isBlank, revealed }) {
  const [speaking, setSpeaking] = useState(false);

  const handleClick = () => {
    if (isBlank && !revealed) return;
    setSpeaking(true);
    const u = speak(word, voice);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setTimeout(() => setSpeaking(false), 3000);
  };

  if (isBlank && !revealed) {
    return React.createElement('span', {
      className: `word-blank${revealed ? ' word-revealed' : ''}`
    }, word);
  }
  if (isBlank && revealed) {
    return React.createElement('span', {
      className: 'word-blank word-revealed',
      onClick: handleClick,
      style: { cursor: 'pointer' }
    }, word);
  }
  return React.createElement('span', {
    className: `word${speaking ? ' speaking' : ''}`,
    onClick: handleClick
  }, word);
}

// ─── Paragraph Block ─────────────────────────────────────────────────────────
function ParagraphBlock({ text, voice, blanks, revealed, index }) {
  const [playing, setPlaying] = useState(false);

  const handlePlay = () => {
    setPlaying(true);
    const u = speak(text, voice);
    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    // safety fallback
    setTimeout(() => setPlaying(false), text.length * 120);
  };

  // Split into words + whitespace
  const tokens = text.split(/(\s+)/);

  let wordIndex = 0;
  return React.createElement('div', { className: 'paragraph-block animate-slide-up', style: { animationDelay: `${index * 0.03}s` } },
    React.createElement('button', {
      className: `btn btn-icon btn-outline paragraph-play${playing ? ' btn-success' : ''}`,
      onClick: handlePlay,
      title: 'Escuchar párrafo',
      disabled: playing
    }, playing ? '🔊' : '▶️'),
    React.createElement('div', { className: 'paragraph-text' },
      tokens.map((token, i) => {
        if (/^\s+$/.test(token)) return token;
        const isBlank = blanks && blanks.has(wordIndex);
        const wi = wordIndex;
        wordIndex++;
        return React.createElement(Word, {
          key: `${i}-${wi}`,
          word: token,
          voice: voice,
          isBlank: isBlank,
          revealed: revealed
        });
      })
    )
  );
}

// ─── Reader View ─────────────────────────────────────────────────────────────
function ReaderView({ text, voice }) {
  const paragraphs = useMemo(() =>
    text.content.split(/\n+/).filter(p => p.trim()),
    [text.content]
  );

  return React.createElement('div', null,
    React.createElement('h2', {
      style: { fontSize: '1.15rem', fontWeight: 600, marginBottom: '1rem' }
    }, text.title),
    React.createElement('p', {
      style: { fontSize: '0.8rem', color: 'var(--clr-text-muted)', marginBottom: '1rem' }
    }, 'Haz clic en cualquier palabra para escucharla. Pulsa ▶️ para escuchar un párrafo completo.'),
    paragraphs.map((p, i) =>
      React.createElement(ParagraphBlock, {
        key: i,
        text: p,
        voice: voice,
        blanks: null,
        revealed: false,
        index: i
      })
    )
  );
}

// ─── Study View ──────────────────────────────────────────────────────────────
function StudyView({ text, voice }) {
  const [difficulty, setDifficulty] = useState(30); // % of words hidden
  const [revealed, setRevealed] = useState(false);
  const [seed, setSeed] = useState(Date.now());

  const paragraphs = useMemo(() =>
    text.content.split(/\n+/).filter(p => p.trim()),
    [text.content]
  );

  // Build blank sets per paragraph
  const blanksPerParagraph = useMemo(() => {
    const rng = mulberry32(seed);
    return paragraphs.map(p => {
      const words = p.split(/\s+/);
      const count = Math.max(1, Math.floor(words.length * difficulty / 100));
      const indices = new Set();
      let attempts = 0;
      while (indices.size < count && attempts < words.length * 3) {
        indices.add(Math.floor(rng() * words.length));
        attempts++;
      }
      return indices;
    });
  }, [paragraphs, difficulty, seed]);

  const handleNewRound = () => {
    setRevealed(false);
    setSeed(Date.now());
  };

  return React.createElement('div', null,
    React.createElement('h2', {
      style: { fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }
    }, '🧠 Modo Estudio'),
    React.createElement('p', {
      style: { fontSize: '0.8rem', color: 'var(--clr-text-muted)', marginBottom: '1rem' }
    }, 'Intenta recordar las palabras ocultas. Ajusta la dificultad con el slider.'),

    React.createElement('div', { className: 'study-controls' },
      React.createElement('span', {
        style: { fontSize: '0.8rem', color: 'var(--clr-text-muted)', minWidth: '60px' }
      }, `${difficulty}% oculto`),
      React.createElement('input', {
        type: 'range',
        min: 10,
        max: 80,
        step: 5,
        value: difficulty,
        className: 'difficulty-slider',
        onChange: e => { setDifficulty(Number(e.target.value)); setRevealed(false); setSeed(Date.now()); }
      }),
      React.createElement('button', {
        className: `btn ${revealed ? 'btn-outline' : 'btn-success'}`,
        onClick: () => setRevealed(!revealed),
        style: { fontSize: '0.82rem' }
      }, revealed ? '🙈 Ocultar' : '👁️ Revelar'),
      React.createElement('button', {
        className: 'btn btn-outline',
        onClick: handleNewRound,
        style: { fontSize: '0.82rem' }
      }, '🔄 Nuevo')
    ),

    paragraphs.map((p, i) =>
      React.createElement(ParagraphBlock, {
        key: `${i}-${seed}`,
        text: p,
        voice: voice,
        blanks: blanksPerParagraph[i],
        revealed: revealed,
        index: i
      })
    )
  );
}

// Simple seeded PRNG
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ─── Text Detail Screen (Tabs: Reader + Study) ──────────────────────────────
function TextDetail({ text, voices, onBack, onEdit, onChangeVoice }) {
  const [tab, setTab] = useState('reader');

  const voice = useMemo(() =>
    voices.find(v => v.name === text.voiceName) || voices[0] || null,
    [voices, text.voiceName]
  );

  return React.createElement('div', null,
    // Language selector bar for this text
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }
    },
      React.createElement('span', {
        style: { fontSize: '0.8rem', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }
      }, '🌐 Voz:'),
      React.createElement(VoiceSelector, {
        voices: voices,
        voiceName: text.voiceName || '',
        onChange: onChangeVoice,
        style: { flex: 1, maxWidth: '260px' }
      })
    ),
    React.createElement('div', { className: 'tabs' },
      React.createElement('button', {
        className: `tab${tab === 'reader' ? ' active' : ''}`,
        onClick: () => setTab('reader')
      }, '📖 Lector'),
      React.createElement('button', {
        className: `tab${tab === 'study' ? ' active' : ''}`,
        onClick: () => setTab('study')
      }, '🧠 Estudio'),
      React.createElement('button', {
        className: 'tab',
        onClick: onEdit
      }, '✏️ Editar')
    ),
    tab === 'reader'
      ? React.createElement(ReaderView, { text, voice })
      : React.createElement(StudyView, { text, voice })
  );
}

// ─── App Root ────────────────────────────────────────────────────────────────
function App() {
  const [texts, setTexts] = useLocalStorage('lingopad_texts', []);
  const [screen, setScreen] = useState('home'); // home | new | edit | detail
  const [activeId, setActiveId] = useState(null);
  const [toast, setToast] = useState(null);
  const [theme, toggleTheme] = useTheme();

  const voices = useVoices();

  const activeText = useMemo(() => texts.find(t => t.id === activeId), [texts, activeId]);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2400); };

  const handleSaveNew = ({ title, content, voiceName }) => {
    const t = { id: uid(), title, content, voiceName, createdAt: Date.now(), updatedAt: Date.now() };
    setTexts(prev => [t, ...prev]);
    setScreen('home');
    showToast('✅ Texto guardado');
  };

  const handleSaveEdit = ({ title, content, voiceName }) => {
    setTexts(prev => prev.map(t =>
      t.id === activeId ? { ...t, title, content, voiceName, updatedAt: Date.now() } : t
    ));
    setScreen('detail');
    showToast('✅ Cambios guardados');
  };

  const handleChangeVoice = (newVoiceName) => {
    setTexts(prev => prev.map(t =>
      t.id === activeId ? { ...t, voiceName: newVoiceName, updatedAt: Date.now() } : t
    ));
  };

  const handleDelete = id => {
    setTexts(prev => prev.filter(t => t.id !== id));
    if (activeId === id) { setScreen('home'); setActiveId(null); }
    showToast('🗑️ Texto eliminado');
  };

  const handleSelect = id => {
    setActiveId(id);
    setScreen('detail');
  };

  // ── Header ──
  const headerLeft = screen !== 'home'
    ? React.createElement('button', {
        className: 'header-back',
        onClick: () => {
          if (screen === 'edit') { setScreen('detail'); }
          else { setScreen('home'); setActiveId(null); }
          window.speechSynthesis.cancel();
        }
      }, '←')
    : null;

  const headerTitle = React.createElement('div', { className: 'header-title' },
    '📝 LingoPad'
  );

  // ── Content ──
  let content;
  if (screen === 'home') {
    content = React.createElement(React.Fragment, null,
      React.createElement(TextList, { texts, onSelect: handleSelect, onDelete: handleDelete }),
      React.createElement('button', {
        className: 'btn btn-primary btn-fab',
        onClick: () => setScreen('new'),
        title: 'Añadir texto'
      }, '+')
    );
  } else if (screen === 'new') {
    content = React.createElement(TextEditor, {
      initial: null,
      voices: voices,
      onSave: handleSaveNew,
      onCancel: () => setScreen('home')
    });
  } else if (screen === 'edit' && activeText) {
    content = React.createElement(TextEditor, {
      initial: activeText,
      voices: voices,
      onSave: handleSaveEdit,
      onCancel: () => setScreen('detail')
    });
  } else if (screen === 'detail' && activeText) {
    content = React.createElement(TextDetail, {
      text: activeText,
      voices: voices,
      onBack: () => { setScreen('home'); setActiveId(null); },
      onEdit: () => setScreen('edit'),
      onChangeVoice: handleChangeVoice
    });
  }

  const themeToggle = React.createElement('button', {
    className: 'theme-toggle',
    onClick: toggleTheme,
    title: theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'
  }, theme === 'dark' ? '☀️' : '🌙');

  return React.createElement(React.Fragment, null,
    React.createElement('header', { className: 'header' },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } },
        headerLeft,
        headerTitle
      ),
      themeToggle
    ),
    React.createElement('main', { className: 'main-content' }, content),
    toast && React.createElement(Toast, { message: toast, onDone: () => setToast(null) })
  );
}

// ─── Mount ───────────────────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));

// ─── Register Service Worker ─────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
