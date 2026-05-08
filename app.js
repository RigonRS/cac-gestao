/* ============================================================
   SISTEMA CAC GESTÃO — Lógica Principal
   ============================================================ */

// ---- ESTADO GLOBAL ----
const App = {
  graph: null,
  account: null,
  msal: null,

  // Cache de dados (evita recarregar a cada navegação)
  _cache: { clientes: null, armas: null, documentos: null, processos: null, clubes: null },
  invalidateCache(tipo) { if (tipo) this._cache[tipo] = null; else this._cache = { clientes: null, armas: null, documentos: null, processos: null, clubes: null }; },

  async getClientes()   { if (!this._cache.clientes)   this._cache.clientes   = await this.graph.getItems(CONFIG.listas.clientes);   return this._cache.clientes; },
  async getArmas()      { if (!this._cache.armas)      this._cache.armas      = await this.graph.getItems(CONFIG.listas.armas);      return this._cache.armas; },
  async getDocumentos() { if (!this._cache.documentos) this._cache.documentos = await this.graph.getItems(CONFIG.listas.documentos); return this._cache.documentos; },
  async getProcessos()  { if (!this._cache.processos)  this._cache.processos  = await this.graph.getItems(CONFIG.listas.processos);  return this._cache.processos; },
  async getClubes()     { if (!this._cache.clubes)     this._cache.clubes     = await this.graph.getItems(CONFIG.listas.clubes);     return this._cache.clubes; },
};

// ---- UTILITÁRIOS ----

function fmtCPF(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
          .replace(/(\d{3})(\d{3})(\d{3})$/, '$1.$2.$3')
          .replace(/(\d{3})(\d{3})$/, '$1.$2')
          .replace(/(\d{3})$/, '$1');
}
function fmtCelular(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length >= 10)  return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return d;
}
function fmtCEP(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 8);
  return d.replace(/(\d{5})(\d{3})/, '$1-$2');
}
function fmtCNPJ(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 14);
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}
function fmtCNPJouCPF(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 14);
  return d.length <= 11 ? fmtCPF(d) : fmtCNPJ(d);
}
function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = (iso.split('T')[0]).split('-');
  return `${d}/${m}/${y}`;
}
function toISO(br) {
  if (!br) return '';
  const [d, m, y] = br.split('/');
  return y && m && d ? `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}` : '';
}
function normISO(v) {
  if (!v) return '';
  const s = v.split('T')[0].trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return toISO(s);
}
function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function addMonths(isoDate, months) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}
function dataPorExtenso(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const m = ['janeiro','fevereiro','março','abril','maio','junho',
             'julho','agosto','setembro','outubro','novembro','dezembro'];
  return `${d.getDate()} de ${m[d.getMonth()]} de ${d.getFullYear()}`;
}
function imprimirDocumento(html, titulo) {
  const w = window.open('', '_blank', 'width=900,height=700');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titulo||'Documento'}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12pt;margin:3cm 2.5cm;line-height:1.7}
      h1,h2{text-align:center;font-size:13pt;text-transform:uppercase;margin-bottom:24px}
      p{text-align:justify;margin-bottom:14px}
      .assinatura{margin-top:60px;text-align:center}
      .assinatura-linha{border-top:1px solid #000;width:300px;margin:0 auto 4px}
      table{border-collapse:collapse;width:100%;font-size:10pt;margin-bottom:8px}
      td,th{border:1px solid #000;padding:4px 6px;vertical-align:top}
      .secao{background:#333;color:#fff;font-weight:bold;padding:4px 8px;font-size:10pt}
      @media print{body{margin:2cm}}
    </style>
  </head><body>${html}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 600);
}
function chk(v) { return v ? '(X)' : '(  )'; }
function toTitleCase(s) {
  if (!s) return '';
  return s.trim().toLowerCase().replace(/(^|\s)(\S)/g, (_, sp, ch) => sp + ch.toUpperCase());
}
// Calcula quanto foi recebido e quanto está pendente num processo
function calcPagamento(p) {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const valor = Number(p.ValorProcesso) || 0;
  if (!valor) return { recebido: 0, pendente: 0 };

  if (p.TipoPagamento === 'Parcelado') {
    const entrada      = Number(p.ValorEntrada) || 0;
    const nParcelas    = Number(p.NumeroParcelas) || 0;
    const valorParcela = Number(p.ValorParcelas) || 0;
    const entradaPaga  = p.DataPagamento && new Date(p.DataPagamento.split('T')[0] + 'T00:00:00') <= hoje;

    let parcelasRecebidas = 0;
    if (nParcelas > 0 && p.DataVencimentoParcelas) {
      const base = new Date(p.DataVencimentoParcelas.split('T')[0] + 'T00:00:00');
      for (let i = 0; i < nParcelas; i++) {
        const dp = new Date(base.getFullYear(), base.getMonth() + i, base.getDate());
        if (dp <= hoje) parcelasRecebidas++;
      }
    }
    const recebido = (entradaPaga ? entrada : 0) + valorParcela * parcelasRecebidas;
    return { recebido: Math.max(0, recebido), pendente: Math.max(0, valor - recebido) };
  }
  // À vista
  const pago = p.DataPagamento && new Date(p.DataPagamento.split('T')[0] + 'T00:00:00') <= hoje;
  return pago ? { recebido: valor, pendente: 0 } : { recebido: 0, pendente: valor };
}

function fmtMoeda(v) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function daysBetween(isoDate) {
  if (!isoDate) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(isoDate + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}
function validadeStatus(isoDate) {
  const d = daysBetween(isoDate);
  if (d === null) return { cls: 'badge-gray',   txt: '—',          icon: '—' };
  if (d < 0)      return { cls: 'badge-red',    txt: 'Vencido',     icon: '🔴' };
  if (d <= 30)    return { cls: 'badge-orange',  txt: `${d}d`,       icon: '🟠' };
  if (d <= CONFIG.diasAlertaVencimento) return { cls: 'badge-yellow', txt: `${d}d`, icon: '🟡' };
  return { cls: 'badge-green', txt: fmtDate(isoDate), icon: '🟢' };
}
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function getInitials(nome) {
  return (nome || '?').split(' ').slice(0,2).map(p => p[0]).join('').toUpperCase();
}

// ---- TOAST & LOADING ----
function toast(msg, type = 'info') {
  const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i><span>${esc(msg)}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
function showLoading() { document.getElementById('loading-overlay').style.display = 'flex'; }
function hideLoading() { document.getElementById('loading-overlay').style.display = 'none'; }

// ---- ROTEADOR ----
function navigate(page, params = {}) {
  const qs = Object.entries(params).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  window.location.hash = qs ? `${page}?${qs}` : page;
}
function getRoute() {
  const h = window.location.hash.replace('#', '') || 'dashboard';
  const [page, qs] = h.split('?');
  const params = {};
  if (qs) qs.split('&').forEach(p => { const [k,v] = p.split('='); params[k] = decodeURIComponent(v || ''); });
  return { page, params };
}
window.addEventListener('hashchange', () => renderPage());

function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
}

async function renderPage() {
  const { page, params } = getRoute();
  setActiveNav(page.split('/')[0]);
  document.getElementById('page-content').innerHTML = '';

  try {
    showLoading();
    switch (page) {
      case 'dashboard':            await renderDashboard(); break;
      case 'clientes':             await renderClientesList(); break;
      case 'clientes/novo':        await renderClienteForm(null, params); break;
      case 'clubes':               await renderClubesList(); break;
      case 'clubes/novo':          await renderClubeForm(); break;
      case 'clubes/editar':        await renderClubeForm(params.id); break;
      case 'clientes/editar':      await renderClienteForm(params.id); break;
      case 'clientes/perfil':      await renderClientePerfil(params.id, params.tab || 'dados'); break;
      case 'armas/novo':           await renderArmaForm(params.clienteId); break;
      case 'armas/editar':         await renderArmaForm(params.clienteId, params.id); break;
      case 'documentos/novo':      await renderDocumentoForm(params.clienteId); break;
      case 'documentos/editar':    await renderDocumentoForm(params.clienteId, params.id); break;
      case 'processos':            await renderProcessosList(); break;
      case 'processos/novo':       await renderProcessoForm(params.clienteId); break;
      case 'processos/editar':     await renderProcessoEditar(params.id); break;
      case 'processos/detalhe':    await renderProcessoDetalhe(params.id); break;
      case 'validades':            await renderValidades(); break;
      case 'pagamentos':           await renderPagamentos(); break;
      case 'orcamento/novo':       await renderOrcamentoForm(params.clienteId); break;
      default:                     await renderDashboard();
    }
  } catch (e) {
    document.getElementById('page-content').innerHTML = `<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p>Erro ao carregar a página: ${esc(e.message)}</p></div>`;
    console.error(e);
  } finally {
    hideLoading();
  }
}

// ============================================================
// DASHBOARD
// ============================================================
async function renderDashboard() {
  document.getElementById('page-title').textContent = 'Dashboard';
  const [clientes, documentos, processos] = await Promise.all([
    App.getClientes(), App.getDocumentos(), App.getProcessos()
  ]);

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const limite = CONFIG.diasAlertaVencimento;

  const processosAbertos = processos.filter(p => !STATUS_FECHADOS.includes(p.Status));

  // Todos os itens com validade (documentos + CR + SIMAFs dos clientes)
  const vencimentos = [];
  documentos.forEach(d => {
    if (d.DataValidade) {
      const dias = daysBetween(d.DataValidade.split('T')[0]);
      if (dias !== null && dias <= limite) {
        vencimentos.push({ tipo: d.TipoDocumento, cliente: d.ClienteNome, data: d.DataValidade.split('T')[0], dias, clienteId: d.ClienteId });
      }
    }
  });

  // SIMAF alerts (separado para seção própria)
  const simafVencimentos = [];
  clientes.forEach(c => {
    if (c.DataValidadeCR) {
      const iso = normISO(c.DataValidadeCR);
      const dias = daysBetween(iso);
      if (dias !== null && dias <= limite) {
        vencimentos.push({ tipo: 'CR', cliente: c.Title, data: iso, dias, clienteId: c.id });
      }
    }
    const simafList = JSON.parse(c.SIMAFs || '[]');
    simafList.forEach((s, i) => {
      if (s.DataValidade) {
        const iso = s.DataValidade.split('T')[0];
        const dias = daysBetween(iso);
        const entry = { tipo: 'SIMAF', subtipo: s.NomePropriedade || `SIMAF ${i+1}`, cliente: c.Title, data: iso, dias, clienteId: c.id };
        simafVencimentos.push(entry);
        if (dias !== null && dias <= limite) vencimentos.push(entry);
      }
    });
  });
  simafVencimentos.sort((a, b) => (a.dias ?? 9999) - (b.dias ?? 9999));
  vencimentos.sort((a, b) => a.dias - b.dias);

  const urgentes = vencimentos.filter(v => v.dias < 0).length;

  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon blue"><i class="bi bi-people-fill"></i></div>
        <div><div class="stat-value">${clientes.length}</div><div class="stat-label">Clientes cadastrados</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue"><i class="bi bi-folder2-open"></i></div>
        <div><div class="stat-value">${processosAbertos.length}</div><div class="stat-label">Processos em andamento</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon yellow"><i class="bi bi-clock-history"></i></div>
        <div><div class="stat-value">${vencimentos.length}</div><div class="stat-label">Documentos a vencer (${limite}d)</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red"><i class="bi bi-exclamation-triangle-fill"></i></div>
        <div><div class="stat-value">${urgentes}</div><div class="stat-label">Vencidos</div></div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;flex-wrap:wrap">
      <div class="card">
        <div class="card-header">
          <h3><i class="bi bi-calendar-x me-2"></i>Documentos Vencendo</h3>
          <a class="btn btn-outline btn-sm" onclick="navigate('validades')">Ver todos</a>
        </div>
        <div class="card-body" style="padding:0">
          ${vencimentos.length === 0
            ? '<div class="empty-state" style="padding:24px"><i class="bi bi-check-circle" style="font-size:32px"></i><p>Nenhum documento a vencer</p></div>'
            : vencimentos.slice(0,8).map(v => {
                const s = validadeStatus(v.data);
                return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--border)">
                  <div>
                    <div style="font-size:13px;font-weight:600">${esc(v.tipo)} — ${esc(v.cliente)}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${fmtDate(v.data)}</div>
                  </div>
                  <span class="badge ${s.cls}">${v.dias < 0 ? 'Vencido' : v.dias === 0 ? 'Hoje' : v.dias + 'd'}</span>
                </div>`;
              }).join('')
          }
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3><i class="bi bi-list-check me-2"></i>Processos Recentes</h3>
          <a class="btn btn-outline btn-sm" onclick="navigate('processos')">Ver todos</a>
        </div>
        <div class="card-body" style="padding:0">
          ${processos.length === 0
            ? '<div class="empty-state" style="padding:24px"><i class="bi bi-folder-x" style="font-size:32px"></i><p>Nenhum processo</p></div>'
            : processos.slice(-8).reverse().map(p => {
                const b = statusBadge(p.Status);
                return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--border);cursor:pointer" onclick="navigate('processos/detalhe',{id:'${p.id}'})">
                  <div>
                    <div style="font-size:13px;font-weight:600">${esc(p.TipoProcesso)}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${esc(p.ClienteNome)} · ${fmtDate(p.DataAbertura ? p.DataAbertura.split('T')[0] : '')}</div>
                  </div>
                  <span class="badge ${b.cls}">${b.txt}</span>
                </div>`;
              }).join('')
          }
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card-header">
        <h3><i class="bi bi-person-lines-fill me-2"></i>Processos por Responsável</h3>
        <span style="font-size:12px;color:var(--text-muted)">${processosAbertos.length} processo(s) em aberto</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
        ${RESPONSAVEIS.map(r => {
          const count = processosAbertos.filter(p => p.Responsavel === r).length;
          return `<div style="text-align:center;padding:20px 16px;border-right:1px solid var(--border)">
            <div style="font-size:28px;font-weight:700;color:var(--accent)">${count}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${esc(r)}</div>
          </div>`;
        }).join('')}
        ${(() => {
          const semResp = processosAbertos.filter(p => !p.Responsavel).length;
          return semResp > 0 ? `<div style="text-align:center;padding:20px 16px">
            <div style="font-size:28px;font-weight:700;color:var(--text-muted)">${semResp}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Sem responsável</div>
          </div>` : '';
        })()}
      </div>
    </div>

    ${simafVencimentos.length > 0 ? `
    <div class="card" style="margin-top:20px">
      <div class="card-header">
        <h3><i class="bi bi-tree-fill me-2" style="color:#16a34a"></i>Controle de SIMAF</h3>
        <span style="font-size:12px;color:var(--text-muted)">${simafVencimentos.length} SIMAF(s) cadastrado(s)</span>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Cliente</th><th>Propriedade</th><th>Vencimento</th><th>Situação</th></tr></thead>
          <tbody>
            ${simafVencimentos.map(item => {
              const c = (() => {
                if (item.dias === null) return { bg:'badge-gray', row:'' };
                if (item.dias < 0)     return { bg:'badge-red',    row:'background:#fff5f5' };
                if (item.dias <= 30)   return { bg:'badge-orange',  row:'background:#fff7ed' };
                if (item.dias <= 60)   return { bg:'badge-yellow',  row:'background:#fffbeb' };
                return                        { bg:'badge-green',  row:'' };
              })();
              const label = item.dias === null ? '—' : item.dias < 0 ? `Vencido há ${Math.abs(item.dias)}d` : item.dias === 0 ? 'Vence hoje' : `${item.dias}d restantes`;
              return `<tr style="${c.row}">
                <td><a style="cursor:pointer;color:var(--accent);font-weight:600" onclick="navigate('clientes/perfil',{id:'${item.clienteId}',tab:'dados'})">${esc(item.cliente)}</a></td>
                <td>${esc(item.subtipo)}</td>
                <td>${fmtDate(item.data)}</td>
                <td><span class="badge ${c.bg}">${label}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
    `;
}

function statusBadge(s) {
  const m = {
    'Aguardando Pagamento Cliente': { cls:'badge-orange', txt:'Ag. Pagamento' },
    'Aguardando Documentos':        { cls:'badge-yellow', txt:'Ag. Documentos' },
    'Aguardando Pagamento GRU':     { cls:'badge-orange', txt:'Ag. GRU' },
    'Pronto para Análise':          { cls:'badge-blue',   txt:'Pronto p/ Análise' },
    'Em análise':                   { cls:'badge-blue',   txt:'Em análise' },
    'Deferido':                     { cls:'badge-green',  txt:'Deferido' },
    'Indeferido':                   { cls:'badge-red',    txt:'Indeferido' },
    'Aguardando Docs':              { cls:'badge-yellow', txt:'Ag. Docs' },
  };
  return m[s] || { cls:'badge-gray', txt: s || '—' };
}

const STATUS_PROCESSO = [
  'Aguardando Pagamento Cliente',
  'Aguardando Documentos',
  'Aguardando Pagamento GRU',
  'Pronto para Análise',
  'Em análise',
  'Deferido',
  'Indeferido',
];
const STATUS_FECHADOS = ['Deferido', 'Indeferido'];
const RESPONSAVEIS = ['Andrieli', 'Matheus', 'Priscila', 'Simone'];
const VALORES_PROCESSO = {
  'Aquisição de Arma SIGMA':                   940.00,
  'Aquisição de Arma PF':                      1117.00,
  'Atualização de Documento de Identificação': 121.00,
  'Concessão/Renovação de CR':                 1843.00,
  'Guia de Tráfego':                           176.00,
  'Alteração de Endereço':                     450.00,
  'Inclusão de Atividade':                     567.00,
  'Exclusão de Atividade':                     567.00,
  'Mudança de Acervo':                         644.00,
  'Renovação de CRAF':                         588.50,
  'Segunda via de CRAF':                       412.50,
  'Transferência de Arma SIGMA x SINARM':      1117.00,
  'Transferência de Arma SINARM x SINARM':     1117.00,
  'Transferência de Arma SIGMA x SIGMA':       1117.00,
  'Transferência de Arma SINARM x SIGMA':      1117.00,
};

const CERTIDOES_CONFIG = [
  { keyword: 'Federal',   label: 'Justiça Federal (TRF4)',   url: 'https://www2.trf4.jus.br/trf4/processos/certidao/index.php' },
  { keyword: 'Estadual',  label: 'Justiça Estadual (TJRS)',  url: 'https://www.tjrs.jus.br/novo/processos-e-servicos/servicos-processuais/emissao-de-antecedentes-e-certidoes/' },
  { keyword: 'Militar',   label: 'Justiça Militar (STM)',    url: 'https://www2.stm.jus.br/ceneg_internet/emitir/index.php' },
  { keyword: 'Eleitoral', label: 'Crimes Eleitorais (TSE)',  url: 'https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral#/' },
];

// ============================================================
// CLIENTES — LISTA
// ============================================================
async function renderClientesList() {
  document.getElementById('page-title').textContent = 'Clientes';
  const clientes = await App.getClientes();
  clientes.sort((a, b) => (a.Title || '').localeCompare(b.Title || '', 'pt-BR'));

  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="toolbar">
      <div class="search-bar"><i class="bi bi-search"></i><input id="busca-cliente" placeholder="Buscar por nome ou CPF..." oninput="filtrarClientes()" /></div>
      <button class="btn btn-primary" onclick="navigate('clientes/novo')"><i class="bi bi-plus-lg"></i> Novo Cliente</button>
    </div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Nome</th><th>CPF</th><th>Senha GOV</th><th>Celular</th>
            <th>N° CR</th><th>Val. CR</th><th>Categorias</th><th>Ações</th>
          </tr></thead>
          <tbody id="tbody-clientes">${renderClientesRows(clientes)}</tbody>
        </table>
      </div>
    </div>`;
  window._clientes_filtro = clientes;
}

function renderClientesRows(lista) {
  if (!lista.length) return `<tr><td colspan="8"><div class="empty-state"><i class="bi bi-people"></i><p>Nenhum cliente encontrado.</p><button class="btn btn-primary" onclick="navigate('clientes/novo')">Cadastrar primeiro cliente</button></div></td></tr>`;
  return lista.map(c => {
    const s = validadeStatus(normISO(c.DataValidadeCR) || null);
    const cats = (c.Categoria || '').split(',').filter(Boolean).map(ct => `<span class="badge badge-blue" style="margin-right:3px">${esc(ct.trim())}</span>`).join('');
    return `<tr>
      <td><a style="font-weight:600;cursor:pointer;color:var(--accent)" onclick="navigate('clientes/perfil',{id:'${c.id}'})">${esc(c.Title)}</a></td>
      <td>
        <div class="copy-hover-wrap" style="display:flex;align-items:center;gap:4px">
          <span>${esc(c.CPF || '—')}</span>
          ${c.CPF ? `<button class="btn-copy" onclick="copiarCampo(this)" data-val="${esc(c.CPF)}" title="Copiar CPF"><i class="bi bi-clipboard"></i></button>` : ''}
        </div>
      </td>
      <td>
        <div class="copy-hover-wrap" style="display:flex;align-items:center;gap:4px">
          <span>${esc(c.SenhaGOV || '—')}</span>
          ${c.SenhaGOV ? `<button class="btn-copy" onclick="copiarCampo(this)" data-val="${esc(c.SenhaGOV)}" title="Copiar Senha GOV"><i class="bi bi-clipboard"></i></button>` : ''}
        </div>
      </td>
      <td>${esc(c.Celular || '—')}</td>
      <td>${esc(c.NumeroCR || '—')}</td>
      <td><span class="badge ${s.cls}">${s.txt}</span></td>
      <td>${cats || '<span class="badge badge-gray">—</span>'}</td>
      <td>
        <div class="btn-group">
          <button class="btn btn-outline btn-sm" onclick="navigate('clientes/perfil',{id:'${c.id}'})"><i class="bi bi-eye"></i></button>
          <button class="btn btn-outline btn-sm" onclick="navigate('clientes/editar',{id:'${c.id}'})"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-ghost btn-sm" onclick="confirmarDeleteCliente('${c.id}','${esc(c.Title)}')"><i class="bi bi-trash" style="color:var(--danger)"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filtrarClientes() {
  const q = document.getElementById('busca-cliente').value.toLowerCase();
  const lista = q ? window._clientes_filtro.filter(c =>
    (c.Title || '').toLowerCase().includes(q) || (c.CPF || '').includes(q)
  ) : window._clientes_filtro;
  document.getElementById('tbody-clientes').innerHTML = renderClientesRows(lista);
}

async function confirmarDeleteCliente(id, nome) {
  if (!confirm(`Excluir o cliente "${nome}"?\n\nIsso também excluirá todas as armas, documentos e processos vinculados.`)) return;
  showLoading();
  try {
    const [todasArmas, todosDocs, todosProcs] = await Promise.all([
      App.graph.getItems(CONFIG.listas.armas),
      App.graph.getItems(CONFIG.listas.documentos),
      App.graph.getItems(CONFIG.listas.processos)
    ]);
    const armas = todasArmas.filter(a => String(a.ClienteId) === String(id));
    const docs  = todosDocs.filter(d => String(d.ClienteId) === String(id));
    const procs = todosProcs.filter(p => String(p.ClienteId) === String(id));
    await Promise.all([
      ...armas.map(a => App.graph.deleteItem(CONFIG.listas.armas, a.id)),
      ...docs.map(d => App.graph.deleteItem(CONFIG.listas.documentos, d.id)),
      ...procs.map(p => App.graph.deleteItem(CONFIG.listas.processos, p.id))
    ]);
    await App.graph.deleteItem(CONFIG.listas.clientes, id);
    App.invalidateCache();
    toast('Cliente excluído.', 'success');
    await renderClientesList();
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

// ============================================================
// CLIENTES — FORMULÁRIO (NOVO / EDITAR)
// ============================================================
async function renderClienteForm(id = null, importParams = {}) {
  document.getElementById('page-title').textContent = id ? 'Editar Cliente' : 'Novo Cliente';
  let c = {};
  if (id) c = await App.graph.getItem(CONFIG.listas.clientes, id);

  if (!id && importParams.importar) {
    try { Object.assign(c, JSON.parse(importParams.importar)); } catch(e) {}
  }

  const clubes = (await App.getClubes()).sort((a,b) => (a.Title||'').localeCompare(b.Title||'','pt-BR'));

  const val = (f) => esc(c[f] || '');
  const cats = (c.Categoria || '').split(',').map(s => s.trim());
  const checked = (v) => cats.includes(v) ? 'checked' : '';
  const dateVal = (f) => c[f] ? c[f].split('T')[0] : '';

  const temImport = !!(importParams && importParams.importar);
  document.getElementById('page-content').innerHTML = `
  ${!id ? `
    <div id="painel-sinarm" style="display:none;margin-bottom:16px"></div>
    <div style="margin-bottom:16px;display:flex;justify-content:flex-end">
      ${!temImport
        ? `<button type="button" class="btn btn-outline btn-sm" onclick="togglePainelSINARM()"><i class="bi bi-download"></i> Importar do SINARM CAC</button>`
        : `<span class="badge badge-green" style="font-size:13px;padding:6px 12px"><i class="bi bi-check-circle me-1"></i>Dados importados do SINARM CAC</span>`}
    </div>` : ''}
  <form id="form-cliente" onsubmit="salvarCliente(event,'${id||''}')">
    <div class="form-section">
      <div class="form-section-title">Identificação</div>
      <div class="form-body">
        <div class="form-grid">
          <div style="grid-column:1/-1"><label>Nome Completo *</label><input name="NomeCompleto" value="${val('Title')}" required /></div>
          <div><label>CPF</label><input name="CPF" value="${val('CPF')}" oninput="this.value=fmtCPF(this.value)" maxlength="14" /></div>
          <div><label>Senha GOV</label><input name="SenhaGOV" value="${val('SenhaGOV')}" /></div>
          <div><label>RG</label><input name="RG" value="${val('RG')}" /></div>
          <div><label>Órgão Emissor</label><input name="OrgaoEmissor" value="${val('OrgaoEmissor')}" oninput="this.value=this.value.toUpperCase()" style="text-transform:uppercase" /></div>
          <div><label>UF (RG)</label><input name="UFDoc" value="${val('UFDoc')}" maxlength="2" style="text-transform:uppercase" /></div>
          <div><label>Data de Expedição (RG)</label><input type="date" name="DataExpedicaoRG" value="${dateVal('DataExpedicaoRG')}" /></div>
          <div><label>Data de Validade RG ou CNH</label><input type="date" name="DataValidadeRGouCNH" value="${dateVal('DataValidadeRGouCNH')}" /></div>
          <div><label>Data de Nascimento</label><input type="date" name="DataNascimento" value="${dateVal('DataNascimento')}" /></div>
          <div><label>Nacionalidade</label><input name="Nacionalidade" value="${val('Nacionalidade')}" /></div>
          <div><label>Naturalidade</label><input name="Naturalidade" value="${val('Naturalidade')}" /></div>
          <div><label>UF Naturalidade</label><input name="UFNaturalidade" value="${val('UFNaturalidade')}" maxlength="2" style="text-transform:uppercase" /></div>
          <div><label>Profissão</label><input name="Profissao" value="${val('Profissao')}" /></div>
          <div><label>Sexo</label><select name="Sexo"><option value="">Selecione...</option><option ${c.Sexo==='Masculino'?'selected':''}>Masculino</option><option ${c.Sexo==='Feminino'?'selected':''}>Feminino</option></select></div>
          <div><label>Estado Civil</label><select name="EstadoCivil"><option value="">Selecione...</option>${['Solteiro','Casado','Divorciado','Viúvo','União Estável','Separado Jud.','Outros'].map(v=>`<option ${c.EstadoCivil===v?'selected':''}>${v}</option>`).join('')}</select></div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">CR e Categorias</div>
      <div class="form-body">
        <div class="form-grid">
          <div><label>Número do CR</label><input name="NumeroCR" value="${val('NumeroCR')}" /></div>
          <div><label>Data de Validade do CR</label><input type="date" name="DataValidadeCR" value="${normISO(c.DataValidadeCR) || ''}" /></div>
        </div>
        <div style="margin-top:16px">
          <label>Categorias CAC</label>
          <div class="checkbox-group">
            <label class="checkbox-item"><input type="checkbox" name="cat_colecionador" ${checked('Colecionador')} /> Colecionador</label>
            <label class="checkbox-item"><input type="checkbox" name="cat_atirador"     ${checked('Atirador')}     /> Atirador</label>
            <label class="checkbox-item"><input type="checkbox" name="cat_cacador"      ${checked('Caçador')}      onchange="onCatCacadorChange(this.checked)" /> Caçador</label>
          </div>
        </div>
      </div>
    </div>

    <div id="secao-ctf" style="${cats.includes('Caçador') ? '' : 'display:none'}">
    <div class="form-section">
      <div class="form-section-title">CTF — Caçador</div>
      <div class="form-body">
        <div class="form-grid">
          <div><label>Data de Validade CTF</label><input type="date" name="DataValidadeCTF" value="${dateVal('DataValidadeCTF')}" /></div>
        </div>
      </div>
    </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Contato e Filiação</div>
      <div class="form-body">
        <div class="form-grid">
          <div><label>Celular (WhatsApp)</label><input name="Celular" value="${val('Celular')}" oninput="this.value=fmtCelular(this.value)" maxlength="15" /></div>
          <div><label>E-mail</label><input type="email" name="Email" value="${val('Email')}" /></div>
          <div><label>Nome da Mãe</label><input name="NomeMae" value="${val('NomeMae')}" /></div>
          <div><label>Nome do Pai</label><input name="NomePai" value="${val('NomePai')}" /></div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Filiação Clube de Tiro</div>
      <div class="form-body">
        <div class="form-grid">
          <div style="grid-column:1/-1"><label>Selecionar Clube</label>
            <select name="ClubeId">
              <option value="">Nenhum</option>
              ${clubes.map(cl => `<option value="${cl.id}" ${String(cl.id)===String(c.ClubeId)?'selected':''}>${esc(cl.Title)}</option>`).join('')}
            </select>
          </div>
          <div><label>Número da Filiação</label><input name="NumeroFiliacao" value="${esc(c.NumeroFiliacao||'')}" oninput="this.value=this.value.replace(/\\D/g,'')" /></div>
          <div><label>Data de Filiação</label><input type="date" name="DataFiliacao" value="${c.DataFiliacao ? c.DataFiliacao.split('T')[0] : ''}" /></div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">1° Endereço</div>
      <div class="form-body">
        <div class="form-grid">
          <div><label>CEP</label><input name="CEP1" value="${val('CEP1')}" oninput="this.value=fmtCEP(this.value)" maxlength="9" /></div>
          <div style="grid-column:span 2"><label>Logradouro</label><input name="Endereco1" value="${val('Endereco1')}" /></div>
          <div><label>Número</label><input name="Numero1" value="${val('Numero1')}" /></div>
          <div><label>Complemento</label><input name="Complemento1" value="${val('Complemento1')}" /></div>
          <div><label>Bairro</label><input name="Bairro1" value="${val('Bairro1')}" /></div>
          <div><label>Cidade</label><input name="Cidade1" value="${val('Cidade1')}" /></div>
          <div><label>UF</label><input name="UF1Endereco" value="${val('UF1Endereco')}" maxlength="2" style="text-transform:uppercase" /></div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">2° Endereço (opcional)</div>
      <div class="form-body">
        <div class="form-grid">
          <div><label>CEP</label><input name="CEP2" value="${val('CEP2')}" oninput="this.value=fmtCEP(this.value)" maxlength="9" /></div>
          <div style="grid-column:span 2"><label>Logradouro</label><input name="Endereco2" value="${val('Endereco2')}" /></div>
          <div><label>Número</label><input name="Numero2" value="${val('Numero2')}" /></div>
          <div><label>Complemento</label><input name="Complemento2" value="${val('Complemento2')}" /></div>
          <div><label>Bairro</label><input name="Bairro2" value="${val('Bairro2')}" /></div>
          <div><label>Cidade</label><input name="Cidade2" value="${val('Cidade2')}" /></div>
          <div><label>UF</label><input name="UF2Endereco" value="${val('UF2Endereco')}" maxlength="2" style="text-transform:uppercase" /></div>
        </div>
      </div>
    </div>

    <div class="btn-group" style="margin-top:8px">
      <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> Salvar</button>
      <button type="button" class="btn btn-outline" onclick="history.back()">Cancelar</button>
    </div>
  </form>`;
}

async function salvarCliente(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const cats = [];
  if (fd.get('cat_colecionador')) cats.push('Colecionador');
  if (fd.get('cat_atirador'))     cats.push('Atirador');
  if (fd.get('cat_cacador'))      cats.push('Caçador');

  const fields = {
    Title:            toTitleCase(fd.get('NomeCompleto')),
    CPF:              fd.get('CPF'),
    SenhaGOV:         fd.get('SenhaGOV'),
    NumeroCR:         fd.get('NumeroCR'),
    DataValidadeCR:   fd.get('DataValidadeCR'),
    RG:               fd.get('RG'),
    OrgaoEmissor:     (fd.get('OrgaoEmissor') || '').toUpperCase(),
    UFDoc:            fd.get('UFDoc').toUpperCase(),
    DataNascimento:   fd.get('DataNascimento') || null,
    DataExpedicaoRG:  fd.get('DataExpedicaoRG') || null,
    DataValidadeRGouCNH: fd.get('DataValidadeRGouCNH') || null,
    Nacionalidade:    toTitleCase(fd.get('Nacionalidade')),
    Naturalidade:     toTitleCase(fd.get('Naturalidade')),
    UFNaturalidade:   fd.get('UFNaturalidade').toUpperCase(),
    Profissao:        toTitleCase(fd.get('Profissao')),
    Sexo:             fd.get('Sexo') || null,
    EstadoCivil:      fd.get('EstadoCivil') || null,
    Celular:          fmtCelular(fd.get('Celular')),
    Email:            fd.get('Email'),
    NomeMae:          toTitleCase(fd.get('NomeMae')),
    NomePai:          toTitleCase(fd.get('NomePai')),
    ClubeId:          fd.get('ClubeId') || null,
    ClubeNome:        (() => { const sel = e.target.querySelector('[name="ClubeId"]'); if (!sel || !sel.value) return ''; return sel.options[sel.selectedIndex]?.text || ''; })(),
    NumeroFiliacao:   fd.get('NumeroFiliacao') || null,
    DataFiliacao:     fd.get('DataFiliacao') || null,
    Categoria:        cats.join(','),
    DataValidadeCTF:  fd.get('DataValidadeCTF') || null,
    CEP1:             fd.get('CEP1'),
    Endereco1:        toTitleCase(fd.get('Endereco1')),
    Numero1:          fd.get('Numero1'),
    Complemento1:     toTitleCase(fd.get('Complemento1')),
    Bairro1:          toTitleCase(fd.get('Bairro1')),
    Cidade1:          toTitleCase(fd.get('Cidade1')),
    UF1Endereco:      fd.get('UF1Endereco').toUpperCase(),
    CEP2:             fd.get('CEP2'),
    Endereco2:        toTitleCase(fd.get('Endereco2')),
    Numero2:          fd.get('Numero2'),
    Complemento2:     toTitleCase(fd.get('Complemento2')),
    Bairro2:          toTitleCase(fd.get('Bairro2')),
    Cidade2:          toTitleCase(fd.get('Cidade2')),
    UF2Endereco:      fd.get('UF2Endereco').toUpperCase(),
  };

  showLoading();
  try {
    if (id) {
      await App.graph.updateItem(CONFIG.listas.clientes, id, fields);
      toast('Cliente atualizado!', 'success');
    } else {
      const created = await App.graph.createItem(CONFIG.listas.clientes, fields);
      id = created.id;
      toast('Cliente cadastrado!', 'success');
    }
    App.invalidateCache('clientes');
    navigate('clientes/perfil', { id });
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

// ============================================================
// CLIENTES — PERFIL (abas)
// ============================================================
async function renderClientePerfil(id, tab = 'dados') {
  document.getElementById('page-title').textContent = 'Perfil do Cliente';
  const [cliente, todasArmas, todosDocumentos, todosProcessos] = await Promise.all([
    App.graph.getItem(CONFIG.listas.clientes, id),
    App.getArmas(), App.getDocumentos(), App.getProcessos()
  ]);
  const armas      = todasArmas.filter(a => String(a.ClienteId) === String(id));
  const documentos = todosDocumentos.filter(d => String(d.ClienteId) === String(id));
  const processos  = todosProcessos.filter(p => String(p.ClienteId) === String(id));

  const tabs = [
    { key:'dados',      label:'Dados Pessoais',               icon:'bi-person-vcard' },
    { key:'armas',      label:`Armas (${armas.length})`,       icon:'bi-shield-fill' },
    { key:'documentos', label:`Documentos (${documentos.length})`, icon:'bi-file-earmark-text' },
    { key:'processos',  label:`Processos (${processos.length})`,   icon:'bi-folder2-open' },
    { key:'pagamentos', label:'Pagamentos',                    icon:'bi-cash-coin' },
  ];

  const cats = (cliente.Categoria || '').split(',').filter(Boolean).map(ct => `<span class="badge badge-blue">${esc(ct.trim())}</span>`).join(' ');

  let tabContent = '';
  if (tab === 'dados')           tabContent = renderPerfilDados(cliente);
  else if (tab === 'armas')      tabContent = renderPerfilArmas(armas, id, cliente);
  else if (tab === 'documentos') tabContent = renderPerfilDocumentos(documentos, id);
  else if (tab === 'processos')  tabContent = renderPerfilProcessos(processos, id);
  else if (tab === 'pagamentos') tabContent = renderPerfilPagamentos(processos, id);

  document.getElementById('page-content').innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${getInitials(cliente.Title)}</div>
      <div class="profile-info">
        <h2>${esc(cliente.Title)}</h2>
        <p>CPF: ${esc(cliente.CPF || '—')} &nbsp;·&nbsp; CR: ${esc(cliente.NumeroCR || '—')} &nbsp;·&nbsp; ${cats || '<span class="badge badge-gray">Sem categoria</span>'}</p>
      </div>
      <div class="btn-group" style="margin-left:auto">
        <button class="btn btn-outline btn-sm" onclick="navigate('clientes/editar',{id:'${id}'})"><i class="bi bi-pencil"></i> Editar</button>
        <button class="btn btn-primary btn-sm" onclick="navigate('processos/novo',{clienteId:'${id}'})"><i class="bi bi-plus-lg"></i> Novo Processo</button>
        <button class="btn btn-sm" style="background:#f97316;color:#fff;border:1px solid #ea580c" onclick="navigate('orcamento/novo',{clienteId:'${id}'})"><i class="bi bi-calculator"></i> Novo Orçamento</button>
      </div>
    </div>

    <div class="tabs">
      ${tabs.map(t => `<button class="tab-btn ${tab===t.key?'active':''}" onclick="navigate('clientes/perfil',{id:'${id}',tab:'${t.key}'})"><i class="bi ${t.icon} me-1"></i>${t.label}</button>`).join('')}
    </div>

    ${tabContent}`;
}

function renderPerfilDados(c) {
  const row = (label, value) => {
    const hasVal = !!(value && value !== '');
    return `<div class="info-item">
      <label>${label}</label>
      <div style="display:flex;align-items:center;gap:6px">
        <div class="value ${!hasVal?'empty':''}">${value || 'Não informado'}</div>
        ${hasVal ? `<button class="btn-copy" onclick="copiarCampo(this)" data-val="${esc(value)}" title="Copiar"><i class="bi bi-clipboard"></i></button>` : ''}
      </div>
    </div>`;
  };
  const dateRow = (label, f) => row(label, c[f] ? fmtDate(normISO(c[f])) : '');
  const isCacador = (c.Categoria || '').includes('Caçador');
  const simafList = JSON.parse(c.SIMAFs || '[]');

  return `
    <div class="form-section">
      <div class="form-section-title">Identificação</div>
      <div class="form-body"><div class="info-grid">
        ${row('Nome Completo', c.Title)} ${row('CPF', c.CPF)} ${row('Senha GOV', c.SenhaGOV)}
        ${row('RG', c.RG)} ${row('Órgão Emissor', c.OrgaoEmissor)} ${row('UF (RG)', c.UFDoc)}
        ${dateRow('Data Expedição RG', 'DataExpedicaoRG')} ${dateRow('Validade RG/CNH', 'DataValidadeRGouCNH')}
        ${dateRow('Data de Nascimento', 'DataNascimento')} ${row('Sexo', c.Sexo)} ${row('Estado Civil', c.EstadoCivil)}
        ${row('Nacionalidade', c.Nacionalidade)}
        ${row('Naturalidade', c.Naturalidade)} ${row('UF Naturalidade', c.UFNaturalidade)}
        ${row('Profissão', c.Profissao)}
      </div></div>
    </div>
    <div class="form-section">
      <div class="form-section-title">CR e Categorias</div>
      <div class="form-body"><div class="info-grid">
        ${row('N° CR', c.NumeroCR)} ${dateRow('Validade CR', 'DataValidadeCR')}
        ${row('Categorias', (c.Categoria||'').replace(/,/g,', '))}
      </div></div>
    </div>
    ${isCacador ? `
    <div class="form-section">
      <div class="form-section-title">CTF — Caçador</div>
      <div class="form-body"><div class="info-grid">
        <div class="info-item"><label>Data de Validade CTF</label>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div class="value ${!c.DataValidadeCTF?'empty':''}">${c.DataValidadeCTF ? fmtDate(c.DataValidadeCTF.split('T')[0]) : 'Não informado'}</div>
            <button class="btn btn-primary btn-sm" onclick="renovarCTF('${c.id}')"><i class="bi bi-arrow-clockwise"></i> Renovar +3m</button>
          </div>
        </div>
      </div></div>
    </div>` : ''}
    <div class="form-section">
      <div class="form-section-title">Contato e Filiação</div>
      <div class="form-body"><div class="info-grid">
        ${row('Celular', c.Celular)} ${row('E-mail', c.Email)}
        ${row('Nome da Mãe', c.NomeMae)} ${row('Nome do Pai', c.NomePai)}
      </div></div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Filiação Clube de Tiro</div>
      <div class="form-body"><div class="info-grid">
        ${row('Clube de Tiro', c.ClubeNome || c.NomeClubeAtiro)}
        ${row('Número da Filiação', c.NumeroFiliacao)}
        ${row('Data de Filiação', fmtDate(c.DataFiliacao))}
      </div></div>
    </div>
    <div class="form-section">
      <div class="form-section-title">1° Endereço</div>
      <div class="form-body"><div class="info-grid">
        ${row('CEP', c.CEP1)} ${row('Logradouro', c.Endereco1)} ${row('Número', c.Numero1)}
        ${row('Complemento', c.Complemento1)} ${row('Bairro', c.Bairro1)}
        ${row('Cidade', c.Cidade1)} ${row('UF', c.UF1Endereco)}
      </div></div>
    </div>
    ${c.Endereco2 ? `<div class="form-section">
      <div class="form-section-title">2° Endereço</div>
      <div class="form-body"><div class="info-grid">
        ${row('CEP', c.CEP2)} ${row('Logradouro', c.Endereco2)} ${row('Número', c.Numero2)}
        ${row('Complemento', c.Complemento2)} ${row('Bairro', c.Bairro2)}
        ${row('Cidade', c.Cidade2)} ${row('UF', c.UF2Endereco)}
      </div></div>
    </div>` : `<div class="form-section">
      <div class="form-section-title">2° Endereço</div>
      <div class="form-body"><p style="color:var(--text-muted);font-style:italic;margin:0">Não cadastrado</p></div>
    </div>`}
    <div class="form-section" id="secao-simaf">
      <div class="form-section-title" style="display:flex;align-items:center;justify-content:space-between">
        <span>SIMAF</span>
        <button class="btn btn-primary btn-sm" onclick="toggleSIMAFForm('${c.id}')"><i class="bi bi-plus-lg"></i> Adicionar SIMAF</button>
      </div>
      <div id="simaf-form-wrap" style="display:none;padding:16px 20px 0">
        <form id="form-simaf" onsubmit="salvarSIMAF(event,'${c.id}')">
          <div class="form-grid">
            <div><label>Data de Validade *</label><input type="date" name="DataValidade" required /></div>
            <div><label>Nome da Propriedade *</label><input name="NomePropriedade" required /></div>
            <div><label>CAR da Propriedade</label><input name="CARPropriedade" /></div>
            <div><label>Cidade</label><input name="CidadeSimaf" /></div>
            <div><label>UF</label><input name="UFSimaf" maxlength="2" style="text-transform:uppercase" /></div>
          </div>
          <div class="btn-group" style="margin-top:12px;margin-bottom:16px">
            <button type="submit" class="btn btn-primary btn-sm"><i class="bi bi-check-lg"></i> Salvar SIMAF</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="toggleSIMAFForm('${c.id}')">Cancelar</button>
          </div>
        </form>
      </div>
      <div class="form-body">
        ${simafList.length === 0
          ? '<div class="empty-state" style="padding:20px"><i class="bi bi-file-earmark-x"></i><p>Nenhum SIMAF cadastrado.</p></div>'
          : `<div class="table-wrapper"><table>
              <thead><tr><th>Propriedade</th><th>CAR</th><th>Cidade/UF</th><th>Validade</th><th>Ações</th></tr></thead>
              <tbody>
                ${simafList.map((s, i) => {
                  const vs = validadeStatus(s.DataValidade || null);
                  return `<tr>
                    <td>${esc(s.NomePropriedade||'—')}</td>
                    <td>${esc(s.CARPropriedade||'—')}</td>
                    <td>${esc(s.CidadeSimaf||'')}${s.UFSimaf?' - '+esc(s.UFSimaf):''}</td>
                    <td><span class="badge ${vs.cls}">${vs.txt}</span></td>
                    <td><button class="btn btn-ghost btn-sm" onclick="deletarSIMAF('${c.id}',${i})"><i class="bi bi-trash" style="color:var(--danger)"></i></button></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table></div>`
        }
      </div>
    </div>`;
}

function renderPerfilArmas(armas, clienteId, cliente) {
  const categorias   = (cliente?.Categoria || '').split(',').map(c => c.trim()).filter(Boolean);
  const temCacador   = categorias.includes('Caçador');
  const temAtirador  = categorias.includes('Atirador');

  // Caçador
  const armCac  = armas.filter(a => a.AtividadeCadastrada === 'Caçador');
  const resCac  = armCac.filter(a => a.GrupoCalibre === 'Restrito');
  const permCac = armCac.filter(a => a.GrupoCalibre !== 'Restrito' && a.GrupoCalibre);

  // Atirador
  const armAti  = armas.filter(a => a.AtividadeCadastrada === 'Atirador');
  const permAti = armAti.filter(a => a.GrupoCalibre === 'Permitido');
  const resAti  = armAti.filter(a => a.GrupoCalibre === 'Restrito');

  const mkBar = (label, atual, maximo) => {
    const pct = Math.min(100, Math.round(atual / maximo * 100));
    const cor = atual >= maximo ? 'var(--danger)' : atual >= maximo - 1 ? 'var(--warning)' : 'var(--success)';
    return `<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="font-weight:600">${label}</span>
        <span style="color:${atual >= maximo ? 'var(--danger)' : 'var(--text-muted)'}"><strong>${atual}</strong> / ${maximo}${atual >= maximo ? ' — LIMITE ATINGIDO' : ''}</span>
      </div>
      <div style="height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${cor};border-radius:5px;transition:width .3s"></div>
      </div>
    </div>`;
  };

  const hatchBg = `repeating-linear-gradient(45deg,#e5e7eb 0px,#e5e7eb 4px,#f9fafb 4px,#f9fafb 12px)`;

  const boxCacador = temCacador
    ? `<div class="card" style="flex:1;min-width:220px">
        <div class="card-header"><h3 style="font-size:13px"><i class="bi bi-bar-chart-fill me-1" style="color:var(--accent)"></i>Acervo Caçador</h3></div>
        <div class="card-body">
          ${mkBar('Total de armas', armCac.length, 6)}
          ${mkBar('Calibre Restrito', resCac.length, 2)}
          <div style="display:flex;gap:16px;margin-top:8px;font-size:12px;flex-wrap:wrap">
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#22c55e;margin-right:4px"></span>Permitido: <strong>${permCac.length}</strong></span>
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#ef4444;margin-right:4px"></span>Restrito: <strong>${resCac.length}</strong></span>
          </div>
        </div>
      </div>`
    : `<div style="flex:1;min-width:220px;border:2px dashed #d1d5db;border-radius:8px;background:${hatchBg};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:140px;text-align:center;padding:16px">
        <i class="bi bi-shield-slash" style="font-size:28px;color:#9ca3af"></i>
        <span style="font-size:13px;font-weight:600;color:#9ca3af">Acervo Caçador</span>
        <span style="font-size:11px;color:#b0b7c3">Não cadastrado</span>
      </div>`;

  const boxAtirador = temAtirador
    ? `<div class="card" style="flex:1;min-width:220px">
        <div class="card-header"><h3 style="font-size:13px"><i class="bi bi-bar-chart-fill me-1" style="color:var(--accent)"></i>Acervo Atirador</h3></div>
        <div class="card-body">
          ${mkBar('Calibre Permitido', permAti.length, 4)}
          <div style="display:flex;gap:16px;margin-top:8px;font-size:12px;flex-wrap:wrap">
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#22c55e;margin-right:4px"></span>Permitido: <strong>${permAti.length}</strong></span>
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#ef4444;margin-right:4px"></span>Restrito: <strong>${resAti.length}</strong></span>
          </div>
        </div>
      </div>`
    : `<div style="flex:1;min-width:220px;border:2px dashed #d1d5db;border-radius:8px;background:${hatchBg};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:140px;text-align:center;padding:16px">
        <i class="bi bi-shield-slash" style="font-size:28px;color:#9ca3af"></i>
        <span style="font-size:13px;font-weight:600;color:#9ca3af">Acervo Atirador</span>
        <span style="font-size:11px;color:#b0b7c3">Não cadastrado</span>
      </div>`;

  const resumoBlock = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">
      ${boxAtirador}
      ${boxCacador}
    </div>`;

  return `
    <div class="toolbar">
      <span style="font-size:13px;color:var(--text-muted)">${armas.length} arma(s) cadastrada(s)</span>
      <button class="btn btn-primary" onclick="navigate('armas/novo',{clienteId:'${clienteId}'})"><i class="bi bi-plus-lg"></i> Adicionar Arma</button>
    </div>
    ${resumoBlock}
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr><th>N° Série</th><th>N° SIGMA</th><th>Atividade</th><th>Marca/Modelo</th><th>Calibre</th><th>Espécie</th><th>Grupo</th><th>Ações</th></tr></thead>
          <tbody>${armas.length === 0
            ? `<tr><td colspan="8"><div class="empty-state"><i class="bi bi-shield"></i><p>Nenhuma arma cadastrada.</p></div></td></tr>`
            : armas.map(a => `<tr>
                <td>${esc(a.NumeroSerie||'—')}</td>
                <td>${esc(a.NumeroSIGMA||'—')}</td>
                <td><span class="badge badge-blue">${esc(a.AtividadeCadastrada||'—')}</span></td>
                <td>${esc(a.Marca||'')} ${esc(a.Modelo||'')}</td>
                <td>${esc(a.Calibre||'—')}</td>
                <td>${esc(a.Especie||'—')}</td>
                <td><span class="badge ${a.GrupoCalibre==='Restrito'?'badge-red':'badge-green'}">${esc(a.GrupoCalibre||'—')}</span></td>
                <td><div class="btn-group">
                  <button class="btn btn-outline btn-sm" onclick="navigate('armas/editar',{clienteId:'${clienteId}',id:'${a.id}'})"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-ghost btn-sm" onclick="deletarArma('${a.id}','${clienteId}')"><i class="bi bi-trash" style="color:var(--danger)"></i></button>
                </div></td>
              </tr>`).join('')
          }</tbody>
        </table>
      </div>
    </div>`;
}

async function deletarArma(id, clienteId) {
  if (!confirm('Excluir esta arma?')) return;
  showLoading();
  try {
    await App.graph.deleteItem(CONFIG.listas.armas, id);
    App.invalidateCache('armas');
    toast('Arma excluída.', 'success');
    navigate('clientes/perfil', { id: clienteId, tab: 'armas' });
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

function renderPerfilDocumentos(docs, clienteId) {
  return `
    <div class="toolbar">
      <span style="font-size:13px;color:var(--text-muted)">${docs.length} documento(s)</span>
      <button class="btn btn-primary" onclick="navigate('documentos/novo',{clienteId:'${clienteId}'})"><i class="bi bi-plus-lg"></i> Adicionar Documento</button>
    </div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Tipo</th><th>Emissão</th><th>Validade</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>${docs.length === 0
            ? `<tr><td colspan="5"><div class="empty-state"><i class="bi bi-file-earmark-x"></i><p>Nenhum documento cadastrado.</p></div></td></tr>`
            : docs.map(d => {
                const s = validadeStatus(d.DataValidade ? d.DataValidade.split('T')[0] : null);
                return `<tr>
                  <td><strong>${esc(d.TipoDocumento||'—')}</strong></td>
                  <td>${fmtDate(d.DataEmissao ? d.DataEmissao.split('T')[0] : '')}</td>
                  <td>${fmtDate(d.DataValidade ? d.DataValidade.split('T')[0] : '')}</td>
                  <td><span class="badge ${s.cls}">${s.txt}</span></td>
                  <td><div class="btn-group">
                    ${d.LinkArquivo ? `<a href="${esc(d.LinkArquivo)}" target="_blank" class="btn btn-outline btn-sm"><i class="bi bi-box-arrow-up-right"></i></a>` : ''}
                    <button class="btn btn-outline btn-sm" onclick="navigate('documentos/editar',{clienteId:'${clienteId}',id:'${d.id}'})"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-ghost btn-sm" onclick="deletarDocumento('${d.id}','${clienteId}')"><i class="bi bi-trash" style="color:var(--danger)"></i></button>
                  </div></td>
                </tr>`;
              }).join('')
          }</tbody>
        </table>
      </div>
    </div>`;
}

async function deletarDocumento(id, clienteId) {
  if (!confirm('Excluir este documento?')) return;
  showLoading();
  try {
    await App.graph.deleteItem(CONFIG.listas.documentos, id);
    App.invalidateCache('documentos');
    toast('Documento excluído.', 'success');
    navigate('clientes/perfil', { id: clienteId, tab: 'documentos' });
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

function renderPerfilProcessos(processos, clienteId) {
  return `
    <div class="toolbar">
      <span style="font-size:13px;color:var(--text-muted)">${processos.length} processo(s)</span>
      <button class="btn btn-primary" onclick="navigate('processos/novo',{clienteId:'${clienteId}'})"><i class="bi bi-plus-lg"></i> Novo Processo</button>
    </div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Tipo</th><th>Protocolo</th><th>Abertura</th><th>Prazo</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>${processos.length === 0
            ? `<tr><td colspan="6"><div class="empty-state"><i class="bi bi-folder-x"></i><p>Nenhum processo.</p></div></td></tr>`
            : processos.sort((a,b) => (b.DataAbertura||'').localeCompare(a.DataAbertura||'')).map(p => {
                const b = statusBadge(p.Status);
                return `<tr style="cursor:pointer" onclick="navigate('processos/detalhe',{id:'${p.id}'})">
                  <td><strong>${esc(p.TipoProcesso||'—')}</strong></td>
                  <td>${esc(p.NumeroProtocolo||'—')}</td>
                  <td>${fmtDate(p.DataAbertura ? p.DataAbertura.split('T')[0] : '')}</td>
                  <td>${fmtDate(p.DataPrazo ? p.DataPrazo.split('T')[0] : '')}</td>
                  <td><span class="badge ${b.cls}">${b.txt}</span></td>
                  <td><div class="btn-group">
                    <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();navigate('processos/detalhe',{id:'${p.id}'})"><i class="bi bi-eye"></i></button>
                    <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();navigate('processos/editar',{id:'${p.id}'})"><i class="bi bi-pencil"></i></button>
                  </div></td>
                </tr>`;
              }).join('')
          }</tbody>
        </table>
      </div>
    </div>`;
}

function renderPerfilPagamentos(processos, clienteId) {
  const comValor = processos.filter(p => Number(p.ValorProcesso) > 0);
  let totalPendente = 0, totalRecebido = 0;
  comValor.forEach(p => { const c = calcPagamento(p); totalRecebido += c.recebido; totalPendente += c.pendente; });

  function renderLinha(p) {
    const b = statusBadge(p.Status);
    const cp = calcPagamento(p);
    const parcelasInfo = p.TipoPagamento === 'Parcelado' && p.NumeroParcelas
      ? `<div style="font-size:11px;color:var(--text-muted)">${p.NumeroParcelas}x de ${fmtMoeda(p.ValorParcelas)}${p.DataVencimentoParcelas?' · Venc. '+fmtDate(p.DataVencimentoParcelas.split('T')[0]):''}</div>`
      : '';
    return `<tr>
      <td><a style="cursor:pointer;color:var(--accent);font-weight:600" onclick="navigate('processos/detalhe',{id:'${p.id}'})">${esc(p.TipoProcesso||'—')}</a><br/><span style="font-size:11px;color:var(--text-muted)">${esc(p.NumeroProtocolo||'')}</span></td>
      <td>${fmtMoeda(p.ValorProcesso)}<br/>${parcelasInfo}</td>
      <td>${esc(p.TipoPagamento||'À vista')}</td>
      <td>${esc(p.FormaPagamento||'—')}</td>
      <td style="color:var(--success);font-weight:600">${fmtMoeda(cp.recebido)}</td>
      <td style="color:${cp.pendente>0?'var(--danger)':'var(--success)'};font-weight:600">${fmtMoeda(cp.pendente)}</td>
      <td><span class="badge ${b.cls}">${b.txt}</span></td>
    </tr>`;
  }

  return `
    <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap">
      <div class="stat-card" style="flex:1;min-width:200px">
        <div class="stat-icon yellow"><i class="bi bi-hourglass-split"></i></div>
        <div><div class="stat-value">${fmtMoeda(totalPendente)}</div><div class="stat-label">Total pendente</div></div>
      </div>
      <div class="stat-card" style="flex:1;min-width:200px">
        <div class="stat-icon blue"><i class="bi bi-check-circle"></i></div>
        <div><div class="stat-value">${fmtMoeda(totalRecebido)}</div><div class="stat-label">Total recebido</div></div>
      </div>
    </div>
    ${comValor.length > 0 ? `
    <div class="card">
      <div class="card-header"><h3><i class="bi bi-cash-coin me-2"></i>Todos os Pagamentos</h3></div>
      <div class="table-wrapper"><table>
        <thead><tr><th>Processo</th><th>Valor Total</th><th>Tipo</th><th>Forma</th><th>Recebido</th><th>Pendente</th><th>Status</th></tr></thead>
        <tbody>${comValor.map(renderLinha).join('')}</tbody>
      </table></div>
    </div>` : '<div class="empty-state"><i class="bi bi-cash-coin"></i><p>Nenhum dado de pagamento encontrado nos processos.</p></div>'}`;
}

// ============================================================
// ARMAS — FORMULÁRIO
// ============================================================
function toggleAlmaCano() {
  const el = document.querySelector('[name="AlmaCano"]');
  if (!el) return;
  const v = el.value;
  const divRaias   = document.getElementById('div-num-raias');
  const divSentido = document.getElementById('div-sentido-raias');
  const selSentido = document.querySelector('[name="SentidoRaias"]');
  if (v === 'Raiada') {
    if (divRaias)   divRaias.style.display   = '';
    if (divSentido) divSentido.style.display = '';
  } else {
    if (divRaias)   divRaias.style.display   = 'none';
    if (divSentido) divSentido.style.display = 'none';
    if (selSentido && v === 'Lisa') selSentido.value = 'Não tem';
  }
}

function toggleCamposOrgaoCadastro() {
  const el = document.querySelector('[name="OrgaoCadastro"]');
  if (!el) return;
  const v = el.value;
  const sigma    = document.getElementById('div-sigma');
  const sinarm   = document.getElementById('div-sinarm');
  const registro = document.getElementById('div-registro');
  if (sigma)    sigma.style.display    = v === 'PF - Exército'       ? '' : 'none';
  if (sinarm)   sinarm.style.display   = v === 'PF - Defesa Pessoal' ? '' : 'none';
  if (registro) registro.style.display = v === 'PF - Defesa Pessoal' ? '' : 'none';
}

async function renderArmaForm(clienteId, id = null) {
  document.getElementById('page-title').textContent = id ? 'Editar Arma' : 'Nova Arma';
  let a = {};
  if (id) a = await App.graph.getItem(CONFIG.listas.armas, id);
  const cliente = await App.graph.getItem(CONFIG.listas.clientes, clienteId);

  const val = (f) => esc(a[f] || '');
  const sel = (f, v) => a[f] === v ? 'selected' : '';
  const paisesOpts = PAISES_FABRICACAO.map(p => `<option value="${p}" ${sel('PaisFabricacao',p)}>${p}</option>`).join('');
  const catsList = (cliente.Categoria || '').split(',').map(s => s.trim()).filter(Boolean);
  const todasCats = ['Colecionador', 'Atirador', 'Caçador'];
  const catsDisponiveis = catsList.length > 0 ? catsList : todasCats;
  const atividadeOpts = catsDisponiveis.map(c => `<option value="${c}" ${sel('AtividadeCadastrada',c)}>${c}</option>`).join('');

  // Inferir OrgaoCadastro de armas existentes que ainda não têm o campo
  const orgaoVal = a.OrgaoCadastro || (a.NumeroSIGMA ? 'PF - Exército' : (a.NumeroSINARM ? 'PF - Defesa Pessoal' : ''));
  const selOrgao = (v) => orgaoVal === v ? 'selected' : '';

  document.getElementById('page-content').innerHTML = `
  <div style="margin-bottom:12px"><span style="color:var(--text-muted);font-size:13px">Cliente: </span><strong>${esc(cliente.Title)}</strong></div>
  <form id="form-arma" onsubmit="salvarArma(event,'${clienteId}','${id||''}')">
    <div class="form-section">
      <div class="form-section-title">Identificação da Arma</div>
      <div class="form-body">
        <div class="form-grid">
          <div><label>Número de Série *</label><input name="NumeroSerie" value="${val('NumeroSerie')}" required /></div>
          <div><label>Órgão de Cadastro</label>
            <select name="OrgaoCadastro" onchange="toggleCamposOrgaoCadastro()">
              <option value="">Selecione...</option>
              <option value="PF - Exército"       ${selOrgao('PF - Exército')}>PF - Exército</option>
              <option value="PF - Defesa Pessoal" ${selOrgao('PF - Defesa Pessoal')}>PF - Defesa Pessoal</option>
            </select>
          </div>
          <div id="div-sigma" style="display:none"><label>Número SIGMA</label><input name="NumeroSIGMA" value="${val('NumeroSIGMA')}" /></div>
          <div id="div-sinarm" style="display:none"><label>Número SINARM</label><input name="NumeroSINARM" value="${val('NumeroSINARM')}" /></div>
          <div id="div-registro" style="display:none"><label>Número de Registro</label><input name="NumeroRegistro" value="${val('NumeroRegistro')}" /></div>
          <div><label>Atividade Cadastrada *</label>
            <select name="AtividadeCadastrada" required>
              <option value="">Selecione...</option>
              ${atividadeOpts}
            </select>
          </div>
          <div><label>Marca *</label><input name="Marca" value="${val('Marca')}" required /></div>
          <div><label>Modelo *</label><input name="Modelo" value="${val('Modelo')}" required /></div>
          <div><label>Espécie</label>
            <select name="Especie">
              <option value="">Selecione...</option>
              <option value="Pistola"        ${sel('Especie','Pistola')}>Pistola</option>
              <option value="Espingarda"     ${sel('Especie','Espingarda')}>Espingarda</option>
              <option value="Revólver"       ${sel('Especie','Revólver')}>Revólver</option>
              <option value="Carabina/Fuzil" ${sel('Especie','Carabina/Fuzil')}>Carabina/Fuzil</option>
            </select>
          </div>
          <div><label>Calibre</label><input name="Calibre" value="${val('Calibre')}" /></div>
          <div><label>Grupo Calibre *</label>
            <select name="GrupoCalibre" required>
              <option value="">Selecione...</option>
              <option value="Permitido" ${sel('GrupoCalibre','Permitido')}>Permitido</option>
              <option value="Restrito"  ${sel('GrupoCalibre','Restrito')}>Restrito</option>
            </select>
          </div>
          <div><label>País de Fabricação</label><select name="PaisFabricacao"><option value="">Selecione...</option>${paisesOpts}</select></div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Características Técnicas</div>
      <div class="form-body">
        <div class="form-grid">
          <div><label>Capacidade de Tiro</label><input name="CapacidadeTiro" value="${val('CapacidadeTiro')}" /></div>
          <div><label>N° de Canos</label>
            <select name="NumeroCanos">
              <option value="">Selecione...</option>
              <option value="1" ${sel('NumeroCanos','1')}>1</option>
              <option value="2" ${sel('NumeroCanos','2')}>2</option>
              <option value="3" ${sel('NumeroCanos','3')}>3</option>
              <option value="4" ${sel('NumeroCanos','4')}>4</option>
            </select>
          </div>
          <div><label>Comprimento do Cano (mm)</label><input name="ComprimentoCano" type="number" min="0" value="${val('ComprimentoCano')}" /></div>
          <div><label>Alma do Cano</label>
            <select name="AlmaCano" onchange="toggleAlmaCano()">
              <option value="">Selecione...</option>
              <option value="Raiada" ${sel('AlmaCano','Raiada')}>Raiada</option>
              <option value="Lisa"   ${sel('AlmaCano','Lisa')}>Lisa</option>
            </select>
          </div>
          <div id="div-num-raias" style="display:none"><label>N° de Raias</label><input name="NumeroRaias" value="${val('NumeroRaias')}" /></div>
          <div id="div-sentido-raias" style="display:none"><label>Sentido das Raias</label>
            <select name="SentidoRaias">
              <option value="">Selecione...</option>
              <option value="Não tem" ${sel('SentidoRaias','Não tem')}>Não tem</option>
              <option value="Direita"  ${sel('SentidoRaias','Direita')}>Direita</option>
              <option value="Esquerda" ${sel('SentidoRaias','Esquerda')}>Esquerda</option>
            </select>
          </div>
          <div><label>Acabamento</label>
            <select name="Acabamento">
              <option value="">Selecione...</option>
              <option value="Oxidado"   ${sel('Acabamento','Oxidado')}>Oxidado</option>
              <option value="Aço Inox"  ${sel('Acabamento','Aço Inox')}>Aço Inox</option>
              <option value="Niquelado" ${sel('Acabamento','Niquelado')}>Niquelado</option>
              <option value="Outros"    ${sel('Acabamento','Outros')}>Outros</option>
            </select>
          </div>
          <div><label>Funcionamento</label>
            <select name="Funcionamento">
              <option value="">Selecione...</option>
              <option value="Semi-Automático" ${sel('Funcionamento','Semi-Automático')}>Semi-Automático</option>
              <option value="Tiro-Simples"    ${sel('Funcionamento','Tiro-Simples')}>Tiro-Simples</option>
              <option value="Repetição"       ${sel('Funcionamento','Repetição')}>Repetição</option>
            </select>
          </div>
          <div style="grid-column:1/-1"><label>Observações</label><textarea name="Observacoes">${val('Observacoes')}</textarea></div>
        </div>
      </div>
    </div>

    <div class="btn-group" style="margin-top:8px">
      <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> Salvar</button>
      <button type="button" class="btn btn-outline" onclick="navigate('clientes/perfil',{id:'${clienteId}',tab:'armas'})">Cancelar</button>
    </div>
  </form>`;
  setTimeout(() => { toggleCamposOrgaoCadastro(); toggleAlmaCano(); }, 0);
}

async function salvarArma(e, clienteId, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const atividade  = fd.get('AtividadeCadastrada');
  const grupoCal   = fd.get('GrupoCalibre');

  // Valida limites de acervo (só para novas armas)
  if (!id) {
    const todasArmas = await App.getArmas();
    if (atividade === 'Caçador') {
      const armCac = todasArmas.filter(a => String(a.ClienteId) === String(clienteId) && a.AtividadeCadastrada === 'Caçador');
      if (armCac.length >= 6) { toast('Limite atingido: acervo Caçador permite no máximo 6 armas.', 'error'); return; }
      if (grupoCal === 'Restrito') {
        const resCac = armCac.filter(a => a.GrupoCalibre === 'Restrito');
        if (resCac.length >= 2) { toast('Limite atingido: acervo Caçador permite no máximo 2 armas de calibre Restrito.', 'error'); return; }
      }
    }
    if (atividade === 'Atirador' && grupoCal === 'Permitido') {
      const permAti = todasArmas.filter(a => String(a.ClienteId) === String(clienteId) && a.AtividadeCadastrada === 'Atirador' && a.GrupoCalibre === 'Permitido');
      if (permAti.length >= 4) { toast('Limite atingido: acervo Atirador permite no máximo 4 armas de calibre Permitido.', 'error'); return; }
    }
  }

  const cliente = await App.graph.getItem(CONFIG.listas.clientes, clienteId);
  const fields = {
    Title:             `${fd.get('Marca')||''} ${fd.get('Modelo')||''} - ${fd.get('NumeroSerie')||''}`.trim(),
    ClienteId:         clienteId,
    ClienteNome:       cliente.Title,
    NumeroSerie:       fd.get('NumeroSerie'),
    OrgaoCadastro:     fd.get('OrgaoCadastro') || null,
    NumeroSIGMA:       fd.get('NumeroSIGMA') || null,
    NumeroSINARM:      fd.get('NumeroSINARM') || null,
    NumeroRegistro:    fd.get('NumeroRegistro') || null,
    AtividadeCadastrada: atividade,
    Modelo:            fd.get('Modelo'),
    Calibre:           fd.get('Calibre'),
    Especie:           fd.get('Especie'),
    Marca:             fd.get('Marca'),
    GrupoCalibre:      grupoCal,
    PaisFabricacao:    fd.get('PaisFabricacao'),
    CapacidadeTiro:    fd.get('CapacidadeTiro'),
    NumeroCanos:       fd.get('NumeroCanos'),
    ComprimentoCano:   fd.get('ComprimentoCano') || null,
    AlmaCano:          fd.get('AlmaCano'),
    NumeroRaias:       fd.get('NumeroRaias'),
    SentidoRaias:      fd.get('SentidoRaias'),
    Acabamento:        fd.get('Acabamento'),
    Funcionamento:     fd.get('Funcionamento'),
    Observacoes:       fd.get('Observacoes'),
  };
  showLoading();
  try {
    if (id) { await App.graph.updateItem(CONFIG.listas.armas, id, fields); toast('Arma atualizada!', 'success'); }
    else     { await App.graph.createItem(CONFIG.listas.armas, fields); toast('Arma cadastrada!', 'success'); }
    App.invalidateCache('armas');
    navigate('clientes/perfil', { id: clienteId, tab: 'armas' });
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

// ============================================================
// DOCUMENTOS — FORMULÁRIO
// ============================================================
async function renderDocumentoForm(clienteId, id = null) {
  document.getElementById('page-title').textContent = id ? 'Editar Documento' : 'Novo Documento';
  const cliente = await App.graph.getItem(CONFIG.listas.clientes, clienteId);
  let d = {};
  if (id) d = await App.graph.getItem(CONFIG.listas.documentos, id);

  const todasArmas = (await App.getArmas()).filter(a => String(a.ClienteId) === String(clienteId));
  const todosClientes = await App.getClientes();

  const armasOpts = todasArmas.map(a => `<option value="${a.id}|${esc(a.NumeroSerie||'')} ${esc(a.Marca||'')} ${esc(a.Modelo||'')}" ${String(d.ArmaVinculadaId)===String(a.id)?'selected':''}>${esc(a.NumeroSerie||'')} — ${esc(a.Marca||'')} ${esc(a.Modelo||'')}</option>`).join('');
  const clientesOpts = todosClientes.map(c => `<option value="${c.id}|${esc(c.Title)}" ${String(d.ClienteDonoCRAFId)===String(c.id)?'selected':''}>${esc(c.Title)}</option>`).join('');
  const tipoAtual = d.TipoDocumento || '';

  document.getElementById('page-content').innerHTML = `
  <div style="margin-bottom:12px"><span style="color:var(--text-muted);font-size:13px">Cliente: </span><strong>${esc(cliente.Title)}</strong></div>
  <form id="form-doc" onsubmit="salvarDocumento(event,'${clienteId}','${id||''}')">
    <div class="form-section">
      <div class="form-section-title">Documento</div>
      <div class="form-body">
        <div class="form-grid">
          <div><label>Tipo de Documento *</label>
            <select name="TipoDocumento" required onchange="onTipoDocChange(this.value,'${clienteId}')">
              <option value="">Selecione...</option>
              <option value="CTF"           ${tipoAtual==='CTF'?'selected':''}>CTF</option>
              <option value="SIMAF"         ${tipoAtual==='SIMAF'?'selected':''}>SIMAF</option>
              <option value="CRAF"          ${tipoAtual==='CRAF'?'selected':''}>CRAF</option>
              <option value="Guia de Tráfego" ${tipoAtual==='Guia de Tráfego'?'selected':''}>Guia de Tráfego</option>
            </select>
          </div>
          <div><label>Link do Arquivo (SharePoint)</label><input type="url" name="LinkArquivo" value="${esc(d.LinkArquivo||'')}" placeholder="https://..." /></div>
          <div><label>Data de Emissão</label><input type="date" name="DataEmissao" id="doc-emissao" value="${d.DataEmissao?d.DataEmissao.split('T')[0]:''}" onchange="onEmissaoChange(this.value)" /></div>
          <div><label>Data de Validade</label><input type="date" name="DataValidade" id="doc-validade" value="${d.DataValidade?d.DataValidade.split('T')[0]:''}" /></div>
        </div>

        <div id="campos-ctf"          style="display:none"></div>
        <div id="campos-simaf"        style="display:none" class="form-grid" style="margin-top:16px">
          <div><label>Cidade</label><input name="CidadeDoc" value="${esc(d.CidadeDoc||'')}" /></div>
          <div><label>Nome da Fazenda</label><input name="NomeFazenda" value="${esc(d.NomeFazenda||'')}" /></div>
          <div><label>N° do CAR</label><input name="NumeroCar" value="${esc(d.NumeroCar||'')}" /></div>
        </div>
        <div id="campos-craf" style="display:none">
          <div class="form-grid" style="margin-top:16px">
            <div><label>Cliente Dono do CRAF</label>
              <select name="ClienteDonoCRAF" onchange="onClienteCRAFChange(this.value,'${clienteId}')">
                <option value="">Selecione...</option>${clientesOpts}
              </select>
            </div>
            <div><label>Arma</label>
              <select name="ArmaVinculadaCRAF" id="arma-craf-sel">
                <option value="">Selecione o cliente primeiro...</option>${armasOpts}
              </select>
            </div>
          </div>
        </div>
        <div id="campos-guia" style="display:none">
          <div class="form-grid" style="margin-top:16px">
            <div><label>Arma</label>
              <select name="ArmaVinculadaGuia">
                <option value="">Selecione...</option>${armasOpts}
              </select>
            </div>
            <div><label>Endereço</label>
              <select name="EnderecoGuia">
                <option value="">Selecione...</option>
                <option value="1° Endereço" ${d.EnderecoGuia==='1° Endereço'?'selected':''}>1° Endereço — ${esc(cliente.Endereco1||'')} ${esc(cliente.Numero1||'')}, ${esc(cliente.Cidade1||'')}</option>
                ${cliente.Endereco2?`<option value="2° Endereço" ${d.EnderecoGuia==='2° Endereço'?'selected':''}>2° Endereço — ${esc(cliente.Endereco2||'')} ${esc(cliente.Numero2||'')}, ${esc(cliente.Cidade2||'')}</option>`:''}
              </select>
            </div>
            <div><label>Tipo de Guia</label>
              <select name="TipoGuia" onchange="onTipoGuiaChange(this.value)">
                <option value="">Selecione...</option>
                <option value="Caça"                   ${d.TipoGuia==='Caça'?'selected':''}>Caça</option>
                <option value="Caça-Treinamento Tiro"  ${d.TipoGuia==='Caça-Treinamento Tiro'?'selected':''}>Caça-Treinamento Tiro</option>
                <option value="Tiro Esportivo"          ${d.TipoGuia==='Tiro Esportivo'?'selected':''}>Tiro Esportivo</option>
              </select>
            </div>
          </div>
          <div id="guia-caca" style="display:none;margin-top:8px">
            <div class="form-grid">
              <div><label>Cidade (Caça)</label><input name="CidadeGuia" value="${esc(d.CidadeGuia||'')}" /></div>
              <div><label>UF (Caça)</label><input name="UFGuia" value="${esc(d.UFGuia||'')}" maxlength="2" style="text-transform:uppercase" /></div>
            </div>
          </div>
          <div id="guia-clube" style="display:none;margin-top:8px">
            <div class="form-grid">
              <div><label>Nome do Clube de Tiro</label><input name="NomeClubeTiro" value="${esc(d.NomeClubeTiro||'')}" /></div>
              <div><label>CR do Clube de Tiro</label><input name="CRClubeTiro" value="${esc(d.CRClubeTiro||'')}" /></div>
              <div style="grid-column:span 2"><label>Endereço do Clube</label><input name="EnderecoClubeTiro" value="${esc(d.EnderecoClubeTiro||'')}" /></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="btn-group" style="margin-top:8px">
      <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> Salvar</button>
      <button type="button" class="btn btn-outline" onclick="navigate('clientes/perfil',{id:'${clienteId}',tab:'documentos'})">Cancelar</button>
    </div>
  </form>`;

  if (tipoAtual) onTipoDocChange(tipoAtual, clienteId);
  if (d.TipoGuia) onTipoGuiaChange(d.TipoGuia);
}

function onTipoDocChange(tipo) {
  ['campos-simaf','campos-craf','campos-guia'].forEach(id => document.getElementById(id).style.display = 'none');
  if (tipo === 'CTF')              { /* CTF só tem emissão e validade auto */ }
  else if (tipo === 'SIMAF')       document.getElementById('campos-simaf').style.display = '';
  else if (tipo === 'CRAF')        document.getElementById('campos-craf').style.display = '';
  else if (tipo === 'Guia de Tráfego') document.getElementById('campos-guia').style.display = '';
}
function onEmissaoChange(val) {
  const tipo = document.querySelector('[name="TipoDocumento"]')?.value;
  if (tipo === 'CTF' && val) document.getElementById('doc-validade').value = addDays(val, 90);
}
function onTipoGuiaChange(tipo) {
  document.getElementById('guia-caca').style.display  = tipo === 'Caça' ? '' : 'none';
  document.getElementById('guia-clube').style.display = (tipo === 'Caça-Treinamento Tiro' || tipo === 'Tiro Esportivo') ? '' : 'none';
}
async function onClienteCRAFChange(val, clienteId) {
  if (!val) return;
  const [cid] = val.split('|');
  const todasArmas = await App.getArmas();
  const armas = todasArmas.filter(a => String(a.ClienteId) === String(cid));
  const sel = document.getElementById('arma-craf-sel');
  sel.innerHTML = '<option value="">Selecione...</option>' + armas.map(a => `<option value="${a.id}|${esc(a.NumeroSerie||'')} ${esc(a.Marca||'')} ${esc(a.Modelo||'')}">${esc(a.NumeroSerie||'')} — ${esc(a.Marca||'')} ${esc(a.Modelo||'')}</option>`).join('');
}

async function salvarDocumento(e, clienteId, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const tipo = fd.get('TipoDocumento');
  const cliente = await App.graph.getItem(CONFIG.listas.clientes, clienteId);

  const fields = {
    Title:        `${tipo} — ${cliente.Title}`,
    ClienteId:    clienteId,
    ClienteNome:  cliente.Title,
    TipoDocumento: tipo,
    LinkArquivo:  fd.get('LinkArquivo') || '',
    DataEmissao:  fd.get('DataEmissao') || null,
    DataValidade: fd.get('DataValidade') || null,
  };

  if (tipo === 'SIMAF') {
    fields.CidadeDoc  = fd.get('CidadeDoc');
    fields.NomeFazenda = fd.get('NomeFazenda');
    fields.NumeroCar  = fd.get('NumeroCar');
  }
  if (tipo === 'CRAF') {
    const crafVal = fd.get('ClienteDonoCRAF') || '';
    const [cid, cnome] = crafVal.split('|');
    fields.ClienteDonoCRAFId   = cid || null;
    fields.ClienteDonoCRAFNome = cnome || '';
    const armaVal = fd.get('ArmaVinculadaCRAF') || '';
    const [aid, adesc] = armaVal.split('|');
    fields.ArmaVinculadaId   = aid || null;
    fields.ArmaVinculadaDesc = adesc || '';
  }
  if (tipo === 'Guia de Tráfego') {
    const armaVal = fd.get('ArmaVinculadaGuia') || '';
    const [aid, adesc] = armaVal.split('|');
    fields.ArmaVinculadaId   = aid || null;
    fields.ArmaVinculadaDesc = adesc || '';
    fields.EnderecoGuia = fd.get('EnderecoGuia');
    fields.TipoGuia     = fd.get('TipoGuia');
    const tguia = fd.get('TipoGuia');
    if (tguia === 'Caça') {
      fields.CidadeGuia = fd.get('CidadeGuia');
      fields.UFGuia     = fd.get('UFGuia');
    } else {
      fields.NomeClubeTiro   = fd.get('NomeClubeTiro');
      fields.CRClubeTiro     = fd.get('CRClubeTiro');
      fields.EnderecoClubeTiro = fd.get('EnderecoClubeTiro');
    }
  }

  showLoading();
  try {
    if (id) { await App.graph.updateItem(CONFIG.listas.documentos, id, fields); toast('Documento atualizado!', 'success'); }
    else     { await App.graph.createItem(CONFIG.listas.documentos, fields); toast('Documento cadastrado!', 'success'); }
    App.invalidateCache('documentos');
    navigate('clientes/perfil', { id: clienteId, tab: 'documentos' });
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

// ============================================================
// PROCESSOS — LISTA
// ============================================================
async function renderProcessosList() {
  document.getElementById('page-title').textContent = 'Processos';
  const [processos, clientes] = await Promise.all([App.getProcessos(), App.getClientes()]);

  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="toolbar">
      <div class="search-bar"><i class="bi bi-search"></i><input id="busca-proc" placeholder="Buscar por cliente ou tipo..." oninput="filtrarProcessos()" /></div>
      <div class="btn-group">
        <select id="filtro-status" onchange="filtrarProcessos()" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          <option value="">Todos os status</option>
          ${STATUS_PROCESSO.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <button class="btn btn-primary" onclick="navigate('processos/novo')"><i class="bi bi-plus-lg"></i> Novo Processo</button>
      </div>
    </div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Cliente</th><th>Tipo de Processo</th><th>Responsável</th><th>Protocolo</th><th>Abertura</th><th>Prazo</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody id="tbody-processos">${renderProcessosRows(processos)}</tbody>
        </table>
      </div>
    </div>`;
  window._processos_filtro = processos;
}

function renderProcessosRows(lista) {
  if (!lista.length) return `<tr><td colspan="8"><div class="empty-state"><i class="bi bi-folder-x"></i><p>Nenhum processo encontrado.</p></div></td></tr>`;
  return lista.sort((a,b) => (b.DataAbertura||'').localeCompare(a.DataAbertura||'')).map(p => {
    const b = statusBadge(p.Status);
    return `<tr style="cursor:pointer" onclick="navigate('processos/detalhe',{id:'${p.id}'})">
      <td><strong>${esc(p.ClienteNome||'—')}</strong></td>
      <td>${esc(p.TipoProcesso||'—')}</td>
      <td>${p.Responsavel ? `<span class="badge badge-blue">${esc(p.Responsavel)}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${esc(p.NumeroProtocolo||'—')}</td>
      <td>${fmtDate(p.DataAbertura?p.DataAbertura.split('T')[0]:'')}</td>
      <td>${fmtDate(p.DataPrazo?p.DataPrazo.split('T')[0]:'')}</td>
      <td>
        <span class="badge ${b.cls}">${b.txt}</span>
        ${p.Restituido ? '<span class="badge" style="background:#9333ea;color:#fff;margin-left:4px;font-size:11px"><i class="bi bi-arrow-return-left"></i> Restituído</span>' : ''}
      </td>
      <td><div class="btn-group">
        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();navigate('processos/detalhe',{id:'${p.id}'})"><i class="bi bi-eye"></i></button>
        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();navigate('processos/editar',{id:'${p.id}'})"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deletarProcesso('${p.id}','${esc(p.ClienteNome||'')}')" title="Excluir processo"><i class="bi bi-trash"></i></button>
      </div></td>
    </tr>`;
  }).join('');
}

function filtrarProcessos() {
  const q = document.getElementById('busca-proc').value.toLowerCase();
  const s = document.getElementById('filtro-status').value;
  let lista = window._processos_filtro;
  if (q) lista = lista.filter(p => (p.ClienteNome||'').toLowerCase().includes(q) || (p.TipoProcesso||'').toLowerCase().includes(q));
  if (s) lista = lista.filter(p => p.Status === s);
  document.getElementById('tbody-processos').innerHTML = renderProcessosRows(lista);
}

async function deletarProcesso(id, clienteNome) {
  if (!confirm(`Excluir o processo de "${clienteNome}"?\n\nEsta ação não pode ser desfeita.`)) return;
  showLoading();
  try {
    await App.graph.deleteItem(CONFIG.listas.processos, id);
    App.invalidateCache('processos');
    toast('Processo excluído.', 'success');
    if (getRoute().page === 'processos') {
      await renderProcessosList();
    } else {
      navigate('processos');
    }
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

// ============================================================
// PROCESSOS — FORMULÁRIO (NOVO)
// ============================================================
async function renderProcessoForm(clienteId = null) {
  document.getElementById('page-title').textContent = 'Novo Processo';
  const clientes = await App.getClientes();
  const clientesOpts = clientes.map(c => `<option value="${c.id}" ${String(c.id)===String(clienteId)?'selected':''}>${esc(c.Title)}</option>`).join('');

  document.getElementById('page-content').innerHTML = `
  <form id="form-processo" onsubmit="salvarProcesso(event)">
    <div class="form-section">
      <div class="form-section-title">Informações Gerais</div>
      <div class="form-body">
        <div class="form-grid">
          <div><label>Cliente *</label>
            <select name="ClienteId" required onchange="onClienteProcessoChange(this.value)">
              <option value="">Selecione...</option>${clientesOpts}
            </select>
          </div>
          <div><label>Tipo de Processo *</label>
            <select name="TipoProcesso" required onchange="onTipoProcessoChange(this.value)">
              <option value="">Selecione...</option>
              ${TIPOS_PROCESSO.map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>
          </div>
          <div><label>Responsável</label>
            <select name="Responsavel">
              <option value="">Selecione...</option>
              ${RESPONSAVEIS.map(r => `<option value="${r}">${r}</option>`).join('')}
            </select>
          </div>
          <div><label>Status</label>
            <select name="Status">
              ${STATUS_PROCESSO.map(s => `<option value="${s}" ${s==='Aguardando Documentos'?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div><label>Data de Abertura</label><input type="date" name="DataAbertura" value="${new Date().toISOString().split('T')[0]}" /></div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Pagamento</div>
      <div class="form-body">
        <div class="form-grid">
          <div><label>Valor do Processo (R$)</label><input type="number" name="ValorProcesso" step="0.01" min="0" placeholder="0,00" oninput="calcularParcelas()" /></div>
          <div>
            <label>Tipo de Pagamento</label>
            <div class="checkbox-group">
              <label class="checkbox-item"><input type="radio" name="TipoPagamento" value="À vista" checked onchange="onTipoPagamentoChange(this.value)" /> À vista</label>
              <label class="checkbox-item"><input type="radio" name="TipoPagamento" value="Parcelado" onchange="onTipoPagamentoChange(this.value)" /> Parcelado</label>
            </div>
          </div>
          <div><label>Forma de Pagamento</label>
            <select name="FormaPagamento">
              <option value="">Selecione...</option>
              <option value="Pix">Pix</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Cartão">Cartão</option>
            </select>
          </div>
          <div id="campo-data-pag-novo"><label>Data de Pagamento</label><input type="date" name="DataPagamento" /></div>
        </div>
        <div id="campos-parcelado" style="display:none;margin-top:16px">
          <div class="form-grid">
            <div><label>Quantas Vezes</label>
              <select name="NumeroParcelas" onchange="calcularParcelas()">
                <option value="">Selecione...</option>
                ${[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>`<option value="${n}">${n}x</option>`).join('')}
              </select>
            </div>
            <div><label>Valor de Entrada (R$)</label><input type="number" name="ValorEntrada" step="0.01" min="0" placeholder="0,00" oninput="calcularParcelas();onValorEntradaChangeNovo(this.value)" /></div>
            <div><label>Valor das Parcelas (R$)</label><input type="text" id="valor-parcelas-display" readonly placeholder="Calculado automaticamente" /><input type="hidden" name="ValorParcelas" id="valor-parcelas-input" /></div>
            <div><label>Data de Vencimento das Parcelas</label><input type="date" name="DataVencimentoParcelas" /></div>
          </div>
        </div>
      </div>
    </div>

    <div id="campos-tipo-processo"></div>

    <div id="secao-checklist" style="display:none" class="form-section">
      <div class="form-section-title">Checklist de Documentos</div>
      <div class="form-body" id="checklist-preview"></div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Observações</div>
      <div class="form-body"><textarea name="Observacoes" rows="3" placeholder="Observações gerais sobre o processo..."></textarea></div>
    </div>

    <div class="btn-group" style="margin-top:8px">
      <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> Criar Processo</button>
      <button type="button" class="btn btn-outline" onclick="history.back()">Cancelar</button>
    </div>
  </form>`;

  if (clienteId) onClienteProcessoChange(clienteId);
}

let _processoArmasCache = [];
let _processoClienteCategoria = [];

async function onClienteProcessoChange(clienteId) {
  if (!clienteId) return;
  _processoArmasCache = (await App.getArmas()).filter(a => String(a.ClienteId) === String(clienteId));
  const clientes = await App.getClientes();
  const cliente = clientes.find(c => String(c.id) === String(clienteId));
  _processoClienteCategoria = cliente ? (cliente.Categoria || '').split(',').map(s => s.trim()).filter(Boolean) : [];
  const tipo = document.querySelector('[name="TipoProcesso"]')?.value;
  if (tipo) onTipoProcessoChange(tipo);
}

function onTipoProcessoChange(tipo) {
  const clienteId = document.querySelector('[name="ClienteId"]')?.value;
  const camposEl = document.getElementById('campos-tipo-processo');
  const checklistEl = document.getElementById('checklist-preview');
  const secaoChecklist = document.getElementById('secao-checklist');

  const valorInput = document.querySelector('[name="ValorProcesso"]');
  if (valorInput && tipo && VALORES_PROCESSO[tipo] !== undefined) {
    valorInput.value = VALORES_PROCESSO[tipo].toFixed(2);
    calcularParcelas();
  }

  camposEl.innerHTML = '';
  const armasOpts = _processoArmasCache.map(a => `<option value="${a.id}|${esc(a.AtividadeCadastrada||'')}|${esc(a.Marca||'')}|${esc(a.Modelo||'')}">${esc(a.Marca||'')} ${esc(a.Modelo||'')}${a.NumeroSerie ? ' ('+esc(a.NumeroSerie)+')' : ''} — ${esc(a.AtividadeCadastrada||'')}</option>`).join('');

  if (tipo === 'Aquisição de Arma SIGMA' || tipo === 'Aquisição de Arma PF') {
    camposEl.innerHTML = buildCamposAquisicao();
  } else if (tipo === 'Atualização de Documento de Identificação') {
    camposEl.innerHTML = buildCamposAtualizacaoDoc();
  } else if (tipo === 'Guia de Tráfego') {
    camposEl.innerHTML = buildCamposGuia(armasOpts, clienteId);
  } else if (tipo === 'Alteração de Endereço') {
    camposEl.innerHTML = buildCamposAlteracaoEndereco(clienteId);
  } else if (tipo === 'Inclusão de Atividade') {
    camposEl.innerHTML = buildCamposInclusaoExclusaoAtividade(clienteId, false);
  } else if (tipo === 'Exclusão de Atividade') {
    camposEl.innerHTML = buildCamposInclusaoExclusaoAtividade(clienteId, true);
  } else if (tipo === 'Mudança de Acervo' || tipo === 'Renovação de CRAF' || tipo === 'Segunda via de CRAF') {
    camposEl.innerHTML = buildCamposArmaSelector(armasOpts);
    if (tipo === 'Mudança de Acervo') camposEl.innerHTML += buildCamposMudancaAcervo(_processoClienteCategoria);
  } else if (TIPOS_TRANSFERENCIA.includes(tipo)) {
    camposEl.innerHTML = buildCamposTransferencia(armasOpts);
  }

  // Checklist
  const items = buildChecklistItems(tipo);
  if (items.length > 0) {
    secaoChecklist.style.display = '';
    checklistEl.innerHTML = renderChecklistForm(items);
  } else {
    secaoChecklist.style.display = 'none';
  }
}

function buildCamposAquisicao() {
  const especieOpts = ['Pistola','Espingarda','Revólver','Carabina/Fuzil'].map(v => `<option>${v}</option>`).join('');
  return `<div class="form-section"><div class="form-section-title">Dados da Arma a Adquirir</div><div class="form-body">
    <div class="form-grid">
      <div><label>Acervo (Atividade)</label><select name="proc_acervo"><option value="">Selecione...</option><option>Colecionador</option><option>Atirador</option><option>Caçador</option></select></div>
      <div><label>Funcionamento</label><select name="proc_funcionamento"><option value="">Selecione...</option><option>Repetição</option><option>Tiro-Simples</option><option>Semi-Automático</option></select></div>
      <div><label>Marca</label><input name="proc_marca" /></div>
      <div><label>Modelo</label><input name="proc_modelo" /></div>
      <div><label>Calibre</label><input name="proc_calibre" /></div>
      <div><label>Espécie</label><select name="proc_especie"><option value="">Selecione...</option>${especieOpts}</select></div>
      <div><label>Grupo Calibre</label><select name="proc_grupoCalibre"><option value="">Selecione...</option><option>Uso Permitido</option><option>Uso Restrito</option></select></div>
      <div><label>País de Fabricação</label><input name="proc_paisFabricacao" /></div>
      <div><label>Total de Carregadores</label><select name="proc_totalCarregadores"><option value="">Selecione...</option><option>1</option><option>2</option><option>3</option><option>4</option></select></div>
      <div><label>Capacidade do Cartucho</label><input name="proc_capacidadeCartucho" /></div>
      <div><label>N° de Canos</label><input name="proc_numeroCanos" /></div>
      <div><label>Alma do Cano</label><select name="proc_almaCano"><option value="">Selecione...</option><option>Lisa</option><option>Raiada</option></select></div>
      <div><label>Comprimento do Cano (mm)</label><input name="proc_comprimentoCano" /></div>
      <div><label>N° de Raias</label><input name="proc_numeroRaias" /></div>
      <div><label>Sentido das Raias</label><select name="proc_sentidoRaias"><option value="">Selecione...</option><option>Não tem</option><option>Direita</option><option>Esquerda</option></select></div>
      <div><label>Acabamento</label><input name="proc_acabamento" /></div>
      <div><label>CNPJ do Fornecedor</label><input name="proc_cnpjFornecedor" oninput="this.value=fmtCNPJ(this.value)" maxlength="18" /></div>
      <div><label>Nome do Fornecedor</label><input name="proc_nomeFornecedor" /></div>
    </div>
  </div></div>`;
}

function buildCamposAtualizacaoDoc() {
  return `<div class="form-section"><div class="form-section-title">Atualização de Documento</div><div class="form-body">
    <div class="form-grid">
      <div><label>Tipo de Documento</label><select name="proc_tipoDoc"><option value="">Selecione...</option><option>RG</option><option>CNH</option><option>Carteira Funcional</option><option>Passaporte</option></select></div>
      <div><label>Data de Expedição</label><input type="date" name="proc_dataExpedicao" /></div>
      <div><label>Data de Validade</label><input type="date" name="proc_dataValidade" /></div>
    </div>
  </div></div>`;
}

function buildCamposGuia(armasOpts, clienteId) {
  return `<div class="form-section"><div class="form-section-title">Dados da Guia</div><div class="form-body">
    <div class="form-grid">
      <div><label>Arma</label><select name="proc_armaId"><option value="">Selecione...</option>${armasOpts}</select></div>
      <div><label>Tipo de Guia</label>
        <select name="proc_tipoGuia" onchange="onTipoGuiaProcesso(this.value)">
          <option value="">Selecione...</option>
          <option>Caça</option><option>Caça-Treinamento Tiro</option><option>Tiro Esportivo</option>
        </select>
      </div>
    </div>
    <div id="proc-guia-caca" style="display:none;margin-top:12px"><div class="form-grid">
      <div><label>Cidade</label><input name="proc_cidadeGuia" /></div>
      <div><label>UF</label><input name="proc_ufGuia" maxlength="2" style="text-transform:uppercase" /></div>
    </div></div>
    <div id="proc-guia-clube" style="display:none;margin-top:12px"><div class="form-grid">
      <div><label>Nome do Clube de Tiro</label><input name="proc_nomeClube" /></div>
      <div><label>CR do Clube</label><input name="proc_crClube" /></div>
      <div style="grid-column:span 2"><label>Endereço do Clube</label><input name="proc_enderecoClube" /></div>
    </div></div>
  </div></div>`;
}

function onTipoGuiaProcesso(tipo) {
  document.getElementById('proc-guia-caca').style.display  = tipo === 'Caça' ? '' : 'none';
  document.getElementById('proc-guia-clube').style.display = (tipo === 'Caça-Treinamento Tiro' || tipo === 'Tiro Esportivo') ? '' : 'none';
  // Atualiza checklist
  const items = buildChecklistItems('Guia de Tráfego', tipo);
  const checklistEl = document.getElementById('checklist-preview');
  const secaoChecklist = document.getElementById('secao-checklist');
  if (items.length) { secaoChecklist.style.display=''; checklistEl.innerHTML = renderChecklistForm(items); }
  else { secaoChecklist.style.display='none'; }
}

function buildCamposAlteracaoEndereco(clienteId) {
  return `<div class="form-section"><div class="form-section-title">Alteração de Endereço</div><div class="form-body">
    <div class="form-grid">
      <div><label>Endereço a Alterar/Adicionar</label>
        <select name="proc_enderecoAlteracao">
          <option value="1° Endereço">1° Endereço</option>
          <option value="2° Endereço">2° Endereço</option>
        </select>
      </div>
      <div style="grid-column:span 2"><label>Novo Endereço Completo</label><input name="proc_novoEndereco" /></div>
    </div>
  </div></div>`;
}

function buildCamposInclusaoExclusaoAtividade(clienteId, exclusao) {
  const cliente = window._processoArmasCache;
  // Obtemos categorias do cliente via o select já selecionado
  const titulo = exclusao ? 'Atividade a Excluir' : 'Atividade a Incluir';
  const label  = exclusao ? 'Atividade' : 'Atividade';
  return `<div class="form-section"><div class="form-section-title">${titulo}</div><div class="form-body">
    <div class="form-grid">
      <div><label>${label}</label>
        <select name="proc_atividade">
          <option value="">Selecione...</option>
          <option>Colecionador</option><option>Atirador</option><option>Caçador</option>
        </select>
      </div>
    </div>
  </div></div>`;
}

function buildCamposArmaSelector(armasOpts) {
  return `<div class="form-section"><div class="form-section-title">Arma</div><div class="form-body">
    <div class="form-grid">
      <div><label>Arma *</label><select name="proc_armaId" required onchange="onArmaAcervoChange(this.value)"><option value="">Selecione...</option>${armasOpts}</select></div>
    </div>
  </div></div>`;
}

function onArmaAcervoChange(val) {
  const parts = (val || '').split('|');
  const atividade = parts[1] || '';
  const input = document.querySelector('[name="proc_acervoAtual"]');
  if (input) input.value = atividade;
}

function buildCamposMudancaAcervo(categoriasCliente = []) {
  const cats = categoriasCliente.length > 0 ? categoriasCliente : ['Colecionador', 'Atirador', 'Caçador'];
  const acervoOpts = cats.map(v => `<option>${v}</option>`).join('');
  return `<div style="padding:0 20px 20px">
    <div class="form-grid">
      <div><label>Acervo Atual</label><input name="proc_acervoAtual" placeholder="Preenchido automaticamente..." readonly /></div>
      <div><label>Acervo de Destino</label><select name="proc_acervoDestino"><option value="">Selecione...</option>${acervoOpts}</select></div>
    </div>
    <div style="margin-top:20px">
      <div style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--border)">Dados Adicionais</div>
      <div class="form-grid">
        <div><label>Empresa/Órgão de Trabalho</label><input name="proc_empresaAdicional" /></div>
        <div><label>CNPJ/CPF</label><input name="proc_cnpjCpfAdicional" oninput="this.value=fmtCNPJouCPF(this.value)" maxlength="18" /></div>
        <div style="grid-column:span 2"><label>Endereço Comercial</label><input name="proc_endComercialAdicional" /></div>
        <div><label>Número</label><input name="proc_numComercialAdicional" /></div>
        <div><label>CEP</label><input name="proc_cepComercialAdicional" oninput="this.value=fmtCEP(this.value)" maxlength="9" /></div>
        <div><label>UF</label><input name="proc_ufComercialAdicional" maxlength="2" style="text-transform:uppercase" /></div>
        <div><label>Município</label><input name="proc_municipioComercialAdicional" /></div>
        <div><label>Bairro</label><input name="proc_bairroComercialAdicional" /></div>
      </div>
    </div>
  </div>`;
}

function buildCamposTransferencia(armasOpts) {
  const especieOpts = ['Pistola','Espingarda','Revólver','Carabina/Fuzil'].map(v=>`<option>${v}</option>`).join('');
  const acabOpts    = ['Oxidado','Aço Inox','Niquelado','Outros'].map(v=>`<option>${v}</option>`).join('');
  const funcOpts    = ['Repetição','Automático','Semiautomático','Outros'].map(v=>`<option>${v}</option>`).join('');
  const almOpts     = ['Raiada','Lisa'].map(v=>`<option>${v}</option>`).join('');
  const sentOpts    = ['Não tem','Direita','Esquerda'].map(v=>`<option>${v}</option>`).join('');
  const sexoOpts    = ['Masculino','Feminino'].map(v=>`<option>${v}</option>`).join('');
  const ecOpts      = ['Solteiro','Casado','Viúvo','Separado Jud.','Divorciado','União Estável','União Homoafetiva','Outros'].map(v=>`<option>${v}</option>`).join('');

  return `<div class="form-section"><div class="form-section-title">Transferência de Arma</div><div class="form-body">
    <div style="margin-bottom:16px">
      <label style="font-size:14px;font-weight:600;display:block;margin-bottom:8px">O cliente está vendendo a arma?</label>
      <div class="checkbox-group">
        <label class="checkbox-item"><input type="radio" name="proc_clienteVende" value="sim" onchange="onClienteVendeRadio(this.value)" /> Sim</label>
        <label class="checkbox-item"><input type="radio" name="proc_clienteVende" value="nao" onchange="onClienteVendeRadio(this.value)" /> Não</label>
      </div>
    </div>

    <div id="proc-vende" style="display:none">
      <div class="form-grid">
        <div><label>Arma (do cliente)</label><select name="proc_armaId"><option value="">Selecione...</option>${armasOpts}</select></div>
        <div><label>Acervo de Destino da Arma</label><select name="proc_acervoDestinoVenda"><option value="">Selecione...</option><option>Atirador</option><option>Caçador</option><option>Colecionador</option></select></div>
        <div><label>Nome do Comprador</label><input name="proc_nomeComprador" /></div>
        <div><label>CPF do Comprador</label><input name="proc_cpfComprador" oninput="this.value=fmtCPF(this.value)" maxlength="14" /></div>
        <div><label>RG — UF</label><input name="proc_rgUFComprador" /></div>
        <div><label>Número do CR</label><input name="proc_crComprador" /></div>
        <div style="grid-column:span 2">
          <label>Atividades Habilitadas no CR</label>
          <div class="checkbox-group" style="margin-top:6px">
            <label class="checkbox-item"><input type="checkbox" name="proc_habCacador" value="Caçador" /> Caçador</label>
            <label class="checkbox-item"><input type="checkbox" name="proc_habAtirador" value="Atirador" /> Atirador</label>
            <label class="checkbox-item"><input type="checkbox" name="proc_habColecionador" value="Colecionador" /> Colecionador</label>
          </div>
        </div>
        <div><label>Telefone</label><input name="proc_telefoneComprador" oninput="this.value=fmtCelular(this.value)" maxlength="15" /></div>
        <div><label>Nome do Pai</label><input name="proc_nomePaiComprador" /></div>
        <div><label>Nome da Mãe</label><input name="proc_nomeMaeComprador" /></div>
        <div><label>Sexo</label><select name="proc_sexoComprador"><option value="">Selecione...</option>${sexoOpts}</select></div>
        <div><label>Data de Nascimento</label><input type="date" name="proc_nascimentoComprador" /></div>
        <div><label>País de Nascimento</label><input name="proc_paisNascComprador" /></div>
        <div><label>UF de Nascimento</label><input name="proc_ufNascComprador" maxlength="2" style="text-transform:uppercase" /></div>
        <div><label>Município de Nascimento</label><input name="proc_municipioNascComprador" /></div>
        <div><label>Estado Civil</label><select name="proc_estadoCivilComprador"><option value="">Selecione...</option>${ecOpts}</select></div>
        <div><label>Profissão</label><input name="proc_profissaoComprador" /></div>
        <div><label>Empresa de Trabalho</label><input name="proc_empresaComprador" /></div>
        <div><label>CNPJ</label><input name="proc_cnpjComprador" oninput="this.value=fmtCNPJ(this.value)" maxlength="18" /></div>
        <div style="grid-column:span 2"><label>Endereço Comercial</label><input name="proc_endComercialComprador" /></div>
        <div><label>Número</label><input name="proc_numComercialComprador" /></div>
        <div><label>CEP</label><input name="proc_cepComercialComprador" oninput="this.value=fmtCEP(this.value)" maxlength="9" /></div>
        <div><label>UF</label><input name="proc_ufComercialComprador" maxlength="2" style="text-transform:uppercase" /></div>
        <div><label>Município</label><input name="proc_municipioComercialComprador" /></div>
        <div><label>Bairro</label><input name="proc_bairroComercialComprador" /></div>
      </div>
      <div style="margin-top:20px">
        <div style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--border)">Endereço Residencial do Comprador</div>
        <div class="form-grid">
          <div style="grid-column:span 2"><label>Logradouro</label><input name="proc_endResidComprador" /></div>
          <div><label>Número</label><input name="proc_numResidComprador" /></div>
          <div><label>Complemento</label><input name="proc_complResidComprador" /></div>
          <div><label>CEP</label><input name="proc_cepResidComprador" oninput="this.value=fmtCEP(this.value)" maxlength="9" /></div>
          <div><label>UF</label><input name="proc_ufResidComprador" maxlength="2" style="text-transform:uppercase" /></div>
          <div><label>Município</label><input name="proc_municipioResidComprador" /></div>
          <div><label>Bairro</label><input name="proc_bairroResidComprador" /></div>
        </div>
      </div>
    </div>

    <div id="proc-compra" style="display:none">
      <div style="margin-bottom:20px">
        <div style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--border)">Dados Da Arma</div>
        <div class="form-grid">
          <div><label>Acervo de Destino</label><select name="proc_acervoDestino"><option value="">Selecione...</option><option>Colecionador</option><option>Atirador</option><option>Caçador</option></select></div>
          <div><label>Espécie</label><select name="proc_especie"><option value="">Selecione...</option>${especieOpts}</select></div>
          <div><label>Calibre</label><input name="proc_calibre" /></div>
          <div><label>Marca</label><input name="proc_marcaArma" /></div>
          <div><label>Modelo</label><input name="proc_modeloArma" /></div>
          <div><label>N° Série</label><input name="proc_serieArma" /></div>
          <div><label>Cad. Sinarm</label><input name="proc_cadSinarm" /></div>
          <div><label>N° Registro</label><input name="proc_numRegistro" /></div>
          <div><label>País de Fabricação</label><input name="proc_paisFabricacao" /></div>
          <div><label>Capacidade de Tiros</label><input type="number" min="0" name="proc_capacidadeTiros" /></div>
          <div><label>N° de Canos</label><input type="number" min="0" name="proc_numeroCanos" /></div>
          <div><label>N° SIGMA</label><input name="proc_numSigma" /></div>
          <div><label>Alma</label><select name="proc_alma"><option value="">Selecione...</option>${almOpts}</select></div>
          <div><label>N° Raias</label><input type="number" min="0" name="proc_numRaias" /></div>
          <div><label>Sentido das Raias</label><select name="proc_sentidoRaias"><option value="">Selecione...</option>${sentOpts}</select></div>
          <div><label>Compr. do Cano (mm)</label><input type="number" min="0" name="proc_comprCano" /></div>
          <div><label>Acabamento</label><select name="proc_acabamento"><option value="">Selecione...</option>${acabOpts}</select></div>
          <div><label>Funcionamento</label><select name="proc_funcionamento"><option value="">Selecione...</option>${funcOpts}</select></div>
        </div>
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--border)">Dados do Vendedor</div>
        <div class="form-grid">
          <div style="grid-column:span 2"><label>Nome Completo</label><input name="proc_nomeVendedor" /></div>
          <div><label>CPF</label><input name="proc_cpfVendedor" oninput="this.value=fmtCPF(this.value)" maxlength="14" /></div>
          <div><label>RG</label><input name="proc_rgVendedor" /></div>
          <div><label>CR</label><input name="proc_crVendedor" /></div>
          <div style="grid-column:span 2">
            <label>Atividades Habilitadas no CR</label>
            <div class="checkbox-group" style="margin-top:6px">
              <label class="checkbox-item"><input type="checkbox" name="proc_habCacadorVend" value="Caçador" /> Caçador</label>
              <label class="checkbox-item"><input type="checkbox" name="proc_habAtiradorVend" value="Atirador" /> Atirador</label>
              <label class="checkbox-item"><input type="checkbox" name="proc_habColecionadorVend" value="Colecionador" /> Colecionador</label>
            </div>
          </div>
          <div><label>Telefone</label><input name="proc_telefoneVendedor" oninput="this.value=fmtCelular(this.value)" maxlength="15" /></div>
          <div style="grid-column:span 2"><label>E-mail</label><input name="proc_emailVendedor" type="email" /></div>
          <div style="grid-column:span 2"><label>Endereço Residencial</label><input name="proc_endVendedor" /></div>
          <div><label>N°</label><input name="proc_numVendedor" /></div>
          <div><label>CEP</label><input name="proc_cepVendedor" oninput="this.value=fmtCEP(this.value)" maxlength="9" /></div>
          <div><label>UF</label><input name="proc_ufVendedor" maxlength="2" style="text-transform:uppercase" /></div>
          <div><label>Município</label><input name="proc_municipioVendedor" /></div>
          <div><label>Bairro</label><input name="proc_bairroVendedor" /></div>
        </div>
      </div>
      <div style="margin-top:20px">
        <div style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--border)">Dados Adicionais</div>
        <div class="form-grid">
          <div><label>Empresa/Órgão de Trabalho</label><input name="proc_empresaAdicional" /></div>
          <div><label>CNPJ/CPF</label><input name="proc_cnpjCpfAdicional" oninput="this.value=fmtCNPJouCPF(this.value)" maxlength="18" /></div>
          <div style="grid-column:span 2"><label>Endereço Comercial</label><input name="proc_endComercialAdicional" /></div>
          <div><label>Número</label><input name="proc_numComercialAdicional" /></div>
          <div><label>CEP</label><input name="proc_cepComercialAdicional" oninput="this.value=fmtCEP(this.value)" maxlength="9" /></div>
          <div><label>UF</label><input name="proc_ufComercialAdicional" maxlength="2" style="text-transform:uppercase" /></div>
          <div><label>Município</label><input name="proc_municipioComercialAdicional" /></div>
          <div><label>Bairro</label><input name="proc_bairroComercialAdicional" /></div>
        </div>
      </div>
    </div>
  </div></div>`;
}

function onClienteVendeRadio(value) {
  document.getElementById('proc-vende').style.display  = value === 'sim' ? '' : 'none';
  document.getElementById('proc-compra').style.display = value === 'nao' ? '' : 'none';
}

function renderChecklistForm(items) {
  return items.map((item, i) => `
    <div class="checklist-item" id="cl-${i}">
      <input type="checkbox" id="clcheck-${i}" onchange="toggleChecklistFormItem(${i})" />
      <div class="checklist-nome">${esc(item.nome)}</div>
      <div class="checklist-obs"><input type="text" placeholder="Observação..." id="clobs-${i}" /></div>
    </div>`).join('');
}

function toggleChecklistFormItem(i) {
  const checked = document.getElementById(`clcheck-${i}`).checked;
  document.getElementById(`cl-${i}`).classList.toggle('done', checked);
}

function coletarChecklist(tipo, subTipo = null) {
  const items = buildChecklistItems(tipo, subTipo);
  return items.map((item, i) => {
    const check = document.getElementById(`clcheck-${i}`);
    const obs   = document.getElementById(`clobs-${i}`);
    return { nome: item.nome, concluido: check ? check.checked : false, observacao: obs ? obs.value : '' };
  });
}

function coletarDadosEspecificos(tipo) {
  const fd = new FormData(document.getElementById('form-processo'));
  const d = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith('proc_')) d[k.replace('proc_', '')] = v;
  }
  return d;
}

async function salvarProcesso(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const clienteId  = fd.get('ClienteId');
  const tipoProc   = fd.get('TipoProcesso');
  const tipoGuia   = fd.get('proc_tipoGuia') || null;
  const cliente    = await App.graph.getItem(CONFIG.listas.clientes, clienteId);

  const checklist  = coletarChecklist(tipoProc, tipoGuia);
  const dadosEsp   = coletarDadosEspecificos(tipoProc);

  const fields = {
    Title:                  `${tipoProc} — ${cliente.Title}`,
    ClienteId:              clienteId,
    ClienteNome:            cliente.Title,
    TipoProcesso:           tipoProc,
    Responsavel:            fd.get('Responsavel') || '',
    DataAbertura:           fd.get('DataAbertura') || null,
    DataPrazo:              fd.get('DataPrazo') || null,
    Status:                 fd.get('Status'),
    DataUltimaConferencia:  fd.get('DataUltimaConferencia') || null,
    ValorProcesso:          parseFloat(fd.get('ValorProcesso')) || null,
    TipoPagamento:          fd.get('TipoPagamento') || 'À vista',
    FormaPagamento:         fd.get('FormaPagamento') || '',
    DataPagamento:          fd.get('DataPagamento') || null,
    NumeroParcelas:         fd.get('NumeroParcelas') ? parseInt(fd.get('NumeroParcelas')) : null,
    ValorEntrada:           parseFloat(fd.get('ValorEntrada')) || null,
    ValorParcelas:          parseFloat(fd.get('ValorParcelas')) || null,
    DataVencimentoParcelas: fd.get('DataVencimentoParcelas') || null,
    Observacoes:            fd.get('Observacoes') || '',
    ChecklistJSON:          JSON.stringify(checklist),
    DadosEspecificosJSON:   JSON.stringify(dadosEsp),
  };

  showLoading();
  try {
    const created = await App.graph.createItem(CONFIG.listas.processos, fields);
    App.invalidateCache('processos');
    toast('Processo criado!', 'success');
    navigate('processos/detalhe', { id: created.id });
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

async function abrirCertidao(keyword) {
  const cfg = CERTIDOES_CONFIG.find(c => c.keyword === keyword);
  if (!cfg) return;
  const p = window._processoDetalhe;
  if (!p) return;
  showLoading();
  try {
    const c = await App.graph.getItem(CONFIG.listas.clientes, p.ClienteId);
    const data = {
      cpf:            c.CPF || '',
      nome:           c.Title || '',
      dataNascimento: c.DataNascimento ? c.DataNascimento.split('T')[0] : '',
      nomeMae:        c.NomeMae || '',
      nomePai:        c.NomePai || '',
      rg:             c.RG || '',
      orgaoEmissor:   c.OrgaoEmissor || '',
      ufRG:           c.UFDoc || '',
      endereco:       c.Endereco1 || '',
      numero:         c.Numero1 || '',
      complemento:    c.Complemento1 || '',
      bairro:         c.Bairro1 || '',
      cidade:         c.Cidade1 || '',
      uf:             c.UF1Endereco || '',
      cep:            c.CEP1 || '',
    };
    try { await navigator.clipboard.writeText(JSON.stringify(data)); } catch(e) {}
    window.open(cfg.url, '_blank');
    toast(`Dados de ${data.nome || data.cpf} copiados. Use o bookmarklet no site.`, 'info');
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

async function abrirGRU(tipo) {
  const p = window._processoDetalhe;
  if (!p) return;
  showLoading();
  try {
    const dados = p.DadosEspecificosJSON ? JSON.parse(p.DadosEspecificosJSON) : {};
    let cpf = '', nome = '';
    const numRef    = tipo === '88' ? '20371' : '20324';
    const valorPrin = tipo === '88' ? '8800'  : '5000';
    const eTransf = TIPOS_TRANSFERENCIA.includes(p.TipoProcesso);
    if (eTransf && dados.clienteVende === 'sim') {
      cpf  = dados.cpfComprador  || '';
      nome = dados.nomeComprador || '';
    } else {
      const c = window._clienteDetalhe || {};
      cpf  = c.CPF   || '';
      nome = c.Title || '';
    }
    const texto = `CPF: ${cpf}\nNome Contribuinte: ${nome}\nN° Referência: ${numRef}\nValor Principal: ${valorPrin}\n(Emitir no formato Boleto)`;
    try { await navigator.clipboard.writeText(texto); } catch(e) {}
    window.open('https://pagtesouro.tesouro.gov.br/portal-gru/#/pagamento-gru/formulario?servico=000835', '_blank');
    toast(`Dados copiados. Preencha: CPF ${cpf}, Ref ${numRef}, Valor R$ ${tipo === '88' ? '88,00' : '50,00'}.`, 'info');
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

function _dadosComprador(c, dados, usaComp) {
  if (usaComp) {
    return {
      nome: dados.nomeComprador||'', cpf: dados.cpfComprador||'',
      nat: dados.municipioNascComprador||'', ufNat: dados.ufNascComprador||'',
      dataNasc: dados.nascimentoComprador ? fmtDate(dados.nascimentoComprador) : '',
      profissao: dados.profissaoComprador||'',
      rg: (dados.rgUFComprador||'').split('/')[0]?.trim()||'',
      orgao: (dados.rgUFComprador||'').split('/')[1]?.trim()||'',
      ufRG: '',
      end: dados.endResidComprador || dados.endComercialComprador || '',
      num: dados.numResidComprador || dados.numComercialComprador || '',
      compl: dados.complResidComprador || '',
      bairro: dados.bairroResidComprador || dados.bairroComercialComprador || '',
      cidade: dados.municipioResidComprador || dados.municipioComercialComprador || '',
      uf: dados.ufResidComprador || dados.ufComercialComprador || '',
      cep: dados.cepResidComprador || dados.cepComercialComprador || '',
    };
  }
  return {
    nome: c.Title||'', cpf: c.CPF||'',
    nat: c.Naturalidade||'', ufNat: c.UFNaturalidade||'',
    dataNasc: c.DataNascimento ? fmtDate(c.DataNascimento) : '',
    profissao: c.Profissao||'',
    rg: c.RG||'', orgao: c.OrgaoEmissor||'', ufRG: c.UFDoc||'',
    end: c.Endereco1||'', num: c.Numero1||'', compl: c.Complemento1||'',
    bairro: c.Bairro1||'', cidade: c.Cidade1||'',
    uf: c.UF1Endereco||'', cep: c.CEP1||'',
  };
}

async function gerarAnexoC() {
  const p = window._processoDetalhe;
  if (!p) return;
  showLoading();
  try {
    const dados = p.DadosEspecificosJSON ? JSON.parse(p.DadosEspecificosJSON) : {};
    const eTransf  = TIPOS_TRANSFERENCIA.includes(p.TipoProcesso);
    const usaComp  = eTransf && dados.clienteVende === 'sim';
    const c = window._clienteDetalhe || {};
    const d = _dadosComprador(c, dados, usaComp);
    const endFmt = [d.end, d.num ? `n° ${d.num}` : '', d.compl, d.bairro, d.cidade, d.uf, d.cep ? `CEP ${d.cep}` : ''].filter(Boolean).join(', ');
    const hoje = new Date().toISOString().split('T')[0];
    const html = `
      <h2>DECLARAÇÃO DE INEXISTÊNCIA DE INQUÉRITOS POLICIAIS<br>OU PROCESSOS CRIMINAIS</h2>
      <p>Eu, <strong>${esc(d.nome)}</strong>, ${esc(usaComp ? 'Brasileiro(a)' : (c.Nacionalidade||''))}, ${esc(d.profissao)}, natural de
      ${esc(d.nat)}${d.ufNat ? '/' + esc(d.ufNat) : ''}, nascido em ${esc(d.dataNasc)}, com endereço em
      ${esc(endFmt)}, portador do RG ${esc(d.rg)}${d.orgao ? ' ' + esc(d.orgao) : ''}${d.ufRG ? '/' + esc(d.ufRG) : ''} e CPF nº ${esc(d.cpf)},
      declaro que não existem inquéritos policiais ou processos criminais em meu nome, tanto no estado de domicílio quanto nos demais entes federativos.</p>
      <p style="text-align:center;margin-top:48px">${esc(d.cidade)}${d.uf ? '/' + esc(d.uf) : ''}, ${dataPorExtenso(hoje)}</p>
      <div class="assinatura"><div class="assinatura-linha"></div><div><strong>${esc(d.nome)}</strong></div><div>REQUERENTE</div></div>`;
    imprimirDocumento(html, 'Anexo C — Declaração');
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

async function gerarDSA(usarComprador) {
  const p = window._processoDetalhe;
  if (!p) return;
  showLoading();
  try {
    const dados = p.DadosEspecificosJSON ? JSON.parse(p.DadosEspecificosJSON) : {};
    const eTransf  = TIPOS_TRANSFERENCIA.includes(p.TipoProcesso);
    const usaComp  = usarComprador && eTransf && dados.clienteVende === 'sim';
    const c = window._clienteDetalhe || {};
    const d = _dadosComprador(c, dados, usaComp);
    const categorias = usaComp
      ? [dados.habCacador, dados.habAtirador, dados.habColecionador].filter(Boolean).join(', ') || 'CAC'
      : (c.Categoria || 'CAC').split(',').map(s => s.trim()).join(', ');
    const endFmt = [d.end, d.num ? `n° ${d.num}` : '', d.compl, d.bairro, d.cidade, d.uf, d.cep ? `CEP ${d.cep}` : ''].filter(Boolean).join(', ');
    const hoje = new Date().toISOString().split('T')[0];
    const html = `
      <h2>DECLARAÇÃO DE SEGURANÇA DO ACERVO (DSA) — ENDEREÇO DE ACERVO</h2>
      <p>Eu, <strong>${esc(d.nome)}</strong>, ${esc(usaComp ? 'Brasileiro(a)' : (c.Nacionalidade||''))}, ${esc(d.profissao)}, natural de
      ${esc(d.nat)}${d.ufNat ? '/' + esc(d.ufNat) : ''}, nascido em ${esc(d.dataNasc)}, com endereço em
      ${esc(endFmt)}, portador do RG ${esc(d.rg)}${d.orgao ? ' ' + esc(d.orgao) : ''}${d.ufRG ? '/' + esc(d.ufRG) : ''} e CPF nº ${esc(d.cpf)},
      DECLARO, para fins de <strong>${esc(p.TipoProcesso)} NA POLÍCIA FEDERAL</strong> que o local de guarda do meu acervo de
      <strong>${esc(categorias)}</strong> possui cofre ou lugar seguro, com tranca, para armazenamento das armas de fogo desmuniciadas de que sou proprietário,
      e de que adotarei as medidas necessárias para impedir que menor de dezoito anos de idade ou pessoa civilmente incapaz se apodere de arma de fogo sob
      minha posse ou de minha propriedade, observado o disposto no art. 13 da Lei nº 10.826, de 2003.</p>
      <p style="text-align:center;margin-top:48px">${esc(d.cidade)}${d.uf ? '/' + esc(d.uf) : ''}, ${dataPorExtenso(hoje)}</p>
      <div class="assinatura"><div class="assinatura-linha"></div><div><strong>${esc(d.nome)}</strong></div><div>REQUERENTE</div></div>`;
    imprimirDocumento(html, 'DSA — Declaração de Segurança do Acervo');
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

async function gerarProcuracao() {
  const p = window._processoDetalhe;
  if (!p) return;
  showLoading();
  try {
    const dados = p.DadosEspecificosJSON ? JSON.parse(p.DadosEspecificosJSON) : {};
    const eTransf  = TIPOS_TRANSFERENCIA.includes(p.TipoProcesso);
    const usaComp  = eTransf && dados.clienteVende === 'sim';
    const c = window._clienteDetalhe || {};
    const d = _dadosComprador(c, dados, usaComp);
    const endFmt = [d.end, d.num ? `n° ${d.num}` : '', d.compl, d.bairro, d.cidade, d.uf, d.cep ? `CEP ${d.cep}` : ''].filter(Boolean).join(', ');
    const hoje = new Date().toISOString().split('T')[0];
    const html = `
      <h1>PROCURAÇÃO</h1>
      <p><strong>Outorgante</strong> Eu, <strong>${esc(d.nome)}</strong>, ${esc(usaComp ? 'Brasileiro(a)' : (c.Nacionalidade||''))}, ${esc(d.profissao)},
      natural de ${esc(d.nat)}${d.ufNat ? '/' + esc(d.ufNat) : ''}, nascido em ${esc(d.dataNasc)},
      com endereço em ${esc(endFmt)},
      portador do RG ${esc(d.rg)}${d.orgao ? ' ' + esc(d.orgao) : ''}${d.ufRG ? '/' + esc(d.ufRG) : ''} e CPF nº ${esc(d.cpf)}.</p>
      <p><strong>Outorgado:</strong> SIMONE BARP PEGORARO, brasileira, solteira, Contadora, portadora do RG 1085506374 SSP/RS
      e CPF de nº 018.699.740-00, com endereço comercial na rua Itararé, 18, sala 101, Petrópolis, Vacaria-RS, CEP 95211-101.</p>
      <p>Pelo presente instrumento particular de mandato a parte que assina, denominada outorgante, nomeia e constitui como procurador o outorgado
      acima qualificado, outorgando-lhe os poderes necessários para representá-lo junto aos seguintes órgãos: Comando da 3ª Região Militar e
      Polícia Federal-SINARM, em seu Serviço de Fiscalização de Produtos Controlados, para promoção da entrega dos documentos de solicitação de
      concessão de alteração, apostilamento em Certificado de Registro, da promoção e da entrega da concessão de guia de tráfego dos produtos
      controlados constantes dos acervos por esse órgão controlado, bem como a retirada dos despachos (e/ou documentos) referentes às concessões
      elencadas, exclusivamente, sendo vedado seu substabelecimento.</p>
      <p style="text-align:center;margin-top:48px">${esc(d.cidade)}${d.uf ? '/' + esc(d.uf) : ''}, ${dataPorExtenso(hoje)}</p>
      <div class="assinatura"><div class="assinatura-linha"></div><div><strong>${esc(d.nome)}</strong></div></div>`;
    imprimirDocumento(html, 'Procuração');
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

async function gerarRequerimento() {
  const p = window._processoDetalhe;
  if (!p) return;
  showLoading();
  try {
    const dados = p.DadosEspecificosJSON ? JSON.parse(p.DadosEspecificosJSON) : {};
    const isTransf  = TIPOS_TRANSFERENCIA.includes(p.TipoProcesso);
    const isMudanca = p.TipoProcesso === 'Mudança de Acervo';
    const c = window._clienteDetalhe || {};

    let t = 0, tOutros = '';
    if (p.TipoProcesso === 'Transferência de Arma SINARM x SIGMA')  t = 1;
    if (p.TipoProcesso === 'Transferência de Arma SINARM x SINARM') { t = 8; tOutros = p.TipoProcesso; }
    if (p.TipoProcesso === 'Transferência de Arma SIGMA x SINARM')  t = 6;
    if (p.TipoProcesso === 'Transferência de Arma SIGMA x SIGMA')   t = 4;
    if (isMudanca)                                                   t = 5;

    const clienteHabs = (c.Categoria||'').split(',').map(s=>s.trim()).filter(Boolean);
    let v = {}, cp = {}, vendHabs = [], compHabs = [], vendEmail = '', compEmail = '';

    if (isMudanca || (isTransf && dados.clienteVende === 'sim')) {
      v = { nome:c.Title||'', cpf:c.CPF||'',
        rg:`${c.RG||''}${c.OrgaoEmissor?' '+c.OrgaoEmissor:''}${c.UFDoc?'/'+c.UFDoc:''}`,
        cr:c.NumeroCR||'', telefone:c.Celular||'',
        end:c.Endereco1||'', num:c.Numero1||'', cep:c.CEP1||'',
        uf:c.UF1Endereco||'', municipio:c.Cidade1||'', bairro:c.Bairro1||'' };
      vendHabs = clienteHabs;
      vendEmail = c.Email||'';
    } else if (isTransf) {
      v = { nome:dados.nomeVendedor||'', cpf:dados.cpfVendedor||'',
        rg:dados.rgVendedor||'', cr:dados.crVendedor||'', telefone:dados.telefoneVendedor||'',
        end:dados.endVendedor||'', num:dados.numVendedor||'', cep:dados.cepVendedor||'',
        uf:dados.ufVendedor||'', municipio:dados.municipioVendedor||'', bairro:dados.bairroVendedor||'' };
      vendHabs = [dados.habCacadorVend, dados.habAtiradorVend, dados.habColecionadorVend].filter(Boolean);
      vendEmail = dados.emailVendedor||'';
    }

    if (isMudanca) {
      cp = { nome:c.Title||'', cpf:c.CPF||'',
        rgUF:`${c.RG||''}${c.OrgaoEmissor?' '+c.OrgaoEmissor:''}${c.UFDoc?'/'+c.UFDoc:''}`,
        cr:c.NumeroCR||'', telefone:c.Celular||'',
        nomePai:c.NomePai||'', nomeMae:c.NomeMae||'',
        sexo:c.Sexo||'', nascimento:c.DataNascimento?fmtDate(c.DataNascimento):'',
        paisNasc:'Brasil', ufNasc:c.UFNaturalidade||'', municipioNasc:c.Naturalidade||'',
        estadoCivil:c.EstadoCivil||'', profissao:c.Profissao||'',
        empresa:dados.empresaAdicional||'', cnpj:dados.cnpjCpfAdicional||'',
        endResid:c.Endereco1||'', numResid:c.Numero1||'',
        municipioResid:c.Cidade1||'', bairroResid:c.Bairro1||'',
        ufResid:c.UF1Endereco||'', cepResid:c.CEP1||'',
        endCom:dados.endComercialAdicional||'', numCom:dados.numComercialAdicional||'',
        municipioCom:dados.municipioComercialAdicional||'', bairroCom:dados.bairroComercialAdicional||'',
        ufCom:dados.ufComercialAdicional||'', cepCom:dados.cepComercialAdicional||'' };
      compHabs = clienteHabs;
      compEmail = c.Email||'';
    } else if (isTransf && dados.clienteVende === 'sim') {
      cp = { nome:dados.nomeComprador||'', cpf:dados.cpfComprador||'',
        rgUF:dados.rgUFComprador||'', cr:dados.crComprador||'', telefone:dados.telefoneComprador||'',
        nomePai:dados.nomePaiComprador||'', nomeMae:dados.nomeMaeComprador||'',
        sexo:dados.sexoComprador||'', nascimento:dados.nascimentoComprador?fmtDate(dados.nascimentoComprador):'',
        paisNasc:dados.paisNascComprador||'', ufNasc:dados.ufNascComprador||'', municipioNasc:dados.municipioNascComprador||'',
        estadoCivil:dados.estadoCivilComprador||'', profissao:dados.profissaoComprador||'',
        empresa:dados.empresaComprador||'', cnpj:dados.cnpjComprador||'',
        endResid:dados.endResidComprador||'', numResid:dados.numResidComprador||'',
        municipioResid:dados.municipioResidComprador||'', bairroResid:dados.bairroResidComprador||'',
        ufResid:dados.ufResidComprador||'', cepResid:dados.cepResidComprador||'',
        endCom:dados.endComercialComprador||'', numCom:dados.numComercialComprador||'',
        municipioCom:dados.municipioComercialComprador||'', bairroCom:dados.bairroComercialComprador||'',
        ufCom:dados.ufComercialComprador||'', cepCom:dados.cepComercialComprador||'' };
      compHabs = [dados.habCacador, dados.habAtirador, dados.habColecionador].filter(Boolean);
    } else if (isTransf) {
      cp = { nome:c.Title||'', cpf:c.CPF||'',
        rgUF:`${c.RG||''}${c.OrgaoEmissor?' '+c.OrgaoEmissor:''}${c.UFDoc?'/'+c.UFDoc:''}`,
        cr:c.NumeroCR||'', telefone:c.Celular||'',
        nomePai:c.NomePai||'', nomeMae:c.NomeMae||'',
        sexo:c.Sexo||'', nascimento:c.DataNascimento?fmtDate(c.DataNascimento):'',
        paisNasc:'Brasil', ufNasc:c.UFNaturalidade||'', municipioNasc:c.Naturalidade||'',
        estadoCivil:c.EstadoCivil||'', profissao:c.Profissao||'',
        empresa:dados.empresaAdicional||'', cnpj:dados.cnpjCpfAdicional||'',
        endResid:c.Endereco1||'', numResid:c.Numero1||'',
        municipioResid:c.Cidade1||'', bairroResid:c.Bairro1||'',
        ufResid:c.UF1Endereco||'', cepResid:c.CEP1||'',
        endCom:dados.endComercialAdicional||'', numCom:dados.numComercialAdicional||'',
        municipioCom:dados.municipioComercialAdicional||'', bairroCom:dados.bairroComercialAdicional||'',
        ufCom:dados.ufComercialAdicional||'', cepCom:dados.cepComercialAdicional||'' };
      compHabs = clienteHabs;
      compEmail = c.Email||'';
    }

    let arm = {};
    try {
      const armaIdRaw = (dados.armaId||'').split('|')[0];
      if (armaIdRaw && (isMudanca || dados.clienteVende === 'sim')) {
        const arma = await App.graph.getItem(CONFIG.listas.armas, armaIdRaw);
        arm = { acervoOrigem:arma.AtividadeCadastrada||'', especie:arma.Especie||'',
          calibre:arma.Calibre||'', marca:arma.Marca||'', modelo:arma.Modelo||'',
          serie:arma.NumeroSerie||'', cadSinarm:arma.NumeroSINARM||'',
          numReg:arma.NumeroRegistro||'', paisFab:arma.PaisFabricacao||'',
          capTiros:arma.CapacidadeTiro||'', numCanos:arma.NumeroCanos||'',
          numSigma:arma.NumeroSIGMA||'', alma:arma.AlmaCano||'',
          numRaias:arma.NumeroRaias||'', sentido:arma.SentidoRaias||'',
          comprCano:arma.ComprimentoCano||'', acabamento:arma.Acabamento||'', funcionamento:arma.Funcionamento||'' };
      } else if (isTransf) {
        arm = { acervoOrigem:'', especie:dados.especie||'', calibre:dados.calibre||'',
          marca:dados.marcaArma||'', modelo:dados.modeloArma||'',
          serie:dados.serieArma||'', cadSinarm:dados.cadSinarm||'',
          numReg:dados.numRegistro||'', paisFab:dados.paisFabricacao||'',
          capTiros:dados.capacidadeTiros||'', numCanos:dados.numeroCanos||'',
          numSigma:dados.numSigma||'', alma:dados.alma||'',
          numRaias:dados.numRaias||'', sentido:dados.sentidoRaias||'',
          comprCano:dados.comprCano||'', acabamento:dados.acabamento||'',
          funcionamento:dados.funcionamento||'' };
      }
    } catch(err) {}

    const acervoDestino = dados.acervoDestinoVenda || dados.acervoDestino || '';
    const hoje = new Date().toISOString().split('T')[0];
    const cidadeReq = v.municipio || c.Cidade1 || '';
    const ufReq = v.uf || c.UF1Endereco || '';
    const habsChk = (arr) => {
      return `${chk(arr.includes('Caçador'))} Caçador &nbsp;&nbsp; ${chk(arr.includes('Atirador'))} Atirador &nbsp;&nbsp; ${chk(arr.includes('Colecionador'))} Colecionador`;
    };
    const ecChk = (ec) => `1-Solteiro ${chk(ec==='Solteiro')} &nbsp; 3-Viúvo ${chk(ec==='Viúvo')} &nbsp; 5-Divorciado ${chk(ec==='Divorciado')} &nbsp; 7-União Homoafetiva ${chk(ec==='União Homoafetiva')}<br>
      2-Casado ${chk(ec==='Casado')} &nbsp; 4-Separado Jud. ${chk(ec==='Separado Jud.')} &nbsp; 6-União Estável ${chk(ec==='União Estável')} &nbsp; 8-Outros ${chk(ec==='Outros')}`;
    const ac = arm.acabamento||'';
    const fn = arm.funcionamento||'';
    const isSIGMAxSIGMA    = p.TipoProcesso === 'Transferência de Arma SIGMA x SIGMA';
    const isSINARMxSINARM  = p.TipoProcesso === 'Transferência de Arma SINARM x SINARM';

    const BRASAO = 'data:image/png;base64,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';
    const hdr = `<div style="text-align:center;margin-bottom:18px">
      <img src="${BRASAO}" alt="Brasão" style="height:80px;display:block;margin:0 auto 10px" onerror="this.style.display='none'">
      <strong style="font-size:11pt;line-height:1.7;display:block">SERVIÇO PÚBLICO FEDERAL<br>MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA<br>POLÍCIA FEDERAL</strong>
    </div>`;

    const html = `${hdr}
<h1>REQUERIMENTO PADRÃO DE TRANSFERÊNCIA – SINARM CAC</h1>

<table>
  <tr><td colspan="4" class="sec">1 – TIPO DE REQUERIMENTO</td></tr>
  <tr><td colspan="4" class="subsec">PEDIDO DE AUTORIZAÇÃO DE TRANSFERÊNCIA (solicitado pelo Alienante):</td></tr>
  <tr><td colspan="4"><strong>1 - ${chk(t===1)} AUTORIZAÇÃO</strong> para transferir arma de fogo do SINARM-CAC para SIGMA.</td></tr>
  <tr><td colspan="4"><strong>2 - ${chk(false)} AUTORIZAÇÃO</strong> para transferir arma de fogo do SINARM-CAC para SINARM-Defesa Pessoal.</td></tr>
  <tr><td colspan="4"><strong>3 - ${chk(false)} OUTROS</strong> (Especificar): </td></tr>
  <tr><td colspan="4" class="subsec">PEDIDO DE TRANSFERÊNCIA (solicitado pelo Adquirente):</td></tr>
  <tr><td colspan="4"><strong>4 - ${chk(t===4)} TRANSFERIR</strong> arma de fogo entre proprietários CACs distintos.</td></tr>
  <tr><td colspan="4"><strong>5 - ${chk(t===5)} TRANSFERIR</strong> arma de fogo entre acervos de mesmo proprietário¹.</td></tr>
  <tr><td colspan="4"><strong>6 - ${chk(t===6)} TRANSFERIR</strong> arma de fogo do SIGMA para o SINARM-CAC (autorização necessária).</td></tr>
  <tr><td colspan="4"><strong>7 - ${chk(false)} TRANSFERIR</strong> arma de fogo do SINARM-Defesa Pessoal para o SINARM-CAC (autorização necessária).</td></tr>
  <tr><td colspan="4"><strong>8 - ${chk(t===8)} OUTROS</strong> (Especificar): ${t===8?esc(tOutros):''}</td></tr>
</table>

<table>
  <tr><td colspan="3" class="sec">2 – DADOS DO VENDEDOR/DOADOR</td></tr>
  <tr><td colspan="3">Nome Completo/Razão Social: ${esc(v.nome)}</td></tr>
  <tr><td>CPF/CNPJ: ${esc(v.cpf)}</td><td>RG: ${esc(v.rg)}</td><td>CR: ${esc(v.cr)}</td></tr>
  <tr><td colspan="3">Atividades habilitadas no CR: &nbsp; ${chk(vendHabs.includes('Caçador'))} Caçador &nbsp;&nbsp;&nbsp; ${chk(vendHabs.includes('Atirador'))} Atirador &nbsp;&nbsp;&nbsp; ${chk(vendHabs.includes('Colecionador'))} Colecionador</td></tr>
  <tr><td colspan="2">E-mail: ${esc(vendEmail)}</td><td>Telefone: ${esc(v.telefone)}</td></tr>
  <tr><td colspan="2">Endereço Residencial: ${esc(v.end)} &nbsp;&nbsp; Nº: ${esc(v.num)}</td><td>CEP: ${esc(v.cep)}</td></tr>
  <tr><td>UF: ${esc(v.uf)}</td><td>Município: ${esc(v.municipio)}</td><td>Bairro: ${esc(v.bairro)}</td></tr>
</table>

<table>
  <tr><td colspan="4" class="sec">3 – DADOS DO COMPRADOR/RECEBEDOR</td></tr>
  <tr><td colspan="4">Nome Completo/Razão Social: ${esc(cp.nome)}</td></tr>
  <tr><td colspan="2">CPF/CNPJ: ${esc(cp.cpf)}</td><td>RG-UF: ${esc(cp.rgUF)}</td><td>CR: ${esc(cp.cr)}</td></tr>
  <tr><td colspan="4">Atividades habilitadas no CR: &nbsp; ${chk(compHabs.includes('Caçador'))} Caçador &nbsp;&nbsp;&nbsp; ${chk(compHabs.includes('Atirador'))} Atirador &nbsp;&nbsp;&nbsp; ${chk(compHabs.includes('Colecionador'))} Colecionador</td></tr>
  <tr><td colspan="2">E-mail: ${esc(compEmail)}</td><td colspan="2">Telefone: ${esc(cp.telefone)}</td></tr>
  <tr><td colspan="4"><table class="inner"><tr>
    <td class="lbl">Categoria:</td>
    <td>1 ${chk(true)} Cidadão<br>3 ${chk(false)} Militar (Federal ou Estadual)<br>4 ${chk(false)} Forças Policiais Civis (Federal ou Estadual)</td>
    <td>5 ${chk(false)} Guarda Municipal<br>6 ${chk(false)} Membro do Judiciário ou MP<br>7 ${chk(false)} Outros (especificar):</td>
  </tr></table></td></tr>
  <tr><td colspan="2">Nome do Pai: ${esc(cp.nomePai)}</td><td colspan="2">Nome da Mãe: ${esc(cp.nomeMae)}</td></tr>
  <tr><td colspan="2">Sexo: ${esc(cp.sexo)}</td><td colspan="2">Data de nascimento: ${esc(cp.nascimento)}</td></tr>
  <tr><td>País de Nascimento: ${esc(cp.paisNasc)}</td><td>UF de Nasc.: ${esc(cp.ufNasc)}</td><td colspan="2">Município Nasc.: ${esc(cp.municipioNasc)}</td></tr>
  <tr><td colspan="4">Estado Civil: ${ecChk(cp.estadoCivil)}</td></tr>
</table>

<div style="page-break-before:always"></div>
${hdr}

<table>
  <tr><td colspan="4">Profissão: ${esc(cp.profissao)}</td><td>Telefone comercial: ******</td></tr>
  <tr><td colspan="3">Empresa/Órgão de Trabalho: ${esc(cp.empresa)}</td><td colspan="2">CNPJ: ${esc(cp.cnpj)}</td></tr>
  <tr><td colspan="3">Endereço Comercial: ${esc(cp.endCom)} &nbsp;&nbsp; Nº: ${esc(cp.numCom)}</td><td colspan="2">CEP: ${esc(cp.cepCom)}</td></tr>
  <tr><td>UF: ${esc(cp.ufCom)}</td><td colspan="2">Município: ${esc(cp.municipioCom)}</td><td colspan="2">Bairro: ${esc(cp.bairroCom)}</td></tr>
</table>

<table>
  <tr><td colspan="4" class="sec">4 – DADOS DA ARMA</td></tr>
  <tr><td colspan="2">Acervo de Origem: ${esc(arm.acervoOrigem)}</td><td colspan="2">Acervo de Destino: ${esc(acervoDestino)}</td></tr>
  <tr><td>Espécie: ${esc(arm.especie)}</td><td>Calibre: ${esc(arm.calibre)}</td><td>Marca: ${esc(arm.marca)}</td><td>Modelo: ${esc(arm.modelo)}</td></tr>
  <tr><td colspan="2">Número de Série: ${esc(arm.serie)}</td>${!isSIGMAxSIGMA ? `<td>Cad. Sinarm: ${esc(arm.cadSinarm)}</td><td>Nº Registro: ${esc(arm.numReg)}</td>` : `<td colspan="2">&nbsp;</td>`}</tr>
  <tr><td colspan="2">País de Fabricação: ${esc(arm.paisFab)}</td><td>Capacidade de Tiros: ${esc(arm.capTiros)}</td><td>Nº Canos: ${esc(arm.numCanos)}</td></tr>
  <tr>${!isSINARMxSINARM ? `<td colspan="2">Nº SIGMA (se houver): ${esc(arm.numSigma)}</td>` : `<td colspan="2">&nbsp;</td>`}<td>Espécie: ${esc(arm.especie)}</td><td>Marca: ${esc(arm.marca)}</td></tr>
  <tr>
    <td colspan="2">Alma: ${chk(arm.alma==='Raiada')} Raiada &nbsp;&nbsp; ${chk(arm.alma==='Lisa')} Lisa</td>
    <td>Nº de Raias: ${esc(arm.numRaias)}</td>
    <td>Sentido: ${chk(arm.sentido==='Direita')} Direita &nbsp;&nbsp; ${chk(arm.sentido==='Esquerda')} Esquerda</td>
  </tr>
  <tr>
    <td colspan="2">Compr. do Cano (mm): ${esc(arm.comprCano)}</td>
    <td colspan="2">Acabamento: 1 - ${chk(ac==='Oxidado')} Oxidado &nbsp;&nbsp; 2 - ${chk(ac==='Aço Inox')} Aço Inox<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3 - ${chk(ac==='Niquelado')} Niquelado &nbsp;&nbsp; 4 - ${chk(ac==='Outros')} Outros</td>
  </tr>
  <tr>
    <td colspan="4">Funcionamento: 1 - ${chk(fn==='Repetição')} Repetição &nbsp;&nbsp; 2 - ${chk(fn==='Automático')} Automático &nbsp;&nbsp; 3 - ${chk(fn==='Semiautomático'||fn==='Semi-Automático')} Semiautomático &nbsp;&nbsp; 4 - ${chk(fn==='Outros')} Outros</td>
  </tr>
</table>

<table>
  <tr><td class="sec">5 – TERMOS DE ACEITE DE TRANSFERÊNCIA</td></tr>
  <tr><td>( X ) O adquirente e o alienante manifestam sua anuência à transferência da arma descrita neste requerimento.<br>
  ( X ) Declaro serem verdadeiras as informações consignadas neste formulário.</td></tr>
  <tr><td style="text-align:center;padding:12px 0 50px">${esc(cidadeReq)}${ufReq?'/'+esc(ufReq):''}, ${dataPorExtenso(hoje)}</td></tr>
  <tr><td>
    <div style="display:flex;justify-content:space-around;padding:0 60px;margin-bottom:16px">
      <div style="text-align:center;min-width:220px">
        <div style="border-top:1px solid #000;margin-bottom:5px"></div>
        <strong>ALIENANTE:</strong><br>${esc(v.nome)}
      </div>
      <div style="text-align:center;min-width:220px">
        <div style="border-top:1px solid #000;margin-bottom:5px"></div>
        <strong>ADQUIRENTE:</strong><br>${esc(cp.nome)}
      </div>
    </div>
  </td></tr>
</table>

<table>
  <tr><td class="sec">6 - TERMO DE RESPONSABILIDADE (ADQUIRENTE)</td></tr>
  <tr><td>( X )Declaro que não estou respondendo a inquérito policial ou a processo criminal.</td></tr>
  <tr><td style="text-align:center;padding:12px 0 50px">${esc(cidadeReq)}${ufReq?'/'+esc(ufReq):''}, ${dataPorExtenso(hoje)}</td></tr>
  <tr><td style="text-align:center;padding-bottom:16px">
    <div style="border-top:1px solid #000;width:300px;margin:0 auto 5px"></div>
    <strong>ADQUIRENTE:</strong><br>${esc(cp.nome)}
  </td></tr>
</table>

<p class="nota">1 – No caso de utilização de assinatura eletrônica (SOU GOV avançada/qualificada ou outra com reconhecimento ICP-Brasil), o formulário deve ser enviado separadamente, para que as assinaturas não sejam corrompidas. 2 – Pedidos de transferência para o SINARM-CAC advindo de outros sistemas devem ser instruídos com autorização emitida pelo PF, no caso de arma cadastrada no SINARM-Defesa Pessoal, ou Exército, no caso de arma cadastrada no SIGMA.</p>`;

    const wr = window.open('', '_blank', 'width=900,height=700');
    wr.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Requerimento de Transferência</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:10pt;margin:2cm 2.5cm;line-height:1.4}
        h1{text-align:center;font-size:12pt;text-decoration:underline;font-weight:bold;margin:20px 0 16px}
        table{border-collapse:collapse;width:100%;font-size:10pt;margin-bottom:5px}
        td,th{border:1px solid #000;padding:3px 6px;vertical-align:top}
        .sec{background:#d9d9d9;font-weight:bold;font-size:10pt;padding:4px 8px}
        .subsec{background:#f2f2f2;text-align:center;font-size:10pt;padding:3px 6px}
        table.inner{border:none;margin:0;width:100%}
        table.inner td{border:none;padding:1px 4px;vertical-align:top}
        table.inner td.lbl{font-weight:bold;white-space:nowrap;padding-right:8px}
        .nota{font-size:8.5pt;text-align:justify;margin-top:10px;line-height:1.3}
        @media print{body{margin:1.5cm 2cm}}
      </style>
    </head><body>${html}</body></html>`);
    wr.document.close();
    setTimeout(() => wr.print(), 600);
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

// ============================================================
// PROCESSOS — DETALHE
// ============================================================
async function renderProcessoDetalhe(id) {
  document.getElementById('page-title').textContent = 'Detalhe do Processo';
  const processo = await App.graph.getItem(CONFIG.listas.processos, id);
  const checklist = JSON.parse(processo.ChecklistJSON || '[]');

  let _clienteDetalhe = {};
  let _clubeDetalhe = null;
  try {
    _clienteDetalhe = await App.graph.getItem(CONFIG.listas.clientes, processo.ClienteId);
    if (_clienteDetalhe.ClubeId) {
      try { _clubeDetalhe = await App.graph.getItem(CONFIG.listas.clubes, _clienteDetalhe.ClubeId); } catch(e) {}
    }
  } catch(e) {}
  const dadosEsp  = JSON.parse(processo.DadosEspecificosJSON || '{}');
  const b = statusBadge(processo.Status);

  const progTotal    = checklist.length;
  const progConcluido = checklist.filter(i => i.concluido).length;
  const progPct = progTotal ? Math.round(progConcluido / progTotal * 100) : 0;
  const temCertidoes = checklist.some(item => CERTIDOES_CONFIG.some(c => item.nome.includes(c.keyword)));

  const statusOpts = STATUS_PROCESSO
    .map(s => `<option value="${s}" ${processo.Status===s?'selected':''}>${s}</option>`).join('');

  const celular = (processo.ClienteNome ? '' : '');

  document.getElementById('page-content').innerHTML = `
    <div class="card" style="margin-bottom:20px">
      <div class="card-body" style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px">
        <div>
          <div style="font-size:18px;font-weight:700;margin-bottom:4px">${esc(processo.TipoProcesso||'—')}${processo.Restituido ? ' <span style="background:#9333ea;color:#fff;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;vertical-align:middle"><i class="bi bi-arrow-return-left"></i> Restituído</span>' : ''}</div>
          ${processo.Responsavel ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px"><i class="bi bi-person-check me-1"></i>Responsável: <strong style="color:#1f2937">${esc(processo.Responsavel)}</strong></div>` : ''}
          <div style="color:var(--text-muted);font-size:13px">
            <strong>${esc(processo.ClienteNome||'—')}</strong>
            &nbsp;·&nbsp; Protocolo: ${esc(processo.NumeroProtocolo||'—')}
            &nbsp;·&nbsp; Abertura: ${fmtDate(processo.DataAbertura?processo.DataAbertura.split('T')[0]:'')}
            ${processo.DataPrazo ? `&nbsp;·&nbsp; Prazo: ${fmtDate(processo.DataPrazo.split('T')[0])}` : ''}
          </div>
        </div>
        <div class="btn-group">
          <a class="btn btn-outline btn-sm" onclick="navigate('clientes/perfil',{id:'${processo.ClienteId}',tab:'processos'})"><i class="bi bi-person"></i> Ver Cliente</a>
          <a class="btn btn-outline btn-sm" onclick="navigate('processos/editar',{id:'${id}'})"><i class="bi bi-pencil"></i> Editar</a>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 340px;gap:20px;align-items:start">
      <div>
        ${checklist.length > 0 ? `
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <h3><i class="bi bi-list-check me-2"></i>Checklist</h3>
            ${temCertidoes ? `<button class="btn btn-sm" onclick="togglePainelCertidoes()" title="Instalar bookmarklet de certidões" style="background:#b45309;color:#fff;border-color:#b45309"><i class="bi bi-bookmark-plus me-1"></i>Certidões</button>` : ''}
          </div>
          ${temCertidoes ? `<div id="painel-certidoes" style="display:none;border-top:1px solid var(--border)"></div>` : ''}
          <div class="card-body">
            <div class="checklist-progress">
              <div class="progress-bar-wrap"><div class="progress-bar" style="width:${progPct}%"></div></div>
              <span class="progress-text">${progConcluido}/${progTotal}</span>
            </div>
            ${checklist.map((item, i) => {
              const certCfg = CERTIDOES_CONFIG.find(c => item.nome.includes(c.keyword));
              const temFiliacao    = item.nome.includes('Declaração de Filiação');
              const temHabitualidade = item.nome.includes('Declaração de Habitualidade');
              const temCTF         = item.nome.includes('CTF');
              const temGRU88       = item.nome.includes('GRU R$88');
              const temGRU50       = item.nome.includes('GRU R$50');
              const temAnexoC      = item.nome === 'Anexo C';
              const temDSA         = item.nome === 'DSA';
              const temDSA1End     = item.nome.includes('DSA 1°');
              const temProcuracao  = item.nome === 'Procuração';
              const temReq         = item.nome === 'Requerimento';
              const btnStyle       = 'class="btn btn-ghost btn-xs" style="font-size:11px;padding:1px 7px;height:auto;white-space:nowrap"';
              return `
              <div class="checklist-item ${item.concluido?'done':''}" id="clp-${i}">
                <input type="checkbox" ${item.concluido?'checked':''} onchange="atualizarChecklistItem('${id}',${i},this.checked,document.getElementById('clpobs-${i}').value)" />
                <div class="checklist-nome" style="display:flex;align-items:center;gap:6px">
                  <span>${esc(item.nome)}</span>
                  ${certCfg      ? `<button onclick="abrirCertidao('${certCfg.keyword}')" ${btnStyle} title="Abrir site e copiar dados"><i class="bi bi-box-arrow-up-right"></i> Emitir</button>` : ''}
                  ${temFiliacao  ? `<button onclick="solicitarDeclaracao('filiacao')" ${btnStyle} title="Solicitar via WhatsApp do Clube"><i class="bi bi-whatsapp"></i> Solicitar</button>` : ''}
                  ${temHabitualidade ? `<button onclick="solicitarDeclaracao('habitualidade')" ${btnStyle} title="Solicitar via WhatsApp do Clube"><i class="bi bi-whatsapp"></i> Solicitar</button>` : ''}
                  ${temCTF       ? `<button onclick="window.open('https://servicos.ibama.gov.br/ctf/sistema.php','_blank')" ${btnStyle} title="Abrir site do IBAMA"><i class="bi bi-box-arrow-up-right"></i> Abrir site</button>` : ''}
                  ${temGRU88     ? `<button onclick="abrirGRU('88')" ${btnStyle} title="Copiar dados e abrir pagtesouro.gov.br"><i class="bi bi-receipt"></i> Gerar GRU</button>` : ''}
                  ${temGRU50     ? `<button onclick="abrirGRU('50')" ${btnStyle} title="Copiar dados e abrir pagtesouro.gov.br"><i class="bi bi-receipt"></i> Gerar GRU</button>` : ''}
                  ${temAnexoC    ? `<button onclick="gerarAnexoC()" ${btnStyle} title="Gerar Anexo C preenchido"><i class="bi bi-file-earmark-text"></i> Gerar PDF</button>` : ''}
                  ${temDSA       ? `<button onclick="gerarDSA(false)" ${btnStyle} title="Gerar DSA preenchido"><i class="bi bi-file-earmark-text"></i> Gerar PDF</button>` : ''}
                  ${temDSA1End   ? `<button onclick="gerarDSA(true)" ${btnStyle} title="Gerar DSA 1° Endereço preenchido"><i class="bi bi-file-earmark-text"></i> Gerar PDF</button>` : ''}
                  ${temProcuracao? `<button onclick="gerarProcuracao()" ${btnStyle} title="Gerar Procuração preenchida"><i class="bi bi-file-earmark-text"></i> Gerar PDF</button>` : ''}
                  ${temReq       ? `<button onclick="gerarRequerimento()" ${btnStyle} title="Gerar Requerimento preenchido"><i class="bi bi-file-earmark-text"></i> Gerar PDF</button>` : ''}
                </div>
                <div class="checklist-obs"><input type="text" id="clpobs-${i}" value="${esc(item.observacao||'')}" placeholder="Observação..." onblur="atualizarChecklistItem('${id}',${i},document.querySelector('#clp-${i} input[type=checkbox]').checked,this.value)" /></div>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}

        ${Object.keys(dadosEsp).length > 0 ? `
        <div class="card">
          <div class="card-header"><h3><i class="bi bi-info-circle me-2"></i>Dados do Processo</h3></div>
          <div class="card-body">
            <div class="info-grid">
              ${Object.entries(dadosEsp).filter(([,v]) => v).map(([k,v]) => {
                let displayV = v;
                if (k === 'armaId' && v && v.includes('|')) {
                  const parts = v.split('|');
                  displayV = parts.length >= 4 ? `${parts[2]} ${parts[3]}`.trim() : (parts[2] || v);
                }
                const label = k === 'armaId' ? 'Arma' : esc(k.replace(/([A-Z])/g,' $1').trim());
                return `<div class="info-item"><label>${label}</label><div class="value">${esc(displayV)}</div></div>`;
              }).join('')}
            </div>
          </div>
        </div>` : ''}

        <div id="dados-pagamento-wrapper">${renderDadosPagamento(processo)}</div>

      </div>

      <div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><h3><i class="bi bi-arrow-repeat me-2"></i>Status</h3></div>
          <div class="card-body">
            <label>Status Atual</label>
            <select id="sel-status" onchange="atualizarStatus('${id}',this.value)" style="margin-bottom:8px">
              ${statusOpts}
            </select>
            <span class="badge ${b.cls}" style="font-size:13px">${b.txt}</span>
            <div style="margin-top:12px">
              <label class="checkbox-item" style="font-size:13px;font-weight:600">
                <input type="checkbox" id="chk-gru-paga" ${processo.GruPaga ? 'checked' : ''} onchange="onGruPagaChange('${id}',this.checked)" />
                GRU Paga
              </label>
              <div id="campo-gru-data-pag" style="display:${processo.GruPaga ? '' : 'none'};margin-top:8px">
                <label style="font-size:12px">Data de Pagamento GRU</label>
                <input type="date" id="input-gru-data" value="${processo.DataPagamentoGRU ? processo.DataPagamentoGRU.split('T')[0] : ''}" style="margin-top:4px" onchange="salvarGRU('${id}',this.value)" />
              </div>
            </div>
            ${processo.Restituido ? `<div style="margin-top:12px;padding:12px;background:#fdf4ff;border:1px solid #d8b4fe;border-radius:8px">
              <div style="font-size:12px;font-weight:700;color:#9333ea;margin-bottom:8px"><i class="bi bi-arrow-return-left me-1"></i>Processo Restituído</div>
              <form onsubmit="salvarMotivoRestituicao(event,'${id}')">
                <label style="font-size:12px">Motivo</label>
                <textarea name="MotivoRestituicao" rows="2" style="margin-top:4px;border-color:#d8b4fe;font-size:13px" placeholder="Motivo da restituição...">${esc(processo.MotivoRestituicao||'')}</textarea>
                <button type="submit" class="btn btn-sm" style="margin-top:6px;border:1px solid #9333ea;color:#9333ea;background:transparent;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:12px"><i class="bi bi-floppy"></i> Salvar Motivo</button>
              </form>
            </div>` : ''}
            <div style="margin-top:${processo.Restituido?'8':'16'}px">
              <button class="btn btn-whatsapp" style="width:100%" onclick="abrirWhatsApp('${id}')">
                <i class="bi bi-whatsapp"></i> Avisar Cliente via WhatsApp
              </button>
            </div>
            <div style="margin-top:8px">
              <button onclick="restituirProcesso('${id}')" style="background:#9333ea;color:#fff;border:none;width:100%;border-radius:6px;padding:8px 12px;cursor:pointer;font-size:13px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:6px">
                <i class="bi bi-arrow-return-left"></i> Restituído
              </button>
            </div>
            <div style="margin-top:8px">
              <button onclick="registrarStatusHistorico('${id}')" style="background:#ea580c;color:#fff;border:none;width:100%;border-radius:6px;padding:8px 12px;cursor:pointer;font-size:13px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:6px">
                <i class="bi bi-clock-history"></i> Registrar Status do Processo
              </button>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:16px">
          <div class="card-header"><h3><i class="bi bi-calendar3 me-2"></i>Datas</h3></div>
          <div class="card-body">
            <form onsubmit="salvarDatasProcesso(event,'${id}')">
              <label>Protocolo no Sistema</label>
              <input type="date" name="DataProtocoloSistema" value="${processo.DataProtocoloSistema?processo.DataProtocoloSistema.split('T')[0]:''}" style="margin-bottom:14px" />
              <button type="submit" class="btn btn-outline" style="width:100%"><i class="bi bi-floppy"></i> Salvar Datas</button>
            </form>
          </div>
        </div>

        <div class="card" style="margin-top:16px">
          <div class="card-header"><h3><i class="bi bi-clock-history me-2"></i>Histórico de Status</h3></div>
          <div class="card-body" id="historico-status-body" style="padding-top:4px">
            ${renderHistoricoStatus(JSON.parse(processo.HistoricoStatus || '[]'))}
          </div>
        </div>

        ${processo.Observacoes ? `
        <div class="card" style="margin-top:16px">
          <div class="card-header"><h3><i class="bi bi-chat-text me-2"></i>Observações</h3></div>
          <div class="card-body"><p style="margin:0;font-size:13px;white-space:pre-wrap">${esc(processo.Observacoes)}</p></div>
        </div>` : ''}
      </div>
    </div>`;

  window._processoDetalhe = processo;
  window._clienteDetalhe  = _clienteDetalhe;
  window._clubeDetalhe    = _clubeDetalhe;
}

async function atualizarStatus(id, novoStatus) {
  showLoading();
  try {
    await App.graph.updateItem(CONFIG.listas.processos, id, { Status: novoStatus });
    App.invalidateCache('processos');
    const b = statusBadge(novoStatus);
    document.querySelector(`#page-content .badge`).className = `badge ${b.cls}`;
    document.querySelector(`#page-content .badge`).textContent = b.txt;
    toast('Status atualizado!', 'success');
    window._processoDetalhe.Status = novoStatus;
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

async function atualizarChecklistItem(processoId, index, concluido, observacao) {
  try {
    const processo = await App.graph.getItem(CONFIG.listas.processos, processoId);
    const checklist = JSON.parse(processo.ChecklistJSON || '[]');
    if (!checklist[index]) return;
    checklist[index].concluido  = concluido;
    checklist[index].observacao = observacao;
    await App.graph.updateItem(CONFIG.listas.processos, processoId, { ChecklistJSON: JSON.stringify(checklist) });
    const row = document.getElementById(`clp-${index}`);
    if (row) row.classList.toggle('done', concluido);
    const concluidos = checklist.filter(i => i.concluido).length;
    const pct = checklist.length ? Math.round(concluidos / checklist.length * 100) : 0;
    const bar = document.querySelector('.progress-bar');
    const txt = document.querySelector('.progress-text');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = `${concluidos}/${checklist.length}`;
    App.invalidateCache('processos');
  } catch(e) { toast(e.message, 'error'); }
}

async function salvarDatasProcesso(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  showLoading();
  try {
    await App.graph.updateItem(CONFIG.listas.processos, id, {
      DataProtocoloSistema: fd.get('DataProtocoloSistema') || null,
    });
    App.invalidateCache('processos');
    toast('Datas salvas!', 'success');
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

async function salvarPagamento(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  showLoading();
  try {
    await App.graph.updateItem(CONFIG.listas.processos, id, {
      ValorProcesso:          parseFloat(fd.get('ValorProcesso')) || null,
      TipoPagamento:          fd.get('TipoPagamento') || 'À vista',
      FormaPagamento:         fd.get('FormaPagamento') || '',
      DataPagamento:          fd.get('DataPagamento') || null,
      NumeroParcelas:         fd.get('NumeroParcelas') ? parseInt(fd.get('NumeroParcelas')) : null,
      ValorEntrada:           parseFloat(fd.get('ValorEntrada')) || null,
      ValorParcelas:          parseFloat(fd.get('ValorParcelas')) || null,
      DataVencimentoParcelas: fd.get('DataVencimentoParcelas') || null,
    });
    App.invalidateCache('processos');
    const updatedProc = await App.graph.getItem(CONFIG.listas.processos, id);
    const wrapper = document.getElementById('dados-pagamento-wrapper');
    if (wrapper) wrapper.innerHTML = renderDadosPagamento(updatedProc);
    toast('Pagamento salvo!', 'success');
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

async function abrirWhatsApp(processoId) {
  const p = window._processoDetalhe;
  if (!p) return;
  const cliente = await App.graph.getItem(CONFIG.listas.clientes, p.ClienteId);
  const celular = (cliente.Celular || '').replace(/\D/g, '');
  if (!celular) { toast('Cliente sem número de celular cadastrado.', 'warning'); return; }

  const status = p.Status || '';
  const msg = `Olá, ${cliente.Title}!\n\nInformamos que seu processo de *${p.TipoProcesso}* (Protocolo: ${p.NumeroProtocolo || 'N/A'}) teve seu status atualizado para: *${status}*.\n\nEm caso de dúvidas, entre em contato conosco.\n\n${CONFIG.nomeEscritorio}`;
  window.open(`https://wa.me/55${celular}?text=${encodeURIComponent(msg)}`, '_blank');
}

function solicitarDeclaracao(tipo) {
  const cliente = window._clienteDetalhe;
  const clube   = window._clubeDetalhe;
  if (!clube || !clube.Whatsapp) {
    toast('Cliente sem clube de tiro cadastrado ou clube sem WhatsApp informado.', 'warning');
    return;
  }
  const celular = (clube.Whatsapp || '').replace(/\D/g, '');
  if (!celular) { toast('Clube de Tiro sem número de WhatsApp cadastrado.', 'warning'); return; }
  const nome  = cliente?.Title || '—';
  const cpf   = cliente?.CPF   || '—';
  const decl  = tipo === 'filiacao' ? 'Filiação' : 'Habitualidade';
  const msg   = `Solicito por gentileza a Declaração de ${decl} do ${nome}, ${cpf}`;
  window.open(`https://wa.me/55${celular}?text=${encodeURIComponent(msg)}`, '_blank');
}

async function restituirProcesso(id) {
  if (!confirm('Confirmar que este processo foi restituído?')) return;
  showLoading();
  try {
    await App.graph.updateItem(CONFIG.listas.processos, id, { Restituido: true });
    App.invalidateCache('processos');
    toast('Processo marcado como restituído.', 'success');
    await renderProcessoDetalhe(id);
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

async function salvarMotivoRestituicao(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const motivo = fd.get('MotivoRestituicao') || '';
  showLoading();
  try {
    const proc = await App.graph.getItem(CONFIG.listas.processos, id);
    const historico = JSON.parse(proc.HistoricoStatus || '[]');
    const agora = new Date();
    historico.push({
      data:    agora.toLocaleDateString('pt-BR'),
      hora:    agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      status:  proc.Status || '',
      usuario: App.account?.name || App.account?.username || 'Desconhecido',
      motivo
    });
    await App.graph.updateItem(CONFIG.listas.processos, id, {
      MotivoRestituicao: motivo,
      HistoricoStatus:   JSON.stringify(historico)
    });
    App.invalidateCache('processos');
    const body = document.getElementById('historico-status-body');
    if (body) body.innerHTML = renderHistoricoStatus(historico);
    toast('Motivo salvo!', 'success');
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

function renderHistoricoStatus(historico) {
  if (!historico.length) return '<p style="color:var(--text-muted);font-style:italic;font-size:13px;margin:0">Nenhum registro ainda.</p>';
  return historico.slice().reverse().map(h => `
    <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:2px">
        <strong style="color:#1f2937">${esc(h.status||'—')}</strong>
        <span style="color:var(--text-muted)">${esc(h.data||'')} ${esc(h.hora||'')}</span>
      </div>
      <div style="color:var(--text-muted)"><i class="bi bi-person me-1"></i>${esc(h.usuario||'—')}</div>
      ${h.motivo ? `<div style="margin-top:4px;color:#9333ea;font-size:11px"><i class="bi bi-arrow-return-left me-1"></i>Motivo: ${esc(h.motivo)}</div>` : ''}
    </div>`).join('');
}

async function registrarStatusHistorico(id) {
  showLoading();
  try {
    const proc = await App.graph.getItem(CONFIG.listas.processos, id);
    const historico = JSON.parse(proc.HistoricoStatus || '[]');
    const agora = new Date();
    const status = document.getElementById('sel-status')?.value || proc.Status || '';
    historico.push({
      data:    agora.toLocaleDateString('pt-BR'),
      hora:    agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      status,
      usuario: App.account?.name || App.account?.username || 'Desconhecido'
    });
    await App.graph.updateItem(CONFIG.listas.processos, id, { HistoricoStatus: JSON.stringify(historico) });
    App.invalidateCache('processos');
    const body = document.getElementById('historico-status-body');
    if (body) body.innerHTML = renderHistoricoStatus(historico);
    toast('Status registrado no histórico!', 'success');
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

async function onGruPagaChange(id, checked) {
  document.getElementById('campo-gru-data-pag').style.display = checked ? '' : 'none';
  showLoading();
  try {
    await App.graph.updateItem(CONFIG.listas.processos, id, {
      GruPaga:         checked,
      DataPagamentoGRU: checked ? (document.getElementById('input-gru-data')?.value || null) : null
    });
    App.invalidateCache('processos');
    toast(checked ? 'GRU marcada como paga!' : 'GRU desmarcada.', 'success');
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

async function salvarGRU(id, data) {
  showLoading();
  try {
    await App.graph.updateItem(CONFIG.listas.processos, id, { DataPagamentoGRU: data || null });
    App.invalidateCache('processos');
    toast('Data de pagamento GRU salva!', 'success');
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

// ============================================================
// VALIDADES
// ============================================================
async function renderValidades() {
  document.getElementById('page-title').textContent = 'Controle de Validades';
  const [clientes, documentos] = await Promise.all([App.getClientes(), App.getDocumentos()]);

  const itens = [];

  documentos.forEach(d => {
    if (!d.DataValidade) return;
    const iso = d.DataValidade.split('T')[0];
    const cli = clientes.find(c => String(c.id) === String(d.ClienteId));
    itens.push({ tipo: d.TipoDocumento, cliente: d.ClienteNome || '', data: iso, dias: daysBetween(iso), clienteId: d.ClienteId, celular: cli?.Celular || '', tab: 'documentos' });
  });

  clientes.forEach(c => {
    if (c.DataValidadeCR) {
      const iso = normISO(c.DataValidadeCR);
      itens.push({ tipo: 'CR', cliente: c.Title, data: iso, dias: daysBetween(iso), clienteId: c.id, celular: c.Celular || '', tab: 'dados' });
    }
    if (c.DataValidadeRGouCNH) {
      const iso = c.DataValidadeRGouCNH.split('T')[0];
      itens.push({ tipo: 'RG/CNH', cliente: c.Title, data: iso, dias: daysBetween(iso), clienteId: c.id, celular: c.Celular || '', tab: 'dados' });
    }
    if (c.DataValidadeCTF) {
      const iso = c.DataValidadeCTF.split('T')[0];
      itens.push({ tipo: 'CTF', cliente: c.Title, data: iso, dias: daysBetween(iso), clienteId: c.id, celular: c.Celular || '', tab: 'dados' });
    }
    if (c.SIMAFs) {
      try {
        JSON.parse(c.SIMAFs).forEach(s => {
          if (!s.DataValidade) return;
          const iso = s.DataValidade.split('T')[0];
          itens.push({ tipo: 'SIMAF', cliente: c.Title, data: iso, dias: daysBetween(iso), clienteId: c.id, celular: c.Celular || '', tab: 'dados', descricao: s.NomeFazenda ? `SIMAF — ${s.NomeFazenda}` : 'SIMAF' });
        });
      } catch(e) {}
    }
  });

  window._validades_todos = itens;
  window._validades_sortCol = 'data';
  window._validades_sortDir = 1;

  const tiposUnicos = [...new Set(itens.map(i => i.tipo))].sort();

  document.getElementById('page-content').innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;padding:16px">
        <div>
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Cliente</label>
          <input type="text" id="filtro-cliente" placeholder="Buscar..." oninput="filtrarValidades()" style="border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:13px;width:200px">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Tipo de Documento</label>
          <select id="filtro-tipo" onchange="filtrarValidades()" style="border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:13px">
            <option value="">Todos</option>
            ${tiposUnicos.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Situação</label>
          <select id="filtro-situacao" onchange="filtrarValidades()" style="border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:13px">
            <option value="">Todas</option>
            <option value="vencido">Vencidos</option>
            <option value="30">Vence em até 30 dias</option>
            <option value="60">Vence em até 60 dias</option>
            <option value="90">Vence em até 90 dias</option>
            <option value="ok">Em dia (&gt;90 dias)</option>
          </select>
        </div>
        <button class="btn btn-outline btn-sm" onclick="filtrarValidades(true)" style="align-self:flex-end"><i class="bi bi-x-circle"></i> Limpar</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <h3><i class="bi bi-calendar-check me-2"></i>Documentos com Validade Cadastrada</h3>
        <span id="validades-count" style="font-size:12px;color:var(--text-muted)">${itens.length} item(s)</span>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th onclick="sortValidades('cliente')" style="cursor:pointer;user-select:none;white-space:nowrap">Cliente <span id="sort-icon-cliente"></span></th>
            <th>Documento</th>
            <th onclick="sortValidades('data')" style="cursor:pointer;user-select:none;white-space:nowrap">Vencimento <span id="sort-icon-data"></span></th>
            <th onclick="sortValidades('dias')" style="cursor:pointer;user-select:none;white-space:nowrap">Situação <span id="sort-icon-dias"></span></th>
            <th></th>
          </tr></thead>
          <tbody id="validades-tbody"></tbody>
        </table>
      </div>
    </div>`;

  filtrarValidades();
}

function filtrarValidades(limpar) {
  if (limpar) {
    const fc = document.getElementById('filtro-cliente');
    const ft = document.getElementById('filtro-tipo');
    const fs = document.getElementById('filtro-situacao');
    if (fc) fc.value = '';
    if (ft) ft.value = '';
    if (fs) fs.value = '';
  }

  const textoCliente   = (document.getElementById('filtro-cliente')?.value   || '').toLowerCase().trim();
  const tipoFiltro     = (document.getElementById('filtro-tipo')?.value       || '');
  const situacaoFiltro = (document.getElementById('filtro-situacao')?.value   || '');

  let itens = (window._validades_todos || []).slice();

  if (textoCliente)   itens = itens.filter(i => i.cliente.toLowerCase().includes(textoCliente));
  if (tipoFiltro)     itens = itens.filter(i => i.tipo === tipoFiltro);
  if (situacaoFiltro) {
    itens = itens.filter(i => {
      const d = i.dias;
      if (situacaoFiltro === 'vencido') return d !== null && d < 0;
      if (situacaoFiltro === '30')      return d !== null && d >= 0 && d <= 30;
      if (situacaoFiltro === '60')      return d !== null && d >= 0 && d <= 60;
      if (situacaoFiltro === '90')      return d !== null && d >= 0 && d <= 90;
      if (situacaoFiltro === 'ok')      return d !== null && d > 90;
      return true;
    });
  }

  const sortCol = window._validades_sortCol || 'data';
  const sortDir = window._validades_sortDir || 1;
  itens.sort((a, b) => {
    if (sortCol === 'cliente') return sortDir * (a.cliente || '').localeCompare(b.cliente || '', 'pt-BR');
    return sortDir * ((a.dias ?? 9999) - (b.dias ?? 9999));
  });
  ['cliente', 'data', 'dias'].forEach(col => {
    const sp = document.getElementById('sort-icon-' + col);
    if (!sp) return;
    const active = col === sortCol;
    sp.innerHTML = active
      ? `<i class="bi bi-sort-${sortDir === 1 ? 'up' : 'down'}" style="font-size:11px"></i>`
      : `<i class="bi bi-sort-up" style="font-size:11px;opacity:0.2"></i>`;
  });

  function cor(dias) {
    if (dias === null) return { bg:'badge-gray',   row:'' };
    if (dias < 0)      return { bg:'badge-red',    row:'background:#fff5f5' };
    if (dias <= 30)    return { bg:'badge-orange',  row:'background:#fff7ed' };
    if (dias <= 60)    return { bg:'badge-yellow',  row:'background:#fffbeb' };
    return               { bg:'badge-green',  row:'' };
  }

  const tbody  = document.getElementById('validades-tbody');
  const countEl = document.getElementById('validades-count');
  if (!tbody) return;

  if (countEl) countEl.textContent = `${itens.length} item(s)`;

  if (itens.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="bi bi-check-circle"></i><p>Nenhum documento encontrado.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = itens.map(item => {
    const c = cor(item.dias);
    const label = item.dias === null ? '—'
      : item.dias < 0  ? `Vencido há ${Math.abs(item.dias)}d`
      : item.dias === 0 ? 'Vence hoje'
      : `${item.dias}d restantes`;
    const celularLimpo = (item.celular || '').replace(/\D/g, '');
    const nomeDoc = item.descricao || item.tipo;
    const msgWa = encodeURIComponent(`Olá ${item.cliente}, Verificamos no sistema que o seu ${nomeDoc} está vencendo em ${label}, deseja iniciar o processo de renovação do mesmo?`);
    const btnWa = celularLimpo
      ? `<a href="https://wa.me/55${celularLimpo}?text=${msgWa}" target="_blank" class="btn btn-outline btn-sm" title="Avisar via WhatsApp"><i class="bi bi-whatsapp" style="color:#25D366"></i></a>`
      : `<button class="btn btn-ghost btn-sm" disabled title="Sem telefone cadastrado"><i class="bi bi-whatsapp" style="color:#ccc"></i></button>`;
    return `<tr style="${c.row}">
      <td><a style="cursor:pointer;color:var(--accent);font-weight:600" onclick="navigate('clientes/perfil',{id:'${item.clienteId}',tab:'${item.tab}'})">${esc(item.cliente)}</a></td>
      <td>${esc(nomeDoc)}</td>
      <td>${fmtDate(item.data)}</td>
      <td><span class="badge ${c.bg}">${label}</span></td>
      <td>${btnWa}</td>
    </tr>`;
  }).join('');
}

function sortValidades(col) {
  if (window._validades_sortCol === col) {
    window._validades_sortDir = -(window._validades_sortDir || 1);
  } else {
    window._validades_sortCol = col;
    window._validades_sortDir = 1;
  }
  filtrarValidades();
}

// ============================================================
// PAGAMENTOS — PÁGINA DE PENDENTES
// ============================================================
function getArmaModeloProcesso(p) {
  try {
    const d = JSON.parse(p.DadosEspecificosJSON || '{}');
    if (d.armaId && typeof d.armaId === 'string' && d.armaId.includes('|')) {
      const parts = d.armaId.split('|');
      return parts.length >= 4 ? `${parts[2]} ${parts[3]}`.trim() : (parts[2] || '');
    }
  } catch(e) {}
  return '';
}

function getItensPendentesProcesso(p) {
  if (!p.ValorProcesso) return [];
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const pagamentos = JSON.parse(p.PagamentosJSON || '{}');
  const itens = [];
  if (p.TipoPagamento === 'Parcelado') {
    const entrada = Number(p.ValorEntrada) || 0;
    if (entrada > 0 && !pagamentos['entrada']?.pago) {
      itens.push({ label: 'Entrada', valor: entrada, data: null, vencido: false });
    }
    const nParcelas = Number(p.NumeroParcelas) || 0;
    const valorParcela = Number(p.ValorParcelas) || 0;
    if (nParcelas > 0 && p.DataVencimentoParcelas) {
      const base = new Date(p.DataVencimentoParcelas.split('T')[0]+'T00:00:00');
      for (let i = 0; i < nParcelas; i++) {
        if (!pagamentos[`p${i}`]?.pago) {
          const dp = new Date(base.getFullYear(), base.getMonth() + i, base.getDate());
          itens.push({ label: `Parcela ${i+1}/${nParcelas}`, valor: valorParcela, data: dp.toISOString().split('T')[0], vencido: dp <= hoje });
        }
      }
    }
  } else if (!pagamentos['avista']?.pago) {
    itens.push({ label: 'À vista', valor: Number(p.ValorProcesso), data: null, vencido: false });
  }
  return itens;
}

function toggleParcelasProcesso(pid) {
  const d = document.getElementById('parcelas-' + pid);
  const btn = document.getElementById('toggle-parc-' + pid);
  if (!d || !btn) return;
  const showing = d.style.display !== 'none';
  d.style.display = showing ? 'none' : '';
  btn.innerHTML = showing
    ? `<i class="bi bi-chevron-down"></i> Ver parcelas`
    : `<i class="bi bi-chevron-up"></i> Ocultar`;
}

async function renderPagamentos() {
  document.getElementById('page-title').textContent = 'Pagamentos Pendentes';
  const [clientes, processos] = await Promise.all([App.getClientes(), App.getProcessos()]);

  const pendentes = processos.filter(p =>
    p.ValorProcesso && getItensPendentesProcesso(p).length > 0
  );

  const porCliente = {};
  pendentes.forEach(p => {
    const cid = String(p.ClienteId);
    if (!porCliente[cid]) porCliente[cid] = { nome: p.ClienteNome, clienteId: cid, celular: '', processos: [] };
    porCliente[cid].processos.push(p);
  });
  clientes.forEach(c => {
    const cid = String(c.id);
    if (porCliente[cid]) porCliente[cid].celular = c.Celular || '';
  });

  const grupos = Object.values(porCliente).sort((a, b) => (a.nome||'').localeCompare(b.nome||''));

  const el = document.getElementById('page-content');
  if (grupos.length === 0) {
    el.innerHTML = `<div class="empty-state"><i class="bi bi-check-circle" style="font-size:48px;color:var(--success)"></i><p>Nenhum pagamento pendente. Tudo em dia!</p></div>`;
    return;
  }

  const totalPendente = pendentes.reduce((s, p) => s + getItensPendentesProcesso(p).reduce((ss, i) => ss + i.valor, 0), 0);
  const totalVencido  = pendentes.reduce((s, p) => s + getItensPendentesProcesso(p).filter(i => i.vencido).reduce((ss, i) => ss + i.valor, 0), 0);

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Total Pendente</div>
        <div style="font-size:22px;font-weight:700;color:var(--danger)">${fmtMoeda(totalPendente)}</div>
      </div>
      <div class="card" style="padding:16px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Total Vencido</div>
        <div style="font-size:22px;font-weight:700;color:#dc2626">${fmtMoeda(totalVencido)}</div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <h3><i class="bi bi-cash-coin me-2"></i>Clientes com Pagamentos em Aberto</h3>
        <span style="font-size:12px;color:var(--text-muted)">${grupos.length} cliente(s)</span>
      </div>
      <div class="card-body" style="padding:0">
        ${grupos.map(g => {
          const total = g.processos.reduce((s, p) => s + getItensPendentesProcesso(p).reduce((ss, i) => ss + i.valor, 0), 0);
          const celularLimpo = (g.celular || '').replace(/\D/g, '');
          const msgWa = `Olá ${esc(g.nome)}, verificamos em nosso sistema que constam valores em aberto referentes aos serviços prestados no valor de ${fmtMoeda(total)}.`;
          return `<div style="padding:16px 20px;border-bottom:1px solid var(--border)">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px">
              <a style="font-size:15px;font-weight:700;cursor:pointer;color:var(--accent)" onclick="navigate('clientes/perfil',{id:'${g.clienteId}',tab:'pagamentos'})">${esc(g.nome)}</a>
              <div style="display:flex;align-items:center;gap:8px">
                <strong style="font-size:15px;color:var(--danger)">${fmtMoeda(total)}</strong>
                ${celularLimpo ? `<button class="btn btn-whatsapp btn-sm" onclick="window.open('https://wa.me/55${celularLimpo}?text=${encodeURIComponent(msgWa)}','_blank')"><i class="bi bi-whatsapp"></i> Avisar</button>` : ''}
              </div>
            </div>
            <div style="padding-left:12px;border-left:3px solid var(--border)">
              ${g.processos.map((p, pi) => {
                const modelo = getArmaModeloProcesso(p);
                const itens = getItensPendentesProcesso(p);
                const totalProc = itens.reduce((s, i) => s + i.valor, 0);
                const hasMultiple = itens.length > 1;
                const hasVencido = itens.some(i => i.vencido);
                return `<div style="padding:6px 0;font-size:13px${pi < g.processos.length-1 ? ';border-bottom:1px solid var(--border)' : ''}">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                      <a style="cursor:pointer;color:var(--accent)" onclick="navigate('processos/detalhe',{id:'${p.id}'})">${esc(p.TipoProcesso||'—')}${modelo ? ` <span style="color:var(--text-muted);font-size:12px">· ${esc(modelo)}</span>` : ''}</a>
                      ${hasMultiple ? `<button id="toggle-parc-${p.id}" class="btn btn-ghost btn-sm" style="padding:0 6px;font-size:11px" onclick="toggleParcelasProcesso('${p.id}')"><i class="bi bi-chevron-down"></i> Ver parcelas</button>` : ''}
                    </div>
                    <strong style="font-size:12px;color:${hasVencido ? 'var(--danger)' : '#1f2937'}">${fmtMoeda(totalProc)}</strong>
                  </div>
                  <div id="parcelas-${p.id}" style="display:${hasMultiple ? 'none' : ''}">
                    ${itens.map(i => `<div style="display:flex;justify-content:space-between;padding:1px 0 1px 8px;font-size:12px${i.vencido?';color:#dc2626':''}">
                      <span>${esc(i.label)}${i.data ? ` · ${fmtDate(i.data)}` : ''}</span>
                      <span style="font-weight:600">${fmtMoeda(i.valor)}</span>
                    </div>`).join('')}
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  const gruPendentes = processos.filter(p => !p.GruPaga && !STATUS_FECHADOS.includes(p.Status));
  if (gruPendentes.length > 0) {
    const porClienteGru = {};
    gruPendentes.forEach(p => {
      const cid = String(p.ClienteId);
      if (!porClienteGru[cid]) porClienteGru[cid] = { nome: p.ClienteNome, clienteId: cid, processos: [] };
      porClienteGru[cid].processos.push(p);
    });
    const gruGrupos = Object.values(porClienteGru).sort((a,b) => (a.nome||'').localeCompare(b.nome||''));
    el.innerHTML += `<div class="card" style="margin-top:20px">
      <div class="card-header">
        <h3><i class="bi bi-receipt me-2"></i>Pagamentos de GRU</h3>
        <span style="font-size:12px;color:var(--text-muted)">${gruPendentes.length} processo(s)</span>
      </div>
      <div class="card-body" style="padding:0">
        ${gruGrupos.map(g => `<div style="padding:12px 20px;border-bottom:1px solid var(--border)">
          <a style="font-size:14px;font-weight:700;cursor:pointer;color:var(--accent)" onclick="navigate('clientes/perfil',{id:'${g.clienteId}'})">${esc(g.nome)}</a>
          <div style="padding-left:12px;border-left:3px solid var(--border);margin-top:6px">
            ${g.processos.map(p => `<div style="padding:3px 0;font-size:13px;display:flex;justify-content:space-between;align-items:center">
              <a style="cursor:pointer;color:var(--accent)" onclick="navigate('processos/detalhe',{id:'${p.id}'})">${esc(p.TipoProcesso||'—')}</a>
              <span class="badge badge-orange">GRU Pendente</span>
            </div>`).join('')}
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  }
}

// ============================================================
// PROCESSOS — EDITAR
// ============================================================
async function renderProcessoEditar(id) {
  document.getElementById('page-title').textContent = 'Editar Processo';
  const processo = await App.graph.getItem(CONFIG.listas.processos, id);

  const d = (f) => processo[f] ? processo[f].split('T')[0] : '';
  const tipoPag = processo.TipoPagamento || 'À vista';

  document.getElementById('page-content').innerHTML = `
  <div style="margin-bottom:12px"><span style="color:var(--text-muted);font-size:13px">Cliente: </span><strong>${esc(processo.ClienteNome||'—')}</strong> &nbsp;·&nbsp; <span style="color:var(--text-muted);font-size:13px">Tipo: </span><strong>${esc(processo.TipoProcesso||'—')}</strong></div>
  <form id="form-processo-edit" onsubmit="salvarProcessoEdicao(event,'${id}')">
    <div class="form-section">
      <div class="form-section-title">Informações Gerais</div>
      <div class="form-body">
        <div class="form-grid">
          <div><label>Responsável</label>
            <select name="Responsavel">
              <option value="">Selecione...</option>
              ${RESPONSAVEIS.map(r => `<option value="${r}" ${processo.Responsavel===r?'selected':''}>${r}</option>`).join('')}
            </select>
          </div>
          <div><label>N° Protocolo</label><input name="NumeroProtocolo" value="${esc(processo.NumeroProtocolo||'')}" /></div>
          <div><label>Data de Protocolo no Sistema</label><input type="date" name="DataProtocoloSistema" value="${d('DataProtocoloSistema')}" /></div>
          <div><label>Status</label>
            <select name="Status">
              ${STATUS_PROCESSO.map(s => `<option value="${s}" ${processo.Status===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div><label>Data de Última Conferência</label><input type="date" name="DataUltimaConferencia" value="${d('DataUltimaConferencia')}" /></div>
          <div><label>Data de Abertura</label><input type="date" name="DataAbertura" value="${d('DataAbertura')}" /></div>
          <div><label>Prazo</label><input type="date" name="DataPrazo" value="${d('DataPrazo')}" /></div>
        </div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Pagamento</div>
      <div class="form-body">
        <div class="form-grid">
          <div><label>Valor do Processo (R$)</label><input type="number" name="ValorProcesso" step="0.01" min="0" value="${processo.ValorProcesso||''}" placeholder="0,00" oninput="calcularParcelasEdit()" /></div>
          <div>
            <label>Tipo de Pagamento</label>
            <div class="checkbox-group">
              <label class="checkbox-item"><input type="radio" name="TipoPagamento" value="À vista" ${tipoPag==='À vista'?'checked':''} onchange="onTipoPagamentoEditChange(this.value)" /> À vista</label>
              <label class="checkbox-item"><input type="radio" name="TipoPagamento" value="Parcelado" ${tipoPag==='Parcelado'?'checked':''} onchange="onTipoPagamentoEditChange(this.value)" /> Parcelado</label>
            </div>
          </div>
          <div><label>Forma de Pagamento</label>
            <select name="FormaPagamento">
              <option value="">Selecione...</option>
              <option value="Pix" ${processo.FormaPagamento==='Pix'?'selected':''}>Pix</option>
              <option value="Dinheiro" ${processo.FormaPagamento==='Dinheiro'?'selected':''}>Dinheiro</option>
              <option value="Cartão" ${processo.FormaPagamento==='Cartão'?'selected':''}>Cartão</option>
            </select>
          </div>
          <div><label>Data de Pagamento</label><input type="date" name="DataPagamento" value="${d('DataPagamento')}" /></div>
        </div>
        <div id="campos-parcelado-edit" style="display:${tipoPag==='Parcelado'?'block':'none'};margin-top:16px">
          <div class="form-grid">
            <div><label>Quantas Vezes</label>
              <select name="NumeroParcelas" onchange="calcularParcelasEdit()">
                <option value="">Selecione...</option>
                ${[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>`<option value="${n}" ${processo.NumeroParcelas==n?'selected':''}>${n}x</option>`).join('')}
              </select>
            </div>
            <div><label>Valor de Entrada (R$)</label><input type="number" name="ValorEntrada" step="0.01" min="0" value="${processo.ValorEntrada||''}" placeholder="0,00" oninput="calcularParcelasEdit()" /></div>
            <div><label>Valor das Parcelas (R$)</label><input type="text" id="valor-parcelas-display-edit" readonly value="${processo.ValorParcelas ? fmtMoeda(processo.ValorParcelas) : ''}" placeholder="Calculado automaticamente" /><input type="hidden" name="ValorParcelas" id="valor-parcelas-input-edit" value="${processo.ValorParcelas||''}" /></div>
            <div><label>Data de Vencimento das Parcelas</label><input type="date" name="DataVencimentoParcelas" value="${d('DataVencimentoParcelas')}" /></div>
          </div>
        </div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Observações</div>
      <div class="form-body"><textarea name="Observacoes" rows="3">${esc(processo.Observacoes||'')}</textarea></div>
    </div>
    <div class="btn-group" style="margin-top:8px">
      <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> Salvar Alterações</button>
      <button type="button" class="btn btn-outline" onclick="navigate('processos/detalhe',{id:'${id}'})">Cancelar</button>
      <button type="button" class="btn btn-danger" onclick="deletarProcesso('${id}','${esc(processo.ClienteNome||'')}')"><i class="bi bi-trash"></i> Excluir Processo</button>
    </div>
  </form>`;
}

async function salvarProcessoEdicao(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  showLoading();
  try {
    await App.graph.updateItem(CONFIG.listas.processos, id, {
      Responsavel:            fd.get('Responsavel') || '',
      NumeroProtocolo:        fd.get('NumeroProtocolo') || '',
      DataProtocoloSistema:   fd.get('DataProtocoloSistema') || null,
      Status:                 fd.get('Status'),
      DataUltimaConferencia:  fd.get('DataUltimaConferencia') || null,
      DataAbertura:           fd.get('DataAbertura') || null,
      DataPrazo:              fd.get('DataPrazo') || null,
      ValorProcesso:          parseFloat(fd.get('ValorProcesso')) || null,
      TipoPagamento:          fd.get('TipoPagamento') || 'À vista',
      FormaPagamento:         fd.get('FormaPagamento') || '',
      DataPagamento:          fd.get('DataPagamento') || null,
      NumeroParcelas:         fd.get('NumeroParcelas') ? parseInt(fd.get('NumeroParcelas')) : null,
      ValorEntrada:           parseFloat(fd.get('ValorEntrada')) || null,
      ValorParcelas:          parseFloat(fd.get('ValorParcelas')) || null,
      DataVencimentoParcelas: fd.get('DataVencimentoParcelas') || null,
      Observacoes:            fd.get('Observacoes') || '',
    });
    App.invalidateCache('processos');
    toast('Processo atualizado!', 'success');
    navigate('processos/detalhe', { id });
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

// ============================================================
// FUNÇÕES AUXILIARES — PAGAMENTO / CTF / SIMAF
// ============================================================
function calcularParcelas() {
  const valor    = parseFloat(document.querySelector('[name="ValorProcesso"]')?.value) || 0;
  const entrada  = parseFloat(document.querySelector('[name="ValorEntrada"]')?.value) || 0;
  const parcelas = parseInt(document.querySelector('[name="NumeroParcelas"]')?.value) || 0;
  if (parcelas > 0) {
    const vp = (valor - entrada) / parcelas;
    const disp = document.getElementById('valor-parcelas-display');
    const inp  = document.getElementById('valor-parcelas-input');
    if (disp) disp.value = fmtMoeda(vp);
    if (inp)  inp.value  = vp.toFixed(2);
  }
}

function calcularParcelasDetalhe() {
  const form = document.querySelector('#page-content form');
  if (!form) return;
  const valor    = parseFloat(form.querySelector('[name="ValorProcesso"]')?.value) || 0;
  const entrada  = parseFloat(form.querySelector('[name="ValorEntrada"]')?.value) || 0;
  const parcelas = parseInt(form.querySelector('[name="NumeroParcelas"]')?.value) || 0;
  if (parcelas > 0) {
    const vp = (valor - entrada) / parcelas;
    const disp = document.getElementById('valor-parcelas-display-det');
    const inp  = document.getElementById('valor-parcelas-input-det');
    if (disp) disp.value = fmtMoeda(vp);
    if (inp)  inp.value  = vp.toFixed(2);
  }
}

function calcularParcelasEdit() {
  const form = document.getElementById('form-processo-edit');
  if (!form) return;
  const valor    = parseFloat(form.querySelector('[name="ValorProcesso"]')?.value) || 0;
  const entrada  = parseFloat(form.querySelector('[name="ValorEntrada"]')?.value) || 0;
  const parcelas = parseInt(form.querySelector('[name="NumeroParcelas"]')?.value) || 0;
  if (parcelas > 0) {
    const vp = (valor - entrada) / parcelas;
    const disp = document.getElementById('valor-parcelas-display-edit');
    const inp  = document.getElementById('valor-parcelas-input-edit');
    if (disp) disp.value = fmtMoeda(vp);
    if (inp)  inp.value  = vp.toFixed(2);
  }
}

function onTipoPagamentoChange(tipo) {
  const el = document.getElementById('campos-parcelado');
  const elDataPag = document.getElementById('campo-data-pag-novo');
  if (el) el.style.display = tipo === 'Parcelado' ? '' : 'none';
  if (elDataPag) {
    if (tipo === 'À vista') {
      elDataPag.style.display = '';
    } else {
      const entrada = parseFloat(document.querySelector('[name="ValorEntrada"]')?.value) || 0;
      elDataPag.style.display = entrada > 0 ? '' : 'none';
    }
  }
}

function onValorEntradaChangeNovo(val) {
  const elDataPag = document.getElementById('campo-data-pag-novo');
  if (!elDataPag) return;
  const tipo = document.querySelector('[name="TipoPagamento"]:checked')?.value || 'À vista';
  if (tipo === 'Parcelado') {
    elDataPag.style.display = parseFloat(val) > 0 ? '' : 'none';
  }
}

function onTipoPagamentoDetalheChange(tipo) {
  const el = document.getElementById('campos-parcelado-detalhe');
  if (el) el.style.display = tipo === 'Parcelado' ? '' : 'none';
  _atualizarDataPagDetalhe();
}

function onFormaPagDetalhe(forma) {
  _atualizarDataPagDetalhe();
}

function onValorEntradaDetalheChange(val) {
  _atualizarDataPagDetalhe();
}

function _atualizarDataPagDetalhe() {
  const elDataPag = document.getElementById('pag-data-pag-det');
  if (!elDataPag) return;
  const tipo = document.querySelector('[name="TipoPagamento"]:checked')?.value || 'À vista';
  if (tipo !== 'Parcelado') {
    elDataPag.style.display = '';
  } else {
    elDataPag.style.display = (parseFloat(document.querySelector('[name="ValorEntrada"]')?.value) || 0) > 0 ? '' : 'none';
  }
}

function renderDadosPagamento(p) {
  if (!p.ValorProcesso) return '';
  const pagamentos = JSON.parse(p.PagamentosJSON || '{}');
  const pid = p.id;
  const linhas = [];

  if (p.TipoPagamento === 'Parcelado') {
    const entrada = Number(p.ValorEntrada) || 0;
    if (entrada > 0) {
      linhas.push({ key: 'entrada', label: 'Entrada', valor: entrada, dataVenc: null });
    }
    const nParcelas = Number(p.NumeroParcelas) || 0;
    const valorParcela = Number(p.ValorParcelas) || 0;
    if (nParcelas > 0 && p.DataVencimentoParcelas) {
      const base = new Date(p.DataVencimentoParcelas.split('T')[0]+'T00:00:00');
      for (let i = 0; i < nParcelas; i++) {
        const dp = new Date(base.getFullYear(), base.getMonth() + i, base.getDate());
        linhas.push({ key: `p${i}`, label: `Parcela ${i+1}/${nParcelas}`, valor: valorParcela, dataVenc: dp.toISOString().split('T')[0] });
      }
    }
  } else {
    linhas.push({ key: 'avista', label: 'À vista', valor: Number(p.ValorProcesso), dataVenc: null });
  }
  if (!linhas.length) return '';

  function itemStatus(key, dataVenc) {
    const item = pagamentos[key];
    if (!item?.pago) {
      if (dataVenc) {
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        if (new Date(dataVenc+'T00:00:00') < hoje) return { cls: 'badge-red', txt: 'Em Atraso' };
      }
      return { cls: 'badge-gray', txt: 'Pendente' };
    }
    if (!dataVenc || !item.dataPagamento) return { cls: 'badge-green', txt: 'Pago' };
    return new Date(item.dataPagamento+'T00:00:00') <= new Date(dataVenc+'T00:00:00')
      ? { cls: 'badge-green', txt: 'Pago' }
      : { cls: 'badge-orange', txt: 'Pago em atraso' };
  }

  return `
    <div class="card" style="margin-top:20px">
      <div class="card-header"><h3><i class="bi bi-table me-2"></i>Dados de Pagamento</h3></div>
      <div class="card-body" style="padding:0">
        ${linhas.map(l => {
          const item = pagamentos[l.key] || {};
          const st = itemStatus(l.key, l.dataVenc);
          const pago = !!item.pago;
          const dataPag = item.dataPagamento || '';
          return `
          <div style="padding:8px 16px;border-bottom:1px solid var(--border);font-size:13px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span class="badge ${st.cls}" style="font-size:10px;min-width:88px;text-align:center">${st.txt}</span>
                <span>${esc(l.label)}</span>
                ${l.dataVenc ? `<span style="color:var(--text-muted);font-size:12px">Venc: ${fmtDate(l.dataVenc)}</span>` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <strong>${fmtMoeda(l.valor)}</strong>
                <label class="checkbox-item" style="margin:0;font-size:12px;white-space:nowrap">
                  <input type="checkbox" id="chk-pag-${l.key}" ${pago ? 'checked' : ''}
                    onchange="onPagItemCheck('${pid}','${l.key}','${l.dataVenc||''}',this.checked)" /> Pago
                </label>
              </div>
            </div>
            <div id="pag-data-wrap-${l.key}" style="display:${pago ? '' : 'none'};margin-top:6px">
              <label style="font-size:11px;color:var(--text-muted)">Data de Pagamento</label>
              <input type="date" id="input-pag-data-${l.key}" value="${dataPag}"
                style="margin-top:2px;font-size:12px;padding:4px 8px"
                onchange="onPagItemData('${pid}','${l.key}','${l.dataVenc||''}')" />
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function onPagItemCheck(processoId, key, dataVenc, checked) {
  const wrap = document.getElementById(`pag-data-wrap-${key}`);
  if (wrap) wrap.style.display = checked ? '' : 'none';
  if (checked) {
    const inp = document.getElementById(`input-pag-data-${key}`);
    if (inp && !inp.value) inp.value = new Date().toISOString().split('T')[0];
  }
  _salvarItemPagamento(processoId, key, dataVenc || null);
}

function onPagItemData(processoId, key, dataVenc) {
  _salvarItemPagamento(processoId, key, dataVenc || null);
}

async function _salvarItemPagamento(processoId, key, dataVenc) {
  showLoading();
  try {
    const proc = await App.graph.getItem(CONFIG.listas.processos, processoId);
    const pagamentos = JSON.parse(proc.PagamentosJSON || '{}');
    const chk = document.getElementById(`chk-pag-${key}`);
    const inp = document.getElementById(`input-pag-data-${key}`);
    pagamentos[key] = {
      pago: chk?.checked || false,
      dataPagamento: chk?.checked ? (inp?.value || null) : null
    };
    await App.graph.updateItem(CONFIG.listas.processos, processoId, { PagamentosJSON: JSON.stringify(pagamentos) });
    App.invalidateCache('processos');
    const updatedProc = await App.graph.getItem(CONFIG.listas.processos, processoId);
    const wrapper = document.getElementById('dados-pagamento-wrapper');
    if (wrapper) wrapper.innerHTML = renderDadosPagamento(updatedProc);
    toast('Pagamento atualizado!', 'success');
  } catch(err) { toast(err.message, 'error'); } finally { hideLoading(); }
}

function onTipoPagamentoEditChange(tipo) {
  const el = document.getElementById('campos-parcelado-edit');
  if (el) el.style.display = tipo === 'Parcelado' ? '' : 'none';
}

async function copiarCampo(btn) {
  const val = btn.getAttribute('data-val') || '';
  try {
    await navigator.clipboard.writeText(val);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = val;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  btn.innerHTML = '<i class="bi bi-clipboard-check"></i>';
  btn.classList.add('copied');
  setTimeout(() => { btn.innerHTML = '<i class="bi bi-clipboard"></i>'; btn.classList.remove('copied'); }, 1500);
}

function onCatCacadorChange(checked) {
  const el = document.getElementById('secao-ctf');
  if (el) el.style.display = checked ? '' : 'none';
}

async function renovarCTF(clienteId) {
  showLoading();
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const novaValidade = addMonths(hoje, 3);
    await App.graph.updateItem(CONFIG.listas.clientes, clienteId, { DataValidadeCTF: novaValidade });
    App.invalidateCache('clientes');
    toast('CTF renovado! Nova validade: ' + fmtDate(novaValidade), 'success');
    await renderClientePerfil(clienteId, 'dados');
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

function toggleSIMAFForm(clienteId) {
  const el = document.getElementById('simaf-form-wrap');
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
}

async function salvarSIMAF(e, clienteId) {
  e.preventDefault();
  const fd = new FormData(e.target);
  showLoading();
  try {
    const cliente = await App.graph.getItem(CONFIG.listas.clientes, clienteId);
    const simafList = JSON.parse(cliente.SIMAFs || '[]');
    simafList.push({
      DataValidade:    fd.get('DataValidade') || null,
      NomePropriedade: fd.get('NomePropriedade') || '',
      CARPropriedade:  fd.get('CARPropriedade') || '',
      CidadeSimaf:     fd.get('CidadeSimaf') || '',
      UFSimaf:         (fd.get('UFSimaf') || '').toUpperCase(),
    });
    await App.graph.updateItem(CONFIG.listas.clientes, clienteId, { SIMAFs: JSON.stringify(simafList) });
    App.invalidateCache('clientes');
    toast('SIMAF adicionado!', 'success');
    await renderClientePerfil(clienteId, 'dados');
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

async function deletarSIMAF(clienteId, index) {
  if (!confirm('Excluir este SIMAF?')) return;
  showLoading();
  try {
    const cliente = await App.graph.getItem(CONFIG.listas.clientes, clienteId);
    const simafList = JSON.parse(cliente.SIMAFs || '[]');
    simafList.splice(index, 1);
    await App.graph.updateItem(CONFIG.listas.clientes, clienteId, { SIMAFs: JSON.stringify(simafList) });
    App.invalidateCache('clientes');
    toast('SIMAF excluído.', 'success');
    await renderClientePerfil(clienteId, 'dados');
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

// ============================================================
// AUTENTICAÇÃO
// ============================================================
async function initAuth() {
  App.msal = new msal.PublicClientApplication(CONFIG.msalConfig);
  await App.msal.initialize();
  App.graph = new GraphService(App.msal);

  // Verifica se já há conta logada
  const accounts = App.msal.getAllAccounts();
  if (accounts.length > 0) {
    App.account = accounts[0];
    return true;
  }
  return false;
}

async function fazerLogin() {
  showLoading();
  try {
    const res = await App.msal.loginPopup(CONFIG.loginRequest);
    App.account = res.account;
    await iniciarApp();
  } catch(e) {
    toast('Erro ao fazer login: ' + e.message, 'error');
  } finally { hideLoading(); }
}

function fazerLogout() {
  App.msal.logoutPopup({ account: App.account });
}

// ============================================================
// CLUBES DE TIRO — LISTA
// ============================================================
async function renderClubesList() {
  document.getElementById('page-title').textContent = 'Clubes de Tiro';
  const clubes = await App.getClubes();
  clubes.sort((a, b) => (a.Title || '').localeCompare(b.Title || '', 'pt-BR'));

  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="toolbar">
      <div class="search-bar"><i class="bi bi-search"></i><input id="busca-clube" placeholder="Buscar por nome..." oninput="filtrarClubes()" /></div>
      <button class="btn btn-primary" onclick="navigate('clubes/novo')"><i class="bi bi-plus-lg"></i> Novo Clube</button>
    </div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Nome</th><th>CNPJ</th><th>Cert. de Registro</th><th>WhatsApp</th><th>Ações</th>
          </tr></thead>
          <tbody id="tbody-clubes">${renderClubesRows(clubes)}</tbody>
        </table>
      </div>
    </div>`;
  window._clubes_filtro = clubes;
}

function renderClubesRows(lista) {
  if (!lista.length) return `<tr><td colspan="5"><div class="empty-state"><i class="bi bi-building"></i><p>Nenhum clube cadastrado.</p><button class="btn btn-primary" onclick="navigate('clubes/novo')">Cadastrar primeiro clube</button></div></td></tr>`;
  return lista.map(cl => `<tr>
    <td><strong>${esc(cl.Title || '—')}</strong></td>
    <td>${esc(cl.CNPJ || '—')}</td>
    <td>${esc(cl.CertificadoRegistro || '—')}</td>
    <td>${esc(cl.Whatsapp || '—')}</td>
    <td>
      <div class="btn-group">
        <button class="btn btn-outline btn-sm" onclick="navigate('clubes/editar',{id:'${cl.id}'})"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-ghost btn-sm" onclick="confirmarDeleteClube('${cl.id}','${esc(cl.Title)}')"><i class="bi bi-trash" style="color:var(--danger)"></i></button>
      </div>
    </td>
  </tr>`).join('');
}

function filtrarClubes() {
  const q = document.getElementById('busca-clube').value.toLowerCase();
  const lista = q ? window._clubes_filtro.filter(cl => (cl.Title || '').toLowerCase().includes(q)) : window._clubes_filtro;
  document.getElementById('tbody-clubes').innerHTML = renderClubesRows(lista);
}

async function confirmarDeleteClube(id, nome) {
  if (!confirm(`Excluir o clube "${nome}"?`)) return;
  showLoading();
  try {
    await App.graph.deleteItem(CONFIG.listas.clubes, id);
    App.invalidateCache('clubes');
    toast('Clube excluído.', 'success');
    await renderClubesList();
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

// ============================================================
// CLUBES DE TIRO — FORMULÁRIO
// ============================================================
async function renderClubeForm(id = null) {
  document.getElementById('page-title').textContent = id ? 'Editar Clube' : 'Novo Clube de Tiro';
  let cl = {};
  if (id) cl = await App.graph.getItem(CONFIG.listas.clubes, id);

  const val = (f) => esc(cl[f] || '');

  document.getElementById('page-content').innerHTML = `
  <form id="form-clube" onsubmit="salvarClube(event,'${id||''}')">
    <div class="form-section">
      <div class="form-section-title">Dados do Clube</div>
      <div class="form-body">
        <div class="form-grid">
          <div style="grid-column:1/-1"><label>Nome do Clube *</label><input name="Title" value="${val('Title')}" required maxlength="80" /></div>
          <div><label>CNPJ</label><input name="CNPJ" value="${val('CNPJ')}" oninput="this.value=fmtCNPJ(this.value)" maxlength="18" /></div>
          <div><label>Certificado de Registro</label><input name="CertificadoRegistro" value="${val('CertificadoRegistro')}" oninput="this.value=this.value.replace(/\\D/g,'')" /></div>
          <div style="grid-column:1/-1"><label>Endereço Completo</label><input name="Endereco" value="${val('Endereco')}" maxlength="80" /></div>
          <div><label>WhatsApp</label><input name="Whatsapp" value="${val('Whatsapp')}" oninput="this.value=fmtCelular(this.value)" maxlength="15" /></div>
        </div>
      </div>
    </div>
    <div class="btn-group" style="margin-top:8px">
      <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> Salvar</button>
      <button type="button" class="btn btn-outline" onclick="history.back()">Cancelar</button>
    </div>
  </form>`;
}

async function salvarClube(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const fields = {
    Title:                toTitleCase(fd.get('Title')),
    CNPJ:                 fd.get('CNPJ'),
    CertificadoRegistro:  fd.get('CertificadoRegistro'),
    Endereco:             toTitleCase(fd.get('Endereco')),
    Whatsapp:             fmtCelular(fd.get('Whatsapp')),
  };
  showLoading();
  try {
    if (id) {
      await App.graph.updateItem(CONFIG.listas.clubes, id, fields);
    } else {
      await App.graph.createItem(CONFIG.listas.clubes, fields);
    }
    App.invalidateCache('clubes');
    toast(id ? 'Clube atualizado!' : 'Clube cadastrado!', 'success');
    navigate('clubes');
  } catch(e) { toast(e.message, 'error'); } finally { hideLoading(); }
}

// ============================================================
// ORÇAMENTO
// ============================================================
async function renderOrcamentoForm(clienteId = null) {
  document.getElementById('page-title').textContent = 'Novo Orçamento';
  const clientes = await App.getClientes();
  const sorted = [...clientes].sort((a,b) => (a.Title||'').localeCompare(b.Title||''));

  document.getElementById('page-content').innerHTML = `
    <div class="card">
      <div class="card-header"><h3><i class="bi bi-calculator me-2"></i>Novo Orçamento</h3></div>
      <div class="card-body">
        <div style="margin-bottom:16px">
          <label>Cliente</label>
          <select id="orc-cliente-sel" style="margin-top:4px" onchange="atualizarOrcamento()">
            <option value="">Selecione o cliente...</option>
            ${sorted.map(c => `<option value="${esc(c.id)}|${esc(c.Title)}|${esc(c.Celular||'')}" ${String(c.id)===String(clienteId)?'selected':''}>${esc(c.Title)}</option>`).join('')}
          </select>
        </div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><h3>Serviços</h3></div>
          <div class="card-body" style="padding:0">
            ${TIPOS_PROCESSO.map((tipo, i) => {
              const valor = VALORES_PROCESSO[tipo] || 0;
              return `<div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                <label class="checkbox-item" style="flex:1;min-width:200px;margin:0;cursor:pointer">
                  <input type="checkbox" id="orc-chk-${i}" onchange="onOrcItemChange(${i})" />
                  ${esc(tipo)}
                </label>
                <div id="orc-qty-wrap-${i}" style="display:none;align-items:center;gap:8px">
                  <select id="orc-qty-${i}" style="width:65px" onchange="atualizarOrcamento()">
                    ${[...Array(20)].map((_,n) => `<option value="${n+1}">${n+1}x</option>`).join('')}
                  </select>
                  <span style="font-size:12px;color:var(--text-muted)">${fmtMoeda(valor)} / un.</span>
                </div>
                <span id="orc-sub-${i}" style="font-weight:600;font-size:13px;min-width:90px;text-align:right;color:var(--accent)"></span>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div id="orc-total-div" style="display:none;background:#f9fafb;border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-weight:700;font-size:15px">Total</span>
            <strong id="orc-total-val" style="font-size:20px;color:var(--accent)"></strong>
          </div>
          <div style="font-size:13px;color:var(--text-muted)">
            À vista (5% desconto): <strong id="orc-avista-val" style="color:var(--success)"></strong>
            &nbsp;·&nbsp; Cartão: em até 10x com juros da máquina
          </div>
        </div>
        <div style="text-align:right">
          <a id="orc-wa-btn" class="btn btn-whatsapp" href="#" target="_blank" style="pointer-events:none;opacity:0.45">
            <i class="bi bi-whatsapp"></i> Enviar Orçamento ao Cliente
          </a>
        </div>
      </div>
    </div>`;

  atualizarOrcamento();
}

function onOrcItemChange(i) {
  const wrap = document.getElementById(`orc-qty-wrap-${i}`);
  const checked = document.getElementById(`orc-chk-${i}`)?.checked;
  if (wrap) wrap.style.display = checked ? 'flex' : 'none';
  if (!checked) { const sub = document.getElementById(`orc-sub-${i}`); if (sub) sub.textContent = ''; }
  atualizarOrcamento();
}

function atualizarOrcamento() {
  const sel = document.getElementById('orc-cliente-sel');
  const parts = (sel?.value || '').split('|');
  const celular = parts[2] || '';

  let total = 0;
  const linhas = [];

  TIPOS_PROCESSO.forEach((tipo, i) => {
    const chk = document.getElementById(`orc-chk-${i}`);
    const sub = document.getElementById(`orc-sub-${i}`);
    if (!chk?.checked) return;
    const qtd = parseInt(document.getElementById(`orc-qty-${i}`)?.value || '1');
    const valor = VALORES_PROCESSO[tipo] || 0;
    const subtotal = qtd * valor;
    total += subtotal;
    if (sub) sub.textContent = fmtMoeda(subtotal);
    linhas.push({ tipo, qtd, valor, subtotal });
  });

  const totalDiv  = document.getElementById('orc-total-div');
  const totalVal  = document.getElementById('orc-total-val');
  const avistaVal = document.getElementById('orc-avista-val');
  const waBtn     = document.getElementById('orc-wa-btn');

  if (linhas.length > 0) {
    if (totalDiv)  totalDiv.style.display = '';
    if (totalVal)  totalVal.textContent   = fmtMoeda(total);
    if (avistaVal) avistaVal.textContent  = fmtMoeda(total * 0.95);
  } else {
    if (totalDiv) totalDiv.style.display = 'none';
  }

  const celularLimpo = celular.replace(/\D/g, '');
  if (linhas.length > 0 && celularLimpo) {
    const msg =
      'Segue valores de orçamento referente aos serviços solicitados:\n\n' +
      linhas.map(l => {
        const unStr  = l.valor.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
        const subStr = l.subtotal.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
        return l.qtd > 1 ? `• ${l.tipo} (${l.qtd}x ${unStr}): ${subStr}` : `• ${l.tipo}: ${subStr}`;
      }).join('\n') +
      `\n\nTotal: ${total.toLocaleString('pt-BR', { style:'currency', currency:'BRL' })}` +
      `\nFormas de pagamento: à vista com 5% de desconto (${(total*0.95).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}) ou cartão de crédito em até 10x com acréscimo dos juros da máquina.`;
    if (waBtn) { waBtn.href = `https://wa.me/55${celularLimpo}?text=${encodeURIComponent(msg)}`; waBtn.style.pointerEvents = ''; waBtn.style.opacity = '1'; }
  } else {
    if (waBtn) { waBtn.href = '#'; waBtn.style.pointerEvents = 'none'; waBtn.style.opacity = '0.45'; }
  }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
async function iniciarApp() {
  document.getElementById('login-screen').style.display  = 'none';
  document.getElementById('setup-screen').style.display  = 'none';
  document.getElementById('app-shell').style.display     = 'flex';
  document.getElementById('user-name').textContent       = App.account?.name || '';

  // Verifica e cria listas se necessário
  showLoading();
  try {
    const criou = await App.graph.initializeLists((msg) => {
      document.getElementById('login-screen').style.display  = 'none';
      document.getElementById('setup-screen').style.display  = 'flex';
      document.getElementById('app-shell').style.display     = 'none';
      document.getElementById('setup-progress').textContent  = msg;
    });
    if (criou) toast('Sistema configurado com sucesso!', 'success');
  } catch(e) {
    toast('Erro ao configurar listas: ' + e.message, 'error');
  } finally { hideLoading(); }

  document.getElementById('setup-screen').style.display  = 'none';
  document.getElementById('app-shell').style.display     = 'flex';
  renderPage();
}

async function init() {
  try {
    const logado = await initAuth();
    if (logado) {
      await iniciarApp();
    } else {
      document.getElementById('login-screen').style.display = 'flex';
    }
    document.getElementById('btn-login').addEventListener('click', fazerLogin);
    document.getElementById('btn-logout').addEventListener('click', fazerLogout);
  } catch(e) {
    console.error('Erro na inicialização:', e);
    document.getElementById('login-screen').style.display = 'flex';
    const card = document.querySelector('.login-card');
    if (card) {
      const errDiv = document.createElement('div');
      errDiv.style.cssText = 'margin-top:16px;padding:12px;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;font-size:12px;color:#991b1b;text-align:left';
      errDiv.textContent = 'Erro de inicialização: ' + e.message;
      card.appendChild(errDiv);
    }
  }
}

document.addEventListener('DOMContentLoaded', init);

// ============================================================
// INTEGRAÇÃO SINARM CAC — BOOKMARKLET
// ============================================================

const _BM_TEMPLATE = `(function(){
var H='__CAC_URL__';
if(!location.host.includes('pf.gov.br')){alert('Use este favorito na página do SINARM CAC (servicos.pf.gov.br).');return;}
var modal=document.querySelector('mat-dialog-container')||document.querySelector('[role="dialog"]')||document.querySelector('[class*="dialog"]')||document.body;
function txt(el){
  if(!el)return '';
  var pdl=el.querySelector('.ui-dropdown-label:not(.ui-placeholder)');
  if(pdl){var pdv=pdl.textContent.trim();if(pdv)return pdv;}
  var ms=el.querySelector('[class*="select-value-text"],[class*="select-min-line"]');
  if(ms&&ms.textContent.trim())return ms.textContent.trim();
  var ns=el.querySelector('select:not([aria-hidden="true"])');
  if(ns&&ns.selectedIndex>=0){var op=ns.options[ns.selectedIndex];if(op&&op.text.trim())return op.text.trim();}
  var inps=Array.from(el.querySelectorAll('input:not([type=radio]):not([type=checkbox]):not([type=hidden])'));
  return(inps.length===1&&inps[0].value.trim())?inps[0].value.trim():'';
}
function find(ls,n){
  var arr=typeof ls==='string'?[ls]:ls;var count=0;
  var all=Array.from(modal.querySelectorAll('*'));
  for(var i=0;i<all.length;i++){
    var el=all[i];var tag=(el.tagName||'').toLowerCase();
    var isLbl=tag==='mat-label'||tag==='label';
    if(el.childElementCount>0&&!isLbl)continue;
    var t=(el.textContent||'').trim();
    if(arr.some(function(l){return t===l;})){
      if(count===(n||0)){
        var mff=el.closest('mat-form-field,[class*="form-field"],.labeled-dropdown,.md-inputfield');
        if(mff){var v=txt(mff);if(v&&v!==t)return v;}
        var node=el;
        for(var lvl=0;lvl<6;lvl++){node=node.parentElement;if(!node||node===modal)break;var v2=txt(node);if(v2&&v2!==t)return v2;}
      }
      count++;
    }
  }
  return '';
}
function getSelVal(ms2){
  var val='';
  var vt=ms2.querySelector('[class*="select-value-text"],[class*="select-min-line"]');
  if(vt)val=vt.textContent.trim();
  if(!val){var vd=ms2.querySelector('[class*="select-value"]:not([class*="wrapper"]):not([class*="arrow"])');
    if(vd&&!vd.querySelector('[class*="placeholder"]')){var tv=vd.textContent.trim();if(tv&&tv.length<100)val=tv;}}
  if(!val){var tr2=ms2.querySelector('[class*="trigger"]');
    if(tr2){var sps=Array.from(tr2.querySelectorAll('span:not([class*="arrow"]):not([class*="placeholder"])'));
      for(var si=0;si<sps.length;si++){if(sps[si].childElementCount===0){var st=sps[si].textContent.trim();if(st&&st.length>0&&st.length<100){val=st;break;}}}}}
  return val;
}
var selVals=[];
Array.from(modal.querySelectorAll('mat-select')).forEach(function(ms2){
  var ff=ms2.closest('mat-form-field');
  var lbl=ff?(ff.querySelector('mat-label,label')||{textContent:''}).textContent.trim():'';
  selVals.push({label:lbl,val:getSelVal(ms2)});
});
function selV(lbl,n){var m=selVals.filter(function(s){return s.label===lbl;});return(m[n||0]||{val:''}).val;}
var ufs=selVals.filter(function(s){return s.label==='UF';});
function getUF(idx){return(ufs[idx]||{val:''}).val||find('UF',idx);}
function iso(br){var m=(br||'').match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:'';}
function cep(v){var d=(v||'').replace(/\\D/g,'');return d.length>=8?d.slice(0,5)+'-'+d.slice(5,8):v;}
var prof=find('Outra Profissão')||find('Profissão');
var d={Title:find('Nome Completo'),CPF:find(['Número de Inscrição (CPF)','CPF']),RG:find(['Nº Identidade','Identidade']),DataExpedicaoRG:iso(find('Data de Expedição')),OrgaoEmissor:find('Órgão Emissor'),UFDoc:getUF(0),DataNascimento:iso(find('Data de Nascimento')),Nacionalidade:selV('País')||find(['País','Nacionalidade']),Naturalidade:selV('Local de Nascimento')||selV('Naturalidade')||find('Local de Nascimento')||find('Naturalidade'),UFNaturalidade:getUF(1),Profissao:prof,Celular:find(['Telefone 1','Telefone']),Email:find('Email'),NomeMae:find('Nome da Mãe'),NomePai:find('Nome do Pai'),CEP1:cep(find('CEP',0)),Endereco1:find(['Endereço Residencial','Endereço']),UF1Endereco:getUF(2),Cidade1:selV('Cidade',0)||find('Cidade',0),Bairro1:selV('Bairro',0)||find('Bairro',0),Numero1:find(['Nº','Número'],0),Complemento1:find('Complemento',0),CEP2:cep(find('CEP',1)),Endereco2:find(['Segundo Endereço do Acervo','Segundo Endereço']),UF2Endereco:getUF(3),Cidade2:selV('Cidade',1)||find('Cidade',1),Bairro2:selV('Bairro',1)||find('Bairro',1),Numero2:find(['Nº','Número'],1),Complemento2:find('Complemento',1)};
if(!d.Title){alert('Não foi possível encontrar os dados.\\nCertifique-se de que o modal "Visualizar Cadastro Inicial do Solicitante" está aberto.');return;}
var preview=Object.entries(d).filter(function(e){return e[1];}).map(function(e){return e[0]+': '+e[1];}).join('\\n');
if(!confirm('Dados encontrados no SINARM:\\n\\n'+preview+'\\n\\nAbrir o CAC Gestão com esses dados preenchidos?'))return;
window.open(H+'#clientes/novo?importar='+encodeURIComponent(JSON.stringify(d)),'_blank');
})()`;


function getBookmarkletHref() {
  const cacUrl = window.location.origin + window.location.pathname;
  const code = _BM_TEMPLATE.replace('__CAC_URL__', cacUrl.replace(/'/g, "\\'"));
  return 'javascript:' + encodeURIComponent(code);
}

function togglePainelSINARM() {
  const painel = document.getElementById('painel-sinarm');
  if (!painel) return;
  if (painel.style.display === 'none') {
    painel.innerHTML = `
      <div class="card" style="border-color:#86efac;background:#f0fdf4">
        <div class="card-header" style="background:#dcfce7;border-bottom-color:#86efac">
          <h3 style="color:#166534"><i class="bi bi-download me-2"></i>Importar dados do SINARM CAC</h3>
          <button type="button" onclick="togglePainelSINARM()" class="btn btn-ghost btn-sm"><i class="bi bi-x-lg"></i></button>
        </div>
        <div class="card-body">
          <p style="font-size:13px;margin-bottom:12px"><strong>1° uso:</strong> arraste o botão abaixo para sua barra de favoritos (<kbd>Ctrl+Shift+B</kbd> para exibi-la).</p>
          <div style="text-align:center;margin:16px 0">
            <a id="bm-drag-link" class="btn btn-primary" style="cursor:grab;font-size:15px;padding:10px 24px">
              <i class="bi bi-download"></i> Importar para CAC Gestão
            </a>
            <p style="font-size:11px;color:var(--text-muted);margin-top:8px">Arraste este botão para a barra de favoritos</p>
          </div>
          <ol style="font-size:13px;line-height:2;color:var(--text);margin:0;padding-left:20px">
            <li>Acesse o SINARM CAC (<em>servicos.pf.gov.br</em>) e faça login</li>
            <li>Abra a ficha do cliente → clique em <em>"Visualizar Cadastro Inicial do Solicitante"</em></li>
            <li>Com o modal aberto, clique no favorito <strong>"Importar para CAC Gestão"</strong></li>
            <li>Confirme os dados extraídos — o formulário abrirá preenchido aqui</li>
          </ol>
          <p style="font-size:11px;color:var(--text-muted);margin-top:12px"><i class="bi bi-info-circle me-1"></i>O favorito precisa ser reinstalado se a URL do sistema mudar.</p>
        </div>
      </div>`;
    document.getElementById('bm-drag-link').href = getBookmarkletHref();
    painel.style.display = '';
  } else {
    painel.style.display = 'none';
  }
}

const _BM_CERTIDOES = `(async function(){
  var d={};
  function cacBg(inner){
    var o=document.createElement('div');
    o.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);z-index:2147483647;display:flex;align-items:center;justify-content:center';
    o.innerHTML='<div style="background:#fff;padding:20px;border-radius:8px;max-width:440px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,.3);font-family:Arial,sans-serif;color:#111">'+inner+'</div>';
    document.body.appendChild(o);return o;
  }
  function cacAlert(msg){
    return new Promise(function(res){
      var o=cacBg('<p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1e40af">CAC Gestao</p><p style="margin:0 0 14px;font-size:13px;white-space:pre-wrap">'+msg.replace(/</g,'&lt;')+'</p><div style="text-align:right"><button id="_cac_ok" style="padding:5px 16px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer">OK</button></div>');
      o.querySelector('#_cac_ok').onclick=function(){document.body.removeChild(o);res();};
    });
  }
  function cacInput(){
    return new Promise(function(res){
      var o=cacBg('<p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1e40af">CAC Gestao</p><p style="margin:0 0 8px;font-size:13px">Cole os dados do cliente abaixo (Ctrl+V):</p><textarea id="_cac_ta" style="width:100%;height:65px;border:1px solid #ccc;border-radius:4px;padding:6px;font-size:12px;box-sizing:border-box;margin-bottom:10px" placeholder="Cole aqui..."></textarea><div style="text-align:right"><button id="_cac_cancel" style="padding:5px 14px;border:1px solid #ccc;border-radius:4px;background:#f9f9f9;cursor:pointer;margin-right:8px">Cancelar</button><button id="_cac_ok" style="padding:5px 16px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer">OK</button></div>');
      setTimeout(function(){var t=o.querySelector('#_cac_ta');if(t)t.focus();},30);
      o.querySelector('#_cac_ok').onclick=function(){var v=o.querySelector('#_cac_ta').value;document.body.removeChild(o);res(v);};
      o.querySelector('#_cac_cancel').onclick=function(){document.body.removeChild(o);res(null);};
    });
  }
  try{var raw=(await navigator.clipboard.readText()).trim();var j=JSON.parse(raw);if(j.cpf)d=j;}catch(e){}
  if(!d.cpf){
    var pasted=await cacInput();
    if(!pasted)return;
    try{var j2=JSON.parse(pasted.trim());if(j2.cpf)d=j2;}catch(e){d={cpf:pasted.trim()};}
    if(!d.cpf)return;
  }
  var cpfD=(d.cpf||'').replace(/\\D/g,'');
  function dateISO(iso){if(!iso)return'';var p=iso.split('-');return p[2]+'/'+p[1]+'/'+p[0];}
  function fillInput(el,v){
    try{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);}catch(e){el.value=v;}
    ['input','change','blur'].forEach(function(ev){el.dispatchEvent(new Event(ev,{bubbles:true}));});el.focus();
  }
  function findDoc(){
    var frames=document.querySelectorAll('iframe');
    for(var f of frames){try{var fd=f.contentDocument||f.contentWindow.document;if(fd&&fd.querySelector('form')){return fd;}}catch(e){}}
    for(var f of frames){try{var fd=f.contentDocument||f.contentWindow.document;if(fd&&fd.querySelector('input:not([type=hidden])')){return fd;}}catch(e){}}
    return document;
  }
  var D=findDoc();
  function byAttr(k,sc){
    var inps=(sc||D).querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea');
    for(var el of inps){var a=[el.id,el.name,el.placeholder,el.getAttribute('ng-model')||'',el.getAttribute('formcontrolname')||'',el.getAttribute('aria-label')||''].join(' ').toLowerCase();if(a.includes(k))return el;}
    return null;
  }
  function byLabel(k,sc){
    var root=sc||D;
    var nodes=root.querySelectorAll('label,mat-label,th,td,span,div,p,legend,dt');
    for(var nd of nodes){
      if(nd.childElementCount===0&&nd.textContent.trim().toLowerCase().includes(k)){
        var wrap=nd.closest('[class*="form"],[class*="field"],[class*="group"],[class*="col"],tr,mat-form-field');
        if(wrap){var i=wrap.querySelector('input:not([type=hidden]):not([type=checkbox]),textarea');if(i)return i;}
        var sib=nd.nextElementSibling;
        if(sib){var i=sib.tagName==='INPUT'?sib:sib.querySelector('input');if(i)return i;}
        var par=nd.parentElement;if(par){var ps=par.nextElementSibling;if(ps){var i=ps.tagName==='INPUT'?ps:ps.querySelector('input');if(i)return i;}}
      }
    }
    return null;
  }
  function tryFill(el,v,label){if(el&&v){fillInput(el,v);ok.push(label);}else if(!el)miss.push(label);}
  var ok=[],miss=[];
  var h=location.hostname;
  if(h.includes('trf4')){
    tryFill(byAttr('cpf')||byLabel('cpf'),d.cpf,'CPF');
    tryFill(byAttr('nasc')||byLabel('nascimento'),dateISO(d.dataNascimento),'DataNasc');
  }else if(h.includes('tjrs')){
    var sc=D.querySelector('form')||D;
    tryFill(byAttr('nome',sc)||byLabel('nome',sc),d.nome,'Nome');
    tryFill(byAttr('cpf',sc)||byLabel('cpf',sc),cpfD,'CPF');
    tryFill(byAttr('mae',sc)||byLabel('m\\u00e3e',sc)||byLabel('mae',sc),d.nomeMae,'NomeMae');
    tryFill(byAttr('pai',sc)||byLabel('pai',sc),d.nomePai,'NomePai');
    tryFill(byAttr('nasc',sc)||byLabel('nasc',sc),dateISO(d.dataNascimento),'DataNasc');
    var rgEl=byAttr('rg',sc)||byLabel('rg',sc)||byLabel('identidade',sc);
    if(rgEl){
      var rgRow=rgEl.closest('tr,[class*="row"],[class*="group"],[class*="field"]');
      var rgInps=rgRow?Array.from(rgRow.querySelectorAll('input:not([type=hidden])')):[];
      if(rgInps.length>=3){fillInput(rgInps[0],d.rg);fillInput(rgInps[1],d.orgaoEmissor);fillInput(rgInps[2],d.ufRG);ok.push('RG+Orgao+UF');}
      else if(rgInps.length===2){fillInput(rgInps[0],d.rg);fillInput(rgInps[1],d.orgaoEmissor);ok.push('RG');}
      else{fillInput(rgEl,d.rg);ok.push('RG');tryFill(byAttr('orgao',sc)||byLabel('expedidor',sc)||byLabel('emissor',sc),d.orgaoEmissor,'OrgaoEmissor');}
    }else{miss.push('RG');tryFill(byAttr('orgao',sc)||byLabel('expedidor',sc)||byLabel('emissor',sc),d.orgaoEmissor,'OrgaoEmissor');}
    tryFill(byAttr('endereco',sc)||byAttr('logradouro',sc)||byLabel('endere\\u00e7o',sc)||byLabel('logradouro',sc),[d.endereco,d.numero,d.complemento,d.bairro,d.cidade].filter(Boolean).join(', '),'Endereco');
  }else if(h.includes('stm')){
    if(!D.querySelector('form[name="form_certidao"],input[name^="txt_"]')){
      var iframes=document.querySelectorAll('iframe');
      var srcs=Array.from(iframes).map(function(f){return f.src||f.getAttribute('src');}).filter(Boolean);
      await cacAlert('O formulario do STM esta num iframe bloqueado pelo navegador.\\n\\nAbra diretamente esta URL e clique o bookmarklet la:\\n\\n'+(srcs.length?srcs.join('\\n'):'(nenhum iframe encontrado)'));
      return;
    }
    tryFill(D.querySelector('input[name="txt_nome"]'),d.nome,'Nome');
    tryFill(D.querySelector('input[name="txt_nome_mae"]'),d.nomeMae,'NomeMae');
    var c1=D.querySelector('input[name="txt_cpf1"]'),c2=D.querySelector('input[name="txt_cpf2"]'),c3=D.querySelector('input[name="txt_cpf3"]'),c4=D.querySelector('input[name="txt_dv"]');
    if(c1&&c2&&c3&&c4){fillInput(c1,cpfD.substring(0,3));fillInput(c2,cpfD.substring(3,6));fillInput(c3,cpfD.substring(6,9));fillInput(c4,cpfD.substring(9,11));ok.push('CPF');}else miss.push('CPF');
    var da=D.querySelector('input[name="txt_dia"]'),dm=D.querySelector('input[name="txt_mes"]'),dy=D.querySelector('input[name="txt_ano"]');
    if(da&&dm&&dy){var dp=dateISO(d.dataNascimento).split('/');fillInput(da,dp[0]);fillInput(dm,dp[1]);fillInput(dy,dp[2]);ok.push('DataNasc');}else miss.push('DataNasc');
  }else if(h.includes('tse')){
    tryFill(byAttr('nome')||byLabel('nome'),d.nome,'Nome');
    tryFill(byAttr('cpf')||byLabel('cpf'),d.cpf,'CPF');
    tryFill(byAttr('nasc')||byLabel('nascimento'),dateISO(d.dataNascimento),'DataNasc');
    tryFill(byAttr('mae')||byLabel('m\\u00e3e')||byLabel('mae'),d.nomeMae,'NomeMae');
    tryFill(byAttr('pai')||byLabel('pai'),d.nomePai,'NomePai');
  }else{
    var cpfEl2=byAttr('cpf')||byLabel('cpf');tryFill(cpfEl2,d.cpf,'CPF');
  }
  var msg=ok.length+' campo(s) preenchido(s): '+ok.join(', ')+'.'+(miss.length?'\\n\\nNao encontrado(s): '+miss.join(', ')+'.':'');
  await cacAlert(msg);
})();`;

function getCertidoesBookmarkletHref() {
  return 'javascript:' + encodeURIComponent(_BM_CERTIDOES);
}

function togglePainelCertidoes() {
  const painel = document.getElementById('painel-certidoes');
  if (!painel) return;
  if (painel.style.display === 'none') {
    painel.innerHTML = `
      <div class="card" style="border-color:#bfdbfe;background:#eff6ff;margin:0">
        <div class="card-header" style="background:#dbeafe;border-bottom-color:#bfdbfe;padding:10px 16px">
          <h3 style="font-size:13px;color:#1e40af"><i class="bi bi-bookmark-check me-1"></i>Bookmarklet — Certidões CAC</h3>
          <button onclick="togglePainelCertidoes()" class="btn btn-ghost btn-sm"><i class="bi bi-x-lg"></i></button>
        </div>
        <div class="card-body" style="padding:12px 16px">
          <p style="font-size:13px;margin:0 0 10px">Arraste o botão abaixo para a barra de favoritos (<kbd>Ctrl+Shift+B</kbd>). Ao clicar "Emitir", os dados do cliente são copiados — clique o favorito no site para preencher automaticamente.</p>
          <div style="text-align:center;margin-bottom:8px">
            <a id="bm-cert-link" class="btn btn-sm" style="cursor:grab;background:#b45309;color:#fff;border-color:#b45309">
              <i class="bi bi-bookmark-plus"></i> Copiador de Dados Certidões
            </a>
          </div>
          <p style="font-size:12px;color:var(--text-muted);margin:0">Funciona nos 4 sites: TRF4, TJRS, STM, TSE</p>
        </div>
      </div>`;
    document.getElementById('bm-cert-link').href = getCertidoesBookmarkletHref();
    painel.style.display = '';
  } else {
    painel.style.display = 'none';
  }
}
