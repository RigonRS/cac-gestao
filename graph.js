// ============================================================
// SERVIÇO DE DADOS — OneDrive (arquivos JSON)
// Não requer permissões de administrador
// ============================================================
class GraphService {
  constructor(msalInstance) {
    this.msal = msalInstance;
    this.BASE = 'https://graph.microsoft.com/v1.0';
    this._driveCache = null;
    this._driveCacheTime = 0;
  }

  async getToken() {
    const accounts = this.msal.getAllAccounts();
    if (!accounts.length) throw new Error('Usuário não autenticado.');
    try {
      const r = await this.msal.acquireTokenSilent({ scopes: ['Files.ReadWrite', 'User.Read'], account: accounts[0] });
      return r.accessToken;
    } catch {
      const r = await this.msal.acquireTokenPopup({ scopes: ['Files.ReadWrite', 'User.Read'] });
      return r.accessToken;
    }
  }

  // Aguarda N milissegundos
  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Resolve qual drive/pasta usar para o usuário atual (cache de 5 min)
  async _resolveDrive(token) {
    const now = Date.now();
    if (this._driveCache && (now - this._driveCacheTime) < 300000) return this._driveCache;

    const upn = CONFIG.dataOwnerUpn;
    const folder = CONFIG.dataFolderPath;

    // Se não tiver proprietário configurado, usa o drive do próprio usuário
    if (!upn) {
      this._driveCache = { tipo: 'proprio', pasta: `${this.BASE}/me/drive/root:/${folder}` };
      this._driveCacheTime = now;
      return this._driveCache;
    }

    // Verifica se o usuário logado É o proprietário
    const meRes = await fetch(`${this.BASE}/me?$select=userPrincipalName`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const me = await meRes.json();
    const meUpn = (me.userPrincipalName || '').toLowerCase();
    const ownerUpn = upn.toLowerCase();

    if (meUpn === ownerUpn || meUpn.split('@')[0] === ownerUpn.split('@')[0]) {
      this._driveCache = { tipo: 'proprio', pasta: `${this.BASE}/me/drive/root:/${folder}` };
      this._driveCacheTime = now;
      return this._driveCache;
    }

    // Usuário não é o proprietário — busca a pasta nos itens compartilhados
    const sharedRes = await fetch(`${this.BASE}/me/drive/sharedWithMe?$select=id,name,remoteItem`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!sharedRes.ok) throw new Error('Não foi possível acessar os itens compartilhados. Verifique se a pasta foi compartilhada com você.');

    const shared = await sharedRes.json();
    const item = (shared.value || []).find(i =>
      i.name === folder || i.remoteItem?.name === folder
    );

    if (!item?.remoteItem) {
      throw new Error(
        `Pasta de dados não encontrada.\n\n` +
        `Peça a ${upn} para compartilhar a pasta "${folder}" do OneDrive com você (com permissão de Edição).`
      );
    }

    const driveId = item.remoteItem.parentReference?.driveId || item.remoteItem.driveId;
    const itemId  = item.remoteItem.id;
    this._driveCache = { tipo: 'compartilhado', driveId, itemId };
    this._driveCacheTime = now;
    return this._driveCache;
  }

  // Monta a URL de conteúdo de um arquivo JSON
  async _fileUrl(token, nome) {
    const d = await this._resolveDrive(token);
    if (d.tipo === 'proprio') {
      return `${d.pasta}/${nome}.json:/content`;
    }
    return `${this.BASE}/drives/${d.driveId}/items/${d.itemId}:/${nome}.json:/content`;
  }

  // Lê um arquivo JSON do OneDrive (3 tentativas com backoff)
  async _readFile(nome, tentativa = 1) {
    try {
      const token = await this.getToken();
      const url = await this._fileUrl(token, nome);
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.status === 404) return [];
      if (res.status === 401 && tentativa < 3) {
        this._driveCache = null;
        await this._sleep(500 * tentativa);
        return this._readFile(nome, tentativa + 1);
      }
      if (!res.ok) throw new Error(`Erro ao ler ${nome}: HTTP ${res.status}`);
      try { return await res.json(); } catch { return []; }
    } catch (e) {
      if (e.name === 'TypeError' && tentativa < 3) {
        await this._sleep(1000 * tentativa);
        return this._readFile(nome, tentativa + 1);
      }
      throw e;
    }
  }

  // Salva um arquivo JSON no OneDrive (3 tentativas com backoff)
  async _writeFile(nome, dados, tentativa = 1) {
    try {
      const token = await this.getToken();
      const url = await this._fileUrl(token, nome);
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
      });
      if (!res.ok) {
        if (res.status === 401 && tentativa < 3) {
          this._driveCache = null;
          await this._sleep(500 * tentativa);
          return this._writeFile(nome, dados, tentativa + 1);
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Erro ao salvar ${nome}`);
      }
    } catch (e) {
      if (e.name === 'TypeError' && tentativa < 3) {
        await this._sleep(1000 * tentativa);
        return this._writeFile(nome, dados, tentativa + 1);
      }
      throw e;
    }
  }

  // ---- OPERAÇÕES DE DADOS (mesma interface de antes) ----

  async getItems(colecao) {
    return await this._readFile(colecao);
  }

  async getItem(colecao, id) {
    const items = await this._readFile(colecao);
    const item = items.find(i => String(i.id) === String(id));
    if (!item) throw new Error(`Registro não encontrado (id: ${id})`);
    return item;
  }

  async createItem(colecao, fields) {
    const items = await this._readFile(colecao);
    const novo = { id: `${Date.now()}${Math.random().toString(36).substr(2, 6)}`, ...fields };
    items.push(novo);
    await this._writeFile(colecao, items);
    return novo;
  }

  async updateItem(colecao, id, fields) {
    const items = await this._readFile(colecao);
    const idx = items.findIndex(i => String(i.id) === String(id));
    if (idx < 0) throw new Error('Registro não encontrado para atualizar');
    items[idx] = { ...items[idx], ...fields };
    await this._writeFile(colecao, items);
  }

  async deleteItem(colecao, id) {
    const items = await this._readFile(colecao);
    await this._writeFile(colecao, items.filter(i => String(i.id) !== String(id)));
  }

  // ---- INICIALIZAÇÃO (cria a pasta e arquivos na primeira execução) ----

  async initializeLists(onProgress) {
    const token = await this.getToken();

    // Se não for o proprietário, assume que a pasta já existe (compartilhada)
    const me = await fetch(`${this.BASE}/me?$select=userPrincipalName`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    const meUpn    = (me.userPrincipalName || '').toLowerCase();
    const ownerUpn = (CONFIG.dataOwnerUpn || '').toLowerCase();
    const isOwner  = !ownerUpn || meUpn === ownerUpn || meUpn.split('@')[0] === ownerUpn.split('@')[0];

    if (!isOwner) {
      // Apenas verifica se consegue acessar — o drive resolve o caminho compartilhado
      await this._resolveDrive(token);
      return false;
    }

    // Verifica se a pasta já existe (dono)
    const checkRes = await fetch(
      `${this.BASE}/me/drive/root:/${CONFIG.dataFolderPath}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (checkRes.ok) return false; // já existe

    // Cria a pasta
    if (onProgress) onProgress('Criando pasta de dados no OneDrive...');
    const createRes = await fetch(`${this.BASE}/me/drive/root/children`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: CONFIG.dataFolderPath, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })
    });
    if (!createRes.ok) throw new Error('Não foi possível criar a pasta de dados no OneDrive.');

    // Cria arquivos JSON vazios
    for (const col of ['clientes', 'armas', 'documentos', 'processos', 'clubes']) {
      if (onProgress) onProgress(`Inicializando: ${col}...`);
      await this._writeFile(col, []);
    }
    return true;
  }
}
