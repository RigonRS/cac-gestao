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
function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
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
      const iso = c.DataValidadeCR.length === 10 ? c.DataValidadeCR : c.DataValidadeCR.split('T')[0];
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

// ============================================================
// CLIENTES — LISTA
// ============================================================
async function renderClientesList() {
  document.getElementById('page-title').textContent = 'Clientes';
  const clientes = await App.getClientes();

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
            <th>Nome</th><th>CPF</th><th>Celular</th>
            <th>N° CR</th><th>Val. CR</th><th>Categorias</th><th>Ações</th>
          </tr></thead>
          <tbody id="tbody-clientes">${renderClientesRows(clientes)}</tbody>
        </table>
      </div>
    </div>`;
  window._clientes_filtro = clientes;
}

function renderClientesRows(lista) {
  if (!lista.length) return `<tr><td colspan="7"><div class="empty-state"><i class="bi bi-people"></i><p>Nenhum cliente encontrado.</p><button class="btn btn-primary" onclick="navigate('clientes/novo')">Cadastrar primeiro cliente</button></div></td></tr>`;
  return lista.map(c => {
    const s = validadeStatus(c.DataValidadeCR || null);
    const cats = (c.Categoria || '').split(',').filter(Boolean).map(ct => `<span class="badge badge-blue" style="margin-right:3px">${esc(ct.trim())}</span>`).join('');
    return `<tr>
      <td><a style="font-weight:600;cursor:pointer;color:var(--accent)" onclick="navigate('clientes/perfil',{id:'${c.id}'})">${esc(c.Title)}</a></td>
      <td>${esc(c.CPF || '—')}</td>
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
          <div><label>Data de Validade do CR</label><input name="DataValidadeCR" value="${val('DataValidadeCR')}" placeholder="DD/MM/AAAA" /></div>
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
    Title:            fd.get('NomeCompleto').trim(),
    CPF:              fd.get('CPF'),
    SenhaGOV:         fd.get('SenhaGOV'),
    NumeroCR:         fd.get('NumeroCR'),
    DataValidadeCR:   fd.get('DataValidadeCR'),
    RG:               fd.get('RG'),
    OrgaoEmissor:     fd.get('OrgaoEmissor'),
    UFDoc:            fd.get('UFDoc').toUpperCase(),
    DataNascimento:   fd.get('DataNascimento') || null,
    DataExpedicaoRG:  fd.get('DataExpedicaoRG') || null,
    DataValidadeRGouCNH: fd.get('DataValidadeRGouCNH') || null,
    Nacionalidade:    fd.get('Nacionalidade'),
    Naturalidade:     fd.get('Naturalidade'),
    UFNaturalidade:   fd.get('UFNaturalidade').toUpperCase(),
    Profissao:        fd.get('Profissao'),
    Celular:          fd.get('Celular'),
    Email:            fd.get('Email'),
    NomeMae:          fd.get('NomeMae'),
    NomePai:          fd.get('NomePai'),
    Categoria:        cats.join(','),
    DataExpedicaoCTF: fd.get('DataExpedicaoCTF') || null,
    DataValidadeCTF:  fd.get('DataValidadeCTF') || null,
    CEP1:             fd.get('CEP1'),
    Endereco1:        fd.get('Endereco1'),
    Numero1:          fd.get('Numero1'),
    Complemento1:     fd.get('Complemento1'),
    Bairro1:          fd.get('Bairro1'),
    Cidade1:          fd.get('Cidade1'),
    UF1Endereco:      fd.get('UF1Endereco').toUpperCase(),
    CEP2:             fd.get('CEP2'),
    Endereco2:        fd.get('Endereco2'),
    Numero2:          fd.get('Numero2'),
    Complemento2:     fd.get('Complemento2'),
    Bairro2:          fd.get('Bairro2'),
    Cidade2:          fd.get('Cidade2'),
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
  const dateRow = (label, f) => row(label, c[f] ? fmtDate(c[f].split('T')[0]) : '');
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
        ${row('N° CR', c.NumeroCR)} ${row('Validade CR', c.DataValidadeCR)}
        ${row('Categorias', (c.Categoria||'').replace(/,/g,', '))}
      </div></div>
    </div>
    ${isCacador ? `
    <div class="form-section">
      <div class="form-section-title">CTF — Caçador</div>
      <div class="form-body"><div class="info-grid">
        ${dateRow('Data de Expedição CTF', 'DataExpedicaoCTF')}
        <div class="info-item"><label>Data de Validade CTF</label>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div class="value ${!c.DataValidadeCTF?'empty':''}">${c.DataValidadeCTF ? fmtDate(c.DataValidadeCTF.split('T')[0]) : 'Não informado'}</div>
            ${c.DataExpedicaoCTF ? `<button class="btn btn-outline btn-sm" onclick="renovarCTF('${c.id}')"><i class="bi bi-arrow-clockwise"></i> Renovar +90d</button>` : ''}
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
    </div>` : ''}
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
      <td><span class="badge ${b.cls}">${b.txt}</span></td>
      <td><div class="btn-group">
        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();navigate('processos/detalhe',{id:'${p.id}'})"><i class="bi bi-eye"></i></button>
        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();navigate('processos/editar',{id:'${p.id}'})"><i class="bi bi-pencil"></i></button>
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
          <div><label>N° Protocolo</label><input name="NumeroProtocolo" /></div>
          <div><label>Data de Protocolo no Sistema</label><input type="date" name="DataProtocoloSistema" value="${new Date().toISOString().split('T')[0]}" /></div>
          <div><label>Status</label>
            <select name="Status">
              ${STATUS_PROCESSO.map(s => `<option value="${s}" ${s==='Aguardando Documentos'?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div><label>Data de Última Conferência</label><input type="date" name="DataUltimaConferencia" /></div>
          <div><label>Data de Abertura</label><input type="date" name="DataAbertura" value="${new Date().toISOString().split('T')[0]}" /></div>
          <div><label>Prazo</label><input type="date" name="DataPrazo" /></div>
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
          <div><label>Data de Pagamento</label><input type="date" name="DataPagamento" /></div>
        </div>
        <div id="campos-parcelado" style="display:none;margin-top:16px">
          <div class="form-grid">
            <div><label>Quantas Vezes</label>
              <select name="NumeroParcelas" onchange="calcularParcelas()">
                <option value="">Selecione...</option>
                ${[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>`<option value="${n}">${n}x</option>`).join('')}
              </select>
            </div>
            <div><label>Valor de Entrada (R$)</label><input type="number" name="ValorEntrada" step="0.01" min="0" placeholder="0,00" oninput="calcularParcelas()" /></div>
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
  const armasOpts = _processoArmasCache.map(a => `<option value="${a.id}|${esc(a.AtividadeCadastrada||'')}|${esc(a.NumeroSerie||'')} ${esc(a.Marca||'')} ${esc(a.Modelo||'')}">${esc(a.NumeroSerie||'')} — ${esc(a.Marca||'')} ${esc(a.Modelo||'')} (${esc(a.AtividadeCadastrada||'')})</option>`).join('');

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
      <div><label>Arma *</label><select name="proc_armaId" required><option value="">Selecione...</option>${armasOpts}</select></div>
    </div>
  </div></div>`;
}

function buildCamposMudancaAcervo() {
  return `<div style="padding:0 20px 20px"><div class="form-grid">
    <div><label>Acervo Atual</label><input name="proc_acervoAtual" placeholder="Preenchido automaticamente..." readonly /></div>
    <div><label>Acervo de Destino</label><select name="proc_acervoDestino"><option value="">Selecione...</option><option>Colecionador</option><option>Atirador</option><option>Caçador</option></select></div>
  </div></div>`;
}

function buildCamposTransferencia(armasOpts) {
  return `<div class="form-section"><div class="form-section-title">Transferência de Arma</div><div class="form-body">
    <div style="margin-bottom:16px">
      <label class="checkbox-item" style="font-size:14px;font-weight:600">
        <input type="checkbox" name="proc_clienteVende" onchange="onClienteVendeChange(this.checked)" /> O cliente está vendendo a arma?
      </label>
    </div>
    <div id="proc-vende" style="display:none"><div class="form-grid">
      <div><label>Arma (do cliente)</label><select name="proc_armaId"><option value="">Selecione...</option>${armasOpts}</select></div>
      <div><label>Nome do Comprador</label><input name="proc_nomeComprador" /></div>
      <div><label>CPF do Comprador</label><input name="proc_cpfComprador" oninput="this.value=fmtCPF(this.value)" maxlength="14" /></div>
    </div></div>
    <div id="proc-compra" style="display:none"><div class="form-grid">
      <div><label>Arma (descreva)</label><input name="proc_descricaoArma" /></div>
      <div><label>Nome do Vendedor</label><input name="proc_nomeVendedor" /></div>
      <div><label>CPF do Vendedor</label><input name="proc_cpfVendedor" oninput="this.value=fmtCPF(this.value)" maxlength="14" /></div>
    </div></div>
  </div></div>`;
}

function onClienteVendeChange(checked) {
  document.getElementById('proc-vende').style.display  = checked ? '' : 'none';
  document.getElementById('proc-compra').style.display = checked ? 'none' : '';
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
    NumeroProtocolo:        fd.get('NumeroProtocolo') || '',
    DataProtocoloSistema:   fd.get('DataProtocoloSistema') || null,
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

  const statusOpts = STATUS_PROCESSO
    .map(s => `<option value="${s}" ${processo.Status===s?'selected':''}>${s}</option>`).join('');

  const celular = (processo.ClienteNome ? '' : '');

  document.getElementById('page-content').innerHTML = `
    <div class="card" style="margin-bottom:20px">
      <div class="card-body" style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px">
        <div>
          <div style="font-size:18px;font-weight:700;margin-bottom:4px">${esc(processo.TipoProcesso||'—')}</div>
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
          <div class="card-header"><h3><i class="bi bi-list-check me-2"></i>Checklist</h3></div>
          <div class="card-body">
            <div class="checklist-progress">
              <div class="progress-bar-wrap"><div class="progress-bar" style="width:${progPct}%"></div></div>
              <span class="progress-text">${progConcluido}/${progTotal}</span>
            </div>
            ${checklist.map((item, i) => `
              <div class="checklist-item ${item.concluido?'done':''}" id="clp-${i}">
                <input type="checkbox" ${item.concluido?'checked':''} onchange="atualizarChecklistItem('${id}',${i},this.checked,document.getElementById('clpobs-${i}').value)" />
                <div class="checklist-nome">${esc(item.nome)}</div>
                <div class="checklist-obs"><input type="text" id="clpobs-${i}" value="${esc(item.observacao||'')}" placeholder="Observação..." onblur="atualizarChecklistItem('${id}',${i},document.querySelector('#clp-${i} input[type=checkbox]').checked,this.value)" /></div>
              </div>`).join('')}
          </div>
        </div>` : ''}

        ${Object.keys(dadosEsp).length > 0 ? `
        <div class="card">
          <div class="card-header"><h3><i class="bi bi-info-circle me-2"></i>Dados do Processo</h3></div>
          <div class="card-body">
            <div class="info-grid">
              ${Object.entries(dadosEsp).filter(([,v]) => v).map(([k,v]) =>
                `<div class="info-item"><label>${esc(k.replace(/([A-Z])/g,' $1').trim())}</label><div class="value">${esc(v)}</div></div>`
              ).join('')}
            </div>
          </div>
        </div>` : ''}
      </div>

      <div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><h3><i class="bi bi-arrow-repeat me-2"></i>Status</h3></div>
          <div class="card-body">
            <label>Status Atual</label>
            <select id="sel-status" onchange="atualizarStatus('${id}',this.value)" style="margin-bottom:12px">
              ${statusOpts}
            </select>
            <span class="badge ${b.cls}" style="font-size:13px">${b.txt}</span>
            <div style="margin-top:16px">
              <button class="btn btn-whatsapp" style="width:100%" onclick="abrirWhatsApp('${id}')">
                <i class="bi bi-whatsapp"></i> Avisar Cliente via WhatsApp
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3><i class="bi bi-cash-coin me-2"></i>Pagamento</h3></div>
          <div class="card-body">
            <form onsubmit="salvarPagamento(event,'${id}')">
              <label>Valor do Processo (R$)</label>
              <input type="number" name="ValorProcesso" step="0.01" min="0" value="${processo.ValorProcesso||''}" style="margin-bottom:10px" oninput="calcularParcelasDetalhe()" placeholder="0,00" />
              <label>Tipo de Pagamento</label>
              <div class="checkbox-group" style="margin-bottom:10px">
                <label class="checkbox-item"><input type="radio" name="TipoPagamento" value="À vista" ${(!processo.TipoPagamento||processo.TipoPagamento==='À vista')?'checked':''} onchange="onTipoPagamentoDetalheChange(this.value)" /> À vista</label>
                <label class="checkbox-item"><input type="radio" name="TipoPagamento" value="Parcelado" ${processo.TipoPagamento==='Parcelado'?'checked':''} onchange="onTipoPagamentoDetalheChange(this.value)" /> Parcelado</label>
              </div>
              <label>Forma de Pagamento</label>
              <select name="FormaPagamento" style="margin-bottom:10px">
                <option value="">Selecione...</option>
                <option value="Pix" ${processo.FormaPagamento==='Pix'?'selected':''}>Pix</option>
                <option value="Dinheiro" ${processo.FormaPagamento==='Dinheiro'?'selected':''}>Dinheiro</option>
                <option value="Cartão" ${processo.FormaPagamento==='Cartão'?'selected':''}>Cartão</option>
              </select>
              <label>Data de Pagamento</label>
              <input type="date" name="DataPagamento" value="${processo.DataPagamento?processo.DataPagamento.split('T')[0]:''}" style="margin-bottom:10px" />
              <div id="campos-parcelado-detalhe" style="display:${processo.TipoPagamento==='Parcelado'?'block':'none'}">
                <label>Quantas Vezes</label>
                <select name="NumeroParcelas" style="margin-bottom:10px" onchange="calcularParcelasDetalhe()">
                  <option value="">Selecione...</option>
                  ${[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>`<option value="${n}" ${processo.NumeroParcelas==n?'selected':''}>${n}x</option>`).join('')}
                </select>
                <label>Valor de Entrada (R$)</label>
                <input type="number" name="ValorEntrada" step="0.01" min="0" value="${processo.ValorEntrada||''}" style="margin-bottom:10px" oninput="calcularParcelasDetalhe()" placeholder="0,00" />
                <label>Valor das Parcelas (R$)</label>
                <input type="text" id="valor-parcelas-display-det" readonly value="${processo.ValorParcelas ? fmtMoeda(processo.ValorParcelas) : ''}" style="margin-bottom:10px" placeholder="Calculado automaticamente" />
                <input type="hidden" name="ValorParcelas" id="valor-parcelas-input-det" value="${processo.ValorParcelas||''}" />
                <label>Data de Vencimento das Parcelas</label>
                <input type="date" name="DataVencimentoParcelas" value="${processo.DataVencimentoParcelas?processo.DataVencimentoParcelas.split('T')[0]:''}" style="margin-bottom:10px" />
              </div>
              <button type="submit" class="btn btn-outline" style="width:100%"><i class="bi bi-floppy"></i> Salvar Pagamento</button>
            </form>
            ${processo.ValorProcesso ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:13px">
              <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">Valor total:</span><strong>${fmtMoeda(processo.ValorProcesso)}</strong></div>
              ${processo.TipoPagamento==='Parcelado' && processo.NumeroParcelas ? `<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">${processo.NumeroParcelas}x de:</span><strong>${fmtMoeda(processo.ValorParcelas)}</strong></div>` : ''}
            </div>` : ''}
          </div>
        </div>

        <div class="card" style="margin-top:16px">
          <div class="card-header"><h3><i class="bi bi-calendar3 me-2"></i>Datas</h3></div>
          <div class="card-body">
            <form onsubmit="salvarDatasProcesso(event,'${id}')">
              <label>Protocolo no Sistema</label>
              <input type="date" name="DataProtocoloSistema" value="${processo.DataProtocoloSistema?processo.DataProtocoloSistema.split('T')[0]:''}" style="margin-bottom:10px" />
              <label>Última Conferência</label>
              <input type="date" name="DataUltimaConferencia" value="${processo.DataUltimaConferencia?processo.DataUltimaConferencia.split('T')[0]:''}" style="margin-bottom:14px" />
              <button type="submit" class="btn btn-outline" style="width:100%"><i class="bi bi-floppy"></i> Salvar Datas</button>
            </form>
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
      DataProtocoloSistema:  fd.get('DataProtocoloSistema') || null,
      DataUltimaConferencia: fd.get('DataUltimaConferencia') || null,
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
      const iso = c.DataValidadeCR.length === 10 ? c.DataValidadeCR : c.DataValidadeCR.split('T')[0];
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

  itens.sort((a, b) => (a.dias ?? 9999) - (b.dias ?? 9999));
  window._validades_todos = itens;

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
          <thead><tr><th>Cliente</th><th>Documento</th><th>Vencimento</th><th>Situação</th><th></th></tr></thead>
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

// ============================================================
// PAGAMENTOS — PÁGINA DE PENDENTES
// ============================================================
async function renderPagamentos() {
  document.getElementById('page-title').textContent = 'Pagamentos Pendentes';
  const [clientes, processos] = await Promise.all([App.getClientes(), App.getProcessos()]);

  // Mostra: processos Parcelado (sempre pendentes por natureza) OU processos sem data de pagamento
  const pendentes = processos.filter(p =>
    p.ValorProcesso &&
    !STATUS_FECHADOS.includes(p.Status) &&
    (p.TipoPagamento === 'Parcelado' || !p.DataPagamento)
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

  const grupos = Object.values(porCliente).sort((a, b) => {
    const dataA = a.processos[0]?.DataVencimentoParcelas || a.processos[0]?.DataPrazo || '';
    const dataB = b.processos[0]?.DataVencimentoParcelas || b.processos[0]?.DataPrazo || '';
    return dataA.localeCompare(dataB);
  });

  const el = document.getElementById('page-content');
  if (grupos.length === 0) {
    el.innerHTML = `<div class="empty-state"><i class="bi bi-check-circle" style="font-size:48px;color:var(--success)"></i><p>Nenhum pagamento pendente. Tudo em dia!</p></div>`;
    return;
  }

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3><i class="bi bi-cash-coin me-2"></i>Clientes com Pagamentos em Aberto</h3>
        <span style="font-size:12px;color:var(--text-muted)">${grupos.length} cliente(s)</span>
      </div>
      <div class="card-body" style="padding:0">
        ${grupos.map(g => {
          const total = g.processos.reduce((s, p) => s + (Number(p.ValorProcesso) || 0), 0);
          const dataVenc = g.processos.map(p => p.DataVencimentoParcelas || p.DataPrazo || '').filter(Boolean).sort()[0] || '';
          const celularLimpo = (g.celular || '').replace(/\D/g, '');
          const msgWa = `Olá ${esc(g.nome)}, verificamos em nosso sistema que constam valores em aberto referentes aos serviços prestados no valor de ${fmtMoeda(total)}${dataVenc ? ' com vencimento para ' + fmtDate(dataVenc) : ''}.`;
          return `<div style="padding:16px 20px;border-bottom:1px solid var(--border)">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">
              <div>
                <a style="font-size:15px;font-weight:700;cursor:pointer;color:var(--accent)" onclick="navigate('clientes/perfil',{id:'${g.clienteId}',tab:'pagamentos'})">${esc(g.nome)}</a>
                ${dataVenc ? `<span style="font-size:12px;color:var(--text-muted);margin-left:8px">Venc.: ${fmtDate(dataVenc)}</span>` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <strong style="font-size:15px;color:var(--danger)">${fmtMoeda(total)}</strong>
                ${celularLimpo ? `<button class="btn btn-whatsapp btn-sm" onclick="window.open('https://wa.me/55${celularLimpo}?text=${encodeURIComponent(msgWa)}','_blank')"><i class="bi bi-whatsapp"></i> Avisar</button>` : ''}
              </div>
            </div>
            <div style="padding-left:12px;border-left:3px solid var(--border)">
              ${g.processos.map(p => `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:13px">
                <a style="cursor:pointer;color:var(--accent)" onclick="navigate('processos/detalhe',{id:'${p.id}'})">${esc(p.TipoProcesso||'—')} ${p.NumeroProtocolo?'#'+p.NumeroProtocolo:''}</a>
                <span style="font-weight:600">${fmtMoeda(p.ValorProcesso)}</span>
              </div>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
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
  if (el) el.style.display = tipo === 'Parcelado' ? '' : 'none';
}

function onTipoPagamentoDetalheChange(tipo) {
  const el = document.getElementById('campos-parcelado-detalhe');
  if (el) el.style.display = tipo === 'Parcelado' ? '' : 'none';
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
    const novaValidade = addDays(hoje, 90);
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
        var mff=el.closest('mat-form-field,[class*="form-field"]');
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
