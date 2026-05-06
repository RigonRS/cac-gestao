/* ============================================================
   SISTEMA CAC GESTÃO — Lógica Principal
   ============================================================ */

// ---- ESTADO GLOBAL ----
const App = {
  graph: null,
  account: null,
  msal: null,

  // Cache de dados (evita recarregar a cada navegação)
  _cache: { clientes: null, armas: null, documentos: null, processos: null },
  invalidateCache(tipo) { if (tipo) this._cache[tipo] = null; else this._cache = { clientes: null, armas: null, documentos: null, processos: null }; },

  async getClientes()   { if (!this._cache.clientes)   this._cache.clientes   = await this.graph.getItems(CONFIG.listas.clientes);   return this._cache.clientes; },
  async getArmas()      { if (!this._cache.armas)      this._cache.armas      = await this.graph.getItems(CONFIG.listas.armas);      return this._cache.armas; },
  async getDocumentos() { if (!this._cache.documentos) this._cache.documentos = await this.graph.getItems(CONFIG.listas.documentos); return this._cache.documentos; },
  async getProcessos()  { if (!this._cache.processos)  this._cache.processos  = await this.graph.getItems(CONFIG.listas.processos);  return this._cache.processos; },
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
function toTitleCase(s) {
  if (!s) return '';
  return s.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
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
  { keyword: 'Militar',   label: 'Justiça Militar (STM)',    url: 'https://www.stm.jus.br/servicos-ao-cidadao/atendimentoaocidadao/certidao-negativa' },
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
          <div><label>Órgão Emissor</label><input name="OrgaoEmissor" value="${val('OrgaoEmissor')}" /></div>
          <div><label>UF (RG)</label><input name="UFDoc" value="${val('UFDoc')}" maxlength="2" style="text-transform:uppercase" /></div>
          <div><label>Data de Expedição (RG)</label><input type="date" name="DataExpedicaoRG" value="${dateVal('DataExpedicaoRG')}" /></div>
          <div><label>Data de Validade RG ou CNH</label><input type="date" name="DataValidadeRGouCNH" value="${dateVal('DataValidadeRGouCNH')}" /></div>
          <div><label>Data de Nascimento</label><input type="date" name="DataNascimento" value="${dateVal('DataNascimento')}" /></div>
          <div><label>Nacionalidade</label><input name="Nacionalidade" value="${val('Nacionalidade')}" /></div>
          <div><label>Naturalidade</label><input name="Naturalidade" value="${val('Naturalidade')}" /></div>
          <div><label>UF Naturalidade</label><input name="UFNaturalidade" value="${val('UFNaturalidade')}" maxlength="2" style="text-transform:uppercase" /></div>
          <div><label>Profissão</label><input name="Profissao" value="${val('Profissao')}" /></div>
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
          <div><label>Data de Expedição CTF</label><input type="date" name="DataExpedicaoCTF" value="${dateVal('DataExpedicaoCTF')}" /></div>
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
          <div style="grid-column:span 2"><label>Nome do Clube de Tiro</label><input name="NomeClubeAtiro" value="${val('NomeClubeAtiro')}" /></div>
          <div><label>Cidade</label><input name="CidadeClubeAtiro" value="${val('CidadeClubeAtiro')}" /></div>
          <div><label>UF</label><input name="UFClubeAtiro" value="${val('UFClubeAtiro')}" maxlength="2" style="text-transform:uppercase" /></div>
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
    OrgaoEmissor:     toTitleCase(fd.get('OrgaoEmissor')),
    UFDoc:            fd.get('UFDoc').toUpperCase(),
    DataNascimento:   fd.get('DataNascimento') || null,
    DataExpedicaoRG:  fd.get('DataExpedicaoRG') || null,
    DataValidadeRGouCNH: fd.get('DataValidadeRGouCNH') || null,
    Nacionalidade:    toTitleCase(fd.get('Nacionalidade')),
    Naturalidade:     toTitleCase(fd.get('Naturalidade')),
    UFNaturalidade:   fd.get('UFNaturalidade').toUpperCase(),
    Profissao:        toTitleCase(fd.get('Profissao')),
    Celular:          fd.get('Celular'),
    Email:            fd.get('Email'),
    NomeMae:          toTitleCase(fd.get('NomeMae')),
    NomePai:          toTitleCase(fd.get('NomePai')),
    NomeClubeAtiro:   toTitleCase(fd.get('NomeClubeAtiro')),
    CidadeClubeAtiro: toTitleCase(fd.get('CidadeClubeAtiro')),
    UFClubeAtiro:     (fd.get('UFClubeAtiro') || '').toUpperCase(),
    Categoria:        cats.join(','),
    DataExpedicaoCTF: fd.get('DataExpedicaoCTF') || null,
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
        ${dateRow('Data de Nascimento', 'DataNascimento')} ${row('Nacionalidade', c.Nacionalidade)}
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
        ${row('Nome do Clube de Tiro', c.NomeClubeAtiro)}
        ${row('Cidade', c.CidadeClubeAtiro)} ${row('UF', c.UFClubeAtiro)}
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

  document.getElementById('page-content').innerHTML = `
  <div style="margin-bottom:12px"><span style="color:var(--text-muted);font-size:13px">Cliente: </span><strong>${esc(cliente.Title)}</strong></div>
  <form id="form-arma" onsubmit="salvarArma(event,'${clienteId}','${id||''}')">
    <div class="form-section">
      <div class="form-section-title">Identificação da Arma</div>
      <div class="form-body">
        <div class="form-grid">
          <div><label>Número de Série *</label><input name="NumeroSerie" value="${val('NumeroSerie')}" required /></div>
          <div><label>Número SIGMA</label><input name="NumeroSIGMA" value="${val('NumeroSIGMA')}" /></div>
          <div><label>Atividade Cadastrada *</label>
            <select name="AtividadeCadastrada" required>
              <option value="">Selecione...</option>
              ${atividadeOpts}
            </select>
          </div>
          <div><label>Marca *</label><input name="Marca" value="${val('Marca')}" required /></div>
          <div><label>Modelo *</label><input name="Modelo" value="${val('Modelo')}" required /></div>
          <div><label>Espécie</label><input name="Especie" value="${val('Especie')}" /></div>
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
          <div><label>N° de Canos</label><input name="NumeroCanos" value="${val('NumeroCanos')}" /></div>
          <div><label>Alma do Cano</label><input name="AlmaCano" value="${val('AlmaCano')}" /></div>
          <div><label>N° de Raias</label><input name="NumeroRaias" value="${val('NumeroRaias')}" /></div>
          <div><label>Sentido das Raias</label>
            <select name="SentidoRaias">
              <option value="">Selecione...</option>
              <option value="Não tem" ${sel('SentidoRaias','Não tem')}>Não tem</option>
              <option value="Direita"  ${sel('SentidoRaias','Direita')}>Direita</option>
              <option value="Esquerda" ${sel('SentidoRaias','Esquerda')}>Esquerda</option>
            </select>
          </div>
          <div><label>Acabamento</label><input name="Acabamento" value="${val('Acabamento')}" /></div>
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
    NumeroSIGMA:       fd.get('NumeroSIGMA'),
    AtividadeCadastrada: atividade,
    Modelo:            fd.get('Modelo'),
    Calibre:           fd.get('Calibre'),
    Especie:           fd.get('Especie'),
    Marca:             fd.get('Marca'),
    GrupoCalibre:      grupoCal,
    PaisFabricacao:    fd.get('PaisFabricacao'),
    CapacidadeTiro:    fd.get('CapacidadeTiro'),
    NumeroCanos:       fd.get('NumeroCanos'),
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

async function onClienteProcessoChange(clienteId) {
  if (!clienteId) return;
  _processoArmasCache = (await App.getArmas()).filter(a => String(a.ClienteId) === String(clienteId));
  const tipo = document.querySelector('[name="TipoProcesso"]')?.value;
  if (tipo) onTipoProcessoChange(tipo);
}

function onTipoProcessoChange(tipo) {
  const clienteId = document.querySelector('[name="ClienteId"]')?.value;
  const camposEl = document.getElementById('campos-tipo-processo');
  const checklistEl = document.getElementById('checklist-preview');
  const secaoChecklist = document.getElementById('secao-checklist');

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
    if (tipo === 'Mudança de Acervo') camposEl.innerHTML += buildCamposMudancaAcervo();
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

function buildCamposMudancaAcervo() {
  return `<div style="padding:0 20px 20px"><div class="form-grid">
    <div><label>Acervo Atual</label><input name="proc_acervoAtual" placeholder="Preenchido automaticamente..." readonly /></div>
    <div><label>Acervo de Destino</label><select name="proc_acervoDestino"><option value="">Selecione...</option><option>Colecionador</option><option>Atirador</option><option>Caçador</option></select></div>
  </div></div>`;
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
          <div style="grid-column:span 2"><label>Endereço Residencial</label><input name="proc_endVendedor" /></div>
          <div><label>N°</label><input name="proc_numVendedor" /></div>
          <div><label>CEP</label><input name="proc_cepVendedor" oninput="this.value=fmtCEP(this.value)" maxlength="9" /></div>
          <div><label>UF</label><input name="proc_ufVendedor" maxlength="2" style="text-transform:uppercase" /></div>
          <div><label>Município</label><input name="proc_municipioVendedor" /></div>
          <div><label>Bairro</label><input name="proc_bairroVendedor" /></div>
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

// ============================================================
// PROCESSOS — DETALHE
// ============================================================
async function renderProcessoDetalhe(id) {
  document.getElementById('page-title').textContent = 'Detalhe do Processo';
  const processo = await App.graph.getItem(CONFIG.listas.processos, id);
  const checklist = JSON.parse(processo.ChecklistJSON || '[]');
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
            ${temCertidoes ? `<button class="btn btn-ghost btn-sm" onclick="togglePainelCertidoes()" title="Instalar bookmarklet de certidões"><i class="bi bi-bookmark-plus"></i></button>` : ''}
          </div>
          ${temCertidoes ? `<div id="painel-certidoes" style="display:none;border-top:1px solid var(--border)"></div>` : ''}
          <div class="card-body">
            <div class="checklist-progress">
              <div class="progress-bar-wrap"><div class="progress-bar" style="width:${progPct}%"></div></div>
              <span class="progress-text">${progConcluido}/${progTotal}</span>
            </div>
            ${checklist.map((item, i) => {
              const certCfg = CERTIDOES_CONFIG.find(c => item.nome.includes(c.keyword));
              return `
              <div class="checklist-item ${item.concluido?'done':''}" id="clp-${i}">
                <input type="checkbox" ${item.concluido?'checked':''} onchange="atualizarChecklistItem('${id}',${i},this.checked,document.getElementById('clpobs-${i}').value)" />
                <div class="checklist-nome" style="display:flex;align-items:center;gap:6px">
                  <span>${esc(item.nome)}</span>
                  ${certCfg ? `<button onclick="abrirCertidao('${certCfg.keyword}')" class="btn btn-ghost btn-xs" style="font-size:11px;padding:1px 7px;height:auto;white-space:nowrap" title="Abrir site e copiar dados do cliente"><i class="bi bi-box-arrow-up-right"></i> Emitir</button>` : ''}
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
  try{var raw=(await navigator.clipboard.readText()).trim();var j=JSON.parse(raw);if(j.cpf)d=j;}catch(e){}
  if(!d.cpf){var manual=prompt('CPF do cliente:');if(!manual)return;d={cpf:manual.trim()};}
  var cpfD=(d.cpf||'').replace(/\\D/g,'');
  function dateISO(iso){if(!iso)return'';var p=iso.split('-');return p[2]+'/'+p[1]+'/'+p[0];}
  function fillInput(el,v){
    try{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);}catch(e){el.value=v;}
    ['input','change','blur'].forEach(function(ev){el.dispatchEvent(new Event(ev,{bubbles:true}));});el.focus();
  }
  function byAttr(k){
    var inps=document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea');
    for(var el of inps){var a=[el.id,el.name,el.placeholder,el.getAttribute('ng-model')||'',el.getAttribute('formcontrolname')||'',el.getAttribute('aria-label')||''].join(' ').toLowerCase();if(a.includes(k))return el;}
    return null;
  }
  function byLabel(k){
    var nodes=document.querySelectorAll('label,th,td,span,div,p');
    for(var nd of nodes){
      if(nd.childElementCount===0&&nd.textContent.trim().toLowerCase().includes(k)){
        var wrap=nd.closest('[class*="form"],[class*="field"],[class*="group"],[class*="col"],tr');
        if(wrap){var i=wrap.querySelector('input:not([type=hidden]):not([type=checkbox]),textarea');if(i)return i;}
        var sib=nd.nextElementSibling;
        if(sib){var i=sib.tagName==='INPUT'?sib:sib.querySelector('input');if(i)return i;}
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
    tryFill(byAttr('nome')||byLabel('nome'),d.nome,'Nome');
    tryFill(byAttr('cpf')||byLabel('cpf'),d.cpf,'CPF');
    tryFill(byAttr('mae')||byLabel('m\\u00e3e')||byLabel('mae'),d.nomeMae,'NomeMae');
    tryFill(byAttr('pai')||byLabel('pai'),d.nomePai,'NomePai');
    tryFill(byAttr('nasc')||byLabel('nascimento'),dateISO(d.dataNascimento),'DataNasc');
    tryFill(byAttr('rg')||byLabel('identidade')||byLabel('rg'),d.rg,'RG');
    tryFill(byAttr('orgao')||byLabel('expedidor')||byLabel('emissor'),d.orgaoEmissor,'OrgaoEmissor');
    tryFill(byAttr('endereco')||byAttr('logradouro')||byLabel('endere\\u00e7o')||byLabel('logradouro'),(d.endereco+(d.numero?' '+d.numero:'')+(d.complemento?' '+d.complemento:'')).trim(),'Endereco');
    tryFill(byAttr('bairro')||byLabel('bairro'),d.bairro,'Bairro');
    tryFill(byAttr('cidade')||byAttr('municipio')||byLabel('cidade')||byLabel('munic\\u00edpio'),d.cidade,'Cidade');
  }else if(h.includes('stm')){
    tryFill(byAttr('nome')||byLabel('nome'),d.nome,'Nome');
    tryFill(byAttr('mae')||byLabel('m\\u00e3e')||byLabel('mae'),d.nomeMae,'NomeMae');
    var cpfEl=byAttr('cpf')||byLabel('cpf');
    if(cpfEl){
      var row=cpfEl.closest('tr,[class*="row"],[class*="group"],[class*="field"]');
      var cpfInps=row?Array.from(row.querySelectorAll('input:not([type=hidden])')):[];
      if(cpfInps.length>=4){fillInput(cpfInps[0],cpfD.substring(0,3));fillInput(cpfInps[1],cpfD.substring(3,6));fillInput(cpfInps[2],cpfD.substring(6,9));fillInput(cpfInps[3],cpfD.substring(9,11));ok.push('CPF');}
      else if(cpfInps.length===2){fillInput(cpfInps[0],cpfD.substring(0,9));fillInput(cpfInps[1],cpfD.substring(9,11));ok.push('CPF');}
      else{fillInput(cpfEl,cpfD);ok.push('CPF');}
    }else miss.push('CPF');
    var dtEl=byAttr('nasc')||byLabel('nascimento');
    if(dtEl){
      var dp=dateISO(d.dataNascimento).split('/');
      var dtRow=dtEl.closest('tr,[class*="row"],[class*="group"],[class*="field"]');
      var dtInps=dtRow?Array.from(dtRow.querySelectorAll('input:not([type=hidden])')):[];
      if(dtInps.length>=3){fillInput(dtInps[0],dp[0]);fillInput(dtInps[1],dp[1]);fillInput(dtInps[2],dp[2]);ok.push('DataNasc');}
      else{fillInput(dtEl,dateISO(d.dataNascimento));ok.push('DataNasc');}
    }else miss.push('DataNasc');
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
  alert(msg);
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
            <a id="bm-cert-link" class="btn btn-primary btn-sm" style="cursor:grab">
              <i class="bi bi-bookmark-plus"></i> Certidão CAC
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
