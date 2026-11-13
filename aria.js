// ============================================================
// ARIA — Assistente de voz dentro do sistema (popup ao lado do sino).
// Conversa com o assistente local (Flask/Ollama) em CONFIG.ariaUrl.
// Só aparece para administradores (Matheus e Simone) por enquanto.
// Tudo aqui é visual + voz; a "inteligência" roda no assistente local.
// ============================================================
(function () {
  'use strict';

  // ---- Estilos (injetados uma vez) ----
  function injetarCSS() {
    if (document.getElementById('aria-css')) return;
    const css = `
    #btn-aria { margin-left:auto; position:relative; background:none; border:none; cursor:pointer;
      flex-shrink:0; padding:2px 6px; line-height:0; border-radius:50%; transition:transform .15s, filter .2s; }
    #btn-aria img { width:30px; height:30px; border-radius:50%; display:block;
      filter:drop-shadow(0 0 3px rgba(56,189,248,.5)); }
    #btn-aria:hover { transform:scale(1.08); }
    #btn-aria:hover img { filter:drop-shadow(0 0 7px rgba(56,189,248,.9)); }

    #aria-backdrop { position:fixed; inset:0; z-index:4000; background:rgba(2,6,23,.45);
      opacity:0; pointer-events:none; transition:opacity .2s; }
    #aria-backdrop.aberto { opacity:1; pointer-events:auto; }

    #aria-popup { position:fixed; z-index:4001; top:64px; right:18px; width:420px; max-width:calc(100vw - 24px);
      height:620px; max-height:calc(100vh - 86px); background:#0f172a; color:#e2e8f0; border:1px solid #334155;
      border-radius:16px; box-shadow:0 18px 60px rgba(0,0,0,.55); display:none; flex-direction:column; overflow:hidden;
      transform-origin:top right; }
    #aria-popup.aberto { display:flex; animation:aria-expandir .28s cubic-bezier(.16,1,.3,1); }
    @keyframes aria-expandir { from { opacity:0; transform:scale(.12) translate(40px,-40px); }
      to { opacity:1; transform:scale(1) translate(0,0); } }

    .aria-head { display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid #1e293b; }
    .aria-head img { width:30px; height:30px; border-radius:50%; }
    .aria-head .aria-tit { font-weight:700; letter-spacing:1px; font-size:15px; }
    .aria-head .aria-sub { font-size:11px; color:#64748b; }
    .aria-head .aria-acoes { margin-left:auto; display:flex; gap:4px; }
    .aria-head button { background:none; border:none; color:#94a3b8; cursor:pointer; font-size:15px; padding:4px 6px; border-radius:8px; }
    .aria-head button:hover { background:#1e293b; color:#e2e8f0; }

    #aria-conversa { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:8px; }
    .aria-bolha { max-width:85%; padding:9px 12px; border-radius:13px; line-height:1.4; font-size:14px;
      white-space:pre-wrap; word-wrap:break-word; }
    .aria-eu { align-self:flex-end; background:#0ea5e9; color:#001018; border-bottom-right-radius:4px; }
    .aria-ia { align-self:flex-start; background:#1e293b; border-bottom-left-radius:4px; }

    .aria-centro { padding:10px 14px 18px; border-top:1px solid #1e293b; display:flex; flex-direction:column; align-items:center; gap:8px; }
    #aria-status { font-size:12px; color:#64748b; min-height:16px; text-align:center; }
    #aria-mic { width:92px; height:92px; border-radius:50%; border:none; padding:0; background:none; cursor:pointer;
      position:relative; transition:transform .1s; }
    #aria-mic img { width:92px; height:92px; border-radius:50%; display:block;
      filter:drop-shadow(0 0 8px rgba(56,189,248,.45)); transition:filter .2s; }
    #aria-mic:active { transform:scale(.95); }
    /* Enquanto escuta: o LOGO fica parado; só os anéis pulsam ao redor + um brilho mais forte. */
    #aria-mic.ouvindo img { filter:drop-shadow(0 0 18px rgba(56,189,248,1)); }
    #aria-mic.ouvindo::before, #aria-mic.ouvindo::after { content:""; position:absolute; inset:-6px; border-radius:50%;
      border:2px solid rgba(56,189,248,.6); animation:aria-pulso 1.1s ease-out infinite; }
    #aria-mic.ouvindo::before { animation-delay:.55s; }
    @keyframes aria-pulso { 0%{transform:scale(1);opacity:.75} 100%{transform:scale(1.4);opacity:0} }
    @media (prefers-reduced-motion:reduce){ #aria-popup.aberto{animation:none}
      #aria-mic.ouvindo::before, #aria-mic.ouvindo::after{animation:none} }

    .aria-linha-texto { width:100%; display:flex; gap:6px; }
    #aria-entrada { flex:1; padding:9px 11px; border-radius:10px; border:1px solid #334155; background:#0b1220; color:#e2e8f0; font-size:14px; }
    #aria-enviar { padding:9px 12px; border-radius:10px; border:none; background:#38bdf8; color:#001018; font-weight:600; cursor:pointer; }

    /* Modo celular (link otimizado ?app=aria): ocupa a tela toda */
    body.aria-mobile #aria-popup.aberto { top:0; right:0; left:0; bottom:0; width:100%; max-width:100%;
      height:100%; max-height:100%; border-radius:0; border:none; }
    @media (max-width:520px) {
      #aria-popup { top:56px; right:8px; left:8px; width:auto; height:calc(100vh - 72px); }
    }`;
    const el = document.createElement('style');
    el.id = 'aria-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ---- Voz (fala do navegador; melhor no Edge) ----
  let vozPt = null;
  let _mudo = false;
  try { _mudo = localStorage.getItem('aria_mudo') === '1'; } catch (e) {}
  function carregarVoz() {
    const vozes = speechSynthesis.getVoices();
    const br = vozes.filter(v => /pt[-_]BR/i.test(v.lang));
    const pt = vozes.filter(v => /^pt/i.test(v.lang));
    const natural = arr => arr.find(v => /natural|neural|online/i.test(v.name));
    vozPt = natural(br) || natural(pt) || br[0] || pt[0] || null;
  }
  if ('speechSynthesis' in window) { carregarVoz(); speechSynthesis.onvoiceschanged = carregarVoz; }
  let _audioAtual = null;
  function pararAudio() {
    if (_audioAtual) { try { _audioAtual.pause(); } catch (e) {} _audioAtual = null; }
    if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) {} }
  }
  // Voz do navegador (reserva, caso a voz do Piper não esteja disponível).
  function falarNavegador(texto) {
    if (!('speechSynthesis' in window) || !texto) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR';
    if (vozPt) u.voice = vozPt;
    u.rate = 1.03;
    speechSynthesis.speak(u);
  }
  // Fala: tenta a voz do Piper (gerada no assistente) e, se falhar, usa a do navegador.
  async function falar(texto) {
    if (_mudo || !texto) return;
    pararAudio();
    const url = baseUrl();
    if (url) {
      try {
        const r = await fetch(url + '/falar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: texto })
        });
        if (r.ok) {
          const blob = await r.blob();
          if (blob && blob.size > 44) {   // 44 bytes = cabeçalho WAV vazio
            const a = new Audio(URL.createObjectURL(blob));
            _audioAtual = a;
            const limpa = () => { try { URL.revokeObjectURL(a.src); } catch (e) {} };
            a.onended = limpa; a.onerror = limpa;
            await a.play();
            return;
          }
        }
      } catch (e) { /* sem Piper -> cai para a voz do navegador */ }
    }
    falarNavegador(texto);
  }
  // Liga/desliga a voz (fica salvo no navegador). Botão ao lado da lixeira.
  function aplicarMudo() {
    const b = document.getElementById('aria-mudo');
    if (!b) return;
    b.innerHTML = _mudo ? '<i class="bi bi-volume-mute-fill"></i>' : '<i class="bi bi-volume-up-fill"></i>';
    b.title = _mudo ? 'Ligar a voz' : 'Desligar a voz';
    b.style.color = _mudo ? '#ef4444' : '';
  }
  function alternarMudo() {
    _mudo = !_mudo;
    try { localStorage.setItem('aria_mudo', _mudo ? '1' : '0'); } catch (e) {}
    if (_mudo) pararAudio();
    aplicarMudo();
  }

  // Frases de espera (sacola embaralhada: usa todas antes de repetir)
  const ESPERAS = ['Deixa eu verificar…', 'Só um instante…', 'Analisando os dados…', 'Já te respondo…',
    'Deixa eu conferir aqui…', 'Um momentinho…', 'Certo, consultando…'];
  let _bolsa = [], _ultima = null;
  function fraseEspera() {
    if (!_bolsa.length) {
      _bolsa = ESPERAS.slice().sort(() => Math.random() - 0.5);
      if (_bolsa[0] === _ultima && _bolsa.length > 1) _bolsa.push(_bolsa.shift());
    }
    _ultima = _bolsa.shift();
    return _ultima;
  }

  // ---- Monta o popup uma vez ----
  let conversa, statusEl, mic, entrada;
  function montarPopup() {
    if (document.getElementById('aria-popup')) return;
    injetarCSS();
    const logo = 'aria-logo.png';

    const backdrop = document.createElement('div');
    backdrop.id = 'aria-backdrop';
    backdrop.onclick = fecharAria;

    const popup = document.createElement('div');
    popup.id = 'aria-popup';
    popup.innerHTML = `
      <div class="aria-head">
        <img src="${logo}" alt="ARIA" />
        <div>
          <div class="aria-tit">ARIA</div>
          <div class="aria-sub">Assistente virtual P&amp;R</div>
        </div>
        <div class="aria-acoes">
          <button id="aria-mudo" title="Desligar a voz"><i class="bi bi-volume-up-fill"></i></button>
          <button id="aria-limpar" title="Limpar conversa"><i class="bi bi-trash"></i></button>
          <button id="aria-fechar" title="Fechar"><i class="bi bi-x-lg"></i></button>
        </div>
      </div>
      <div id="aria-conversa"></div>
      <div class="aria-centro">
        <div id="aria-status">Toque no logo e fale.</div>
        <button id="aria-mic" title="Falar com a ARIA"><img src="${logo}" alt="Falar" /></button>
        <div class="aria-linha-texto">
          <input id="aria-entrada" placeholder="…ou digite e aperte Enter" />
          <button id="aria-enviar">Enviar</button>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    document.body.appendChild(popup);

    conversa = popup.querySelector('#aria-conversa');
    statusEl = popup.querySelector('#aria-status');
    mic = popup.querySelector('#aria-mic');
    entrada = popup.querySelector('#aria-entrada');

    popup.querySelector('#aria-fechar').onclick = fecharAria;
    popup.querySelector('#aria-limpar').onclick = limparConversa;
    popup.querySelector('#aria-mudo').onclick = alternarMudo;
    aplicarMudo();
    popup.querySelector('#aria-enviar').onclick = () => enviar(entrada.value);
    entrada.addEventListener('keydown', e => { if (e.key === 'Enter') enviar(entrada.value); });
    mic.onclick = microfoneClick;
    prepararReconhecimento();
  }

  function addBolha(texto, quem) {
    const d = document.createElement('div');
    d.className = 'aria-bolha ' + (quem === 'eu' ? 'aria-eu' : 'aria-ia');
    d.textContent = texto;
    conversa.appendChild(d);
    conversa.scrollTop = conversa.scrollHeight;
    return d;
  }

  // ---- Reconhecimento de voz (ouvir) ----
  let rec = null, ouvindo = false, cancelado = false;
  function prepararReconhecimento() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { return; }
    rec = new SR();
    rec.lang = 'pt-BR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    // Se o usuário cancelou (clicou de novo), ignora o que foi captado.
    rec.onresult = ev => { if (cancelado) { cancelado = false; return; } const txt = ev.results[0][0].transcript; enviar(txt); };
    rec.onerror = ev => { if (ev.error !== 'aborted') statusEl.textContent = 'Não consegui ouvir (' + ev.error + ').'; };
    rec.onend = () => { ouvindo = false; mic.classList.remove('ouvindo'); };
  }
  function microfoneClick() {
    if (!rec) { statusEl.textContent = 'Seu navegador não suporta voz — digite abaixo.'; return; }
    if (ouvindo) {                        // clicou de novo enquanto ouvia -> CANCELA
      cancelado = true;
      try { rec.abort(); } catch (e) { try { rec.stop(); } catch (_e) {} }
      ouvindo = false;
      mic.classList.remove('ouvindo');
      statusEl.textContent = 'Cancelado.';
      return;
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    try {
      cancelado = false;
      rec.start();
      ouvindo = true;
      mic.classList.add('ouvindo');   // anéis pulsam enquanto escuta
      statusEl.textContent = 'Ouvindo… fale agora.';
    } catch (e) { /* ignora start duplicado */ }
  }

  // ---- Enviar ao assistente ----
  let ocupado = false;
  function baseUrl() { return ((typeof CONFIG !== 'undefined' && CONFIG && CONFIG.ariaUrl) || '').replace(/\/+$/, ''); }
  async function enviar(texto) {
    texto = (texto || '').trim();
    if (!texto || ocupado) return;
    if (!baseUrl()) { addBolha('A ARIA ainda não está conectada (defina CONFIG.ariaUrl).', 'ia'); return; }
    ocupado = true;
    addBolha(texto, 'eu');
    entrada.value = '';
    const espera = fraseEspera();
    statusEl.textContent = espera;
    falar(espera);
    const bolhaIA = addBolha('…', 'ia');
    try {
      const r = await fetch(baseUrl() + '/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: texto })
      });
      const j = await r.json();
      bolhaIA.textContent = j.reply || '(sem resposta)';
      falar(j.reply || '');
    } catch (e) {
      bolhaIA.textContent = 'Não consegui falar com a ARIA. Verifique se o assistente está ligado no computador.';
    } finally {
      statusEl.textContent = 'Toque no logo e fale.';
      ocupado = false;
    }
  }

  async function limparConversa() {
    conversa.innerHTML = '';
    statusEl.textContent = 'Conversa limpa.';
    try { await fetch(baseUrl() + '/reset', { method: 'POST' }); } catch (e) {}
  }

  // ---- Abrir / fechar ----
  function abrirAria() {
    montarPopup();
    document.getElementById('aria-backdrop').classList.add('aberto');
    const p = document.getElementById('aria-popup');
    p.classList.add('aberto');
    // "acorda" a voz (alguns navegadores exigem um gesto antes de falar)
    if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) {} }
    setTimeout(() => entrada && entrada.focus(), 200);
  }
  function fecharAria() {
    const b = document.getElementById('aria-backdrop'); if (b) b.classList.remove('aberto');
    const p = document.getElementById('aria-popup'); if (p) p.classList.remove('aberto');
    if (rec && ouvindo) { try { rec.stop(); } catch (e) {} }
    pararAudio();
  }

  // ---- Mostra/esconde o botão conforme a permissão (chamado após o login) ----
  let _mobileAberto = false;
  function ariaAplicarVisibilidade() {
    const btn = document.getElementById('btn-aria');
    if (!btn) return;
    const liberado = (typeof isAdminUser === 'function' && isAdminUser()) && !!(typeof CONFIG !== 'undefined' && CONFIG && CONFIG.ariaUrl);
    btn.style.display = liberado ? '' : 'none';
    // Link otimizado para celular: gestao.prbelico.com.br/?app=aria abre a ARIA em tela cheia
    if (liberado && !_mobileAberto && /(?:^|[?&])app=aria(?:&|$)/.test(location.search)) {
      _mobileAberto = true;
      document.body.classList.add('aria-mobile');
      setTimeout(abrirAria, 300);
    }
  }

  // Expõe as funções que o sistema usa
  window.abrirAria = abrirAria;
  window.fecharAria = fecharAria;
  window.ariaAplicarVisibilidade = ariaAplicarVisibilidade;

  // À PROVA DE FALHAS: o app.js chama a função no login, mas o próprio ARIA também verifica
  // sozinho (a cada 0,8s) até o login acontecer, e então mostra o botão. Assim não depende
  // da ordem/tempo de carregamento dos scripts (era por isso que o botão não aparecia).
  const _poll = setInterval(function () {
    try { ariaAplicarVisibilidade(); } catch (e) {}
    const b = document.getElementById('btn-aria');
    if (b && b.style.display !== 'none') clearInterval(_poll);
  }, 800);
  setTimeout(function () { clearInterval(_poll); }, 90000);
})();
