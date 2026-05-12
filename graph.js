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

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Converte URL de compartilhamento do OneDrive para o formato de ID do Graph API
  _encodeShareId(url) {
    const base64 = btoa(url);
    return 'u!' + base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  // Resolve qual drive/pasta usar (cache de 5 min)
  async _resolveDrive(token) {
    const now = Date.now();
    if (this._driveCache && (now - this._driveCacheTime) < 300000) return this._driveCache;

    const upn    = CONFIG.dataOwnerUpn;
    const folder = CONFIG.dataFolderPath;

    // Sem proprietário configurado — usa drive próprio
    if (!upn) {
      this._driveCache = { tipo: 'proprio', pasta: `${this.BASE}/me/drive/root:/${folder}` };
      this._driveCacheTime = now;
      return this._driveCache;
    }

    // Verifica se o usuário logado é o proprietário dos dados
    const meRes = await fetch(`${this.BASE}/me?$select=userPrincipalName`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const me = await meRes.json();
    const meUpn    = (me.userPrincipalName || '').toLowerCase();
    const ownerUpn = upn.toLowerCase();

    if (meUpn === ownerUpn || meUpn.split('@')[0] === ownerUpn.split('@')[0]) {
      this._driveCache = { tipo: 'proprio', pasta: `${this.BASE}/me/drive/root:/${folder}` };
      this._driveCacheTime = now;
      return this._driveCache;
    }

    // Usuário não é o proprietário — acessa via link de compartilhamento
    const shareUrl = CONFIG.dataFolderShareUrl;
    if (!shareUrl) {
      throw new Error(
        'Acesso não configurado.\n\n' +
        `Peça a ${upn} para:\n` +
        `1. Clicar com botão direito na pasta "${folder}" no OneDrive\n` +
        '2. Compartilhar → Pessoas da organização → Edição → Copiar link\n' +
        '3. Colocar esse link no campo "dataFolderShareUrl" do arquivo config.js'
      );
    }

    const shareId  = this._encodeShareId(shareUrl);
    const shareRes = await fetch(`${this.BASE}/shares/${shareId}/driveItem`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!shareRes.ok) {
      const errBody = await shareRes.json().catch(() => ({}));
      throw new Error(
        `Não foi possível acessar a pasta compartilhada (HTTP ${shareRes.status}).\n` +
        (errBody?.error?.message || 'Verifique se o link de compartilhamento está correto no config.js.')
      );
    }

    const item    = await shareRes.json();
    const driveId = item.parentReference?.driveId;
    const itemId  = item.id;

    if (!driveId || !itemId) {
      throw new Error('Não foi possível obter as informações da pasta compartilhada.');
    }

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
      const url   = await this._fileUrl(token, nome);
      const res   = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
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
      const url   = await this._fileUrl(token, nome);
      const res   = await fetch(url, {
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

  // ---- OPERAÇÕES DE DADOS ----

  async getItems(colecao) {
    return await this._readFile(colecao);
  }

  async getItem(colecao, id) {
    const items = await this._readFile(colecao);
    const item  = items.find(i => String(i.id) === String(id));
    if (!item) throw new Error(`Registro não encontrado (id: ${id})`);
    return item;
  }

  async createItem(colecao, fields) {
    const items = await this._readFile(colecao);
    const novo  = { id: `${Date.now()}${Math.random().toString(36).substr(2, 6)}`, ...fields };
    items.push(novo);
    await this._writeFile(colecao, items);
    return novo;
  }

  async updateItem(colecao, id, fields) {
    const items = await this._readFile(colecao);
    const idx   = items.findIndex(i => String(i.id) === String(id));
    if (idx < 0) throw new Error('Registro não encontrado para atualizar');
    items[idx] = { ...items[idx], ...fields };
    await this._writeFile(colecao, items);
  }

  async deleteItem(colecao, id) {
    const items = await this._readFile(colecao);
    await this._writeFile(colecao, items.filter(i => String(i.id) !== String(id)));
  }

  // ---- INICIALIZAÇÃO (cria pasta e arquivos na primeira execução — apenas para o dono) ----

  async initializeLists(onProgress) {
    const token = await this.getToken();

    // Identifica se é o dono dos dados
    const me = await fetch(`${this.BASE}/me?$select=userPrincipalName`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    const meUpn    = (me.userPrincipalName || '').toLowerCase();
    const ownerUpn = (CONFIG.dataOwnerUpn  || '').toLowerCase();
    const isOwner  = !ownerUpn || meUpn === ownerUpn || meUpn.split('@')[0] === ownerUpn.split('@')[0];

    if (!isOwner) {
      // Outros usuários: apenas verifica se o acesso funciona
      await this._resolveDrive(token);
      return false;
    }

    // Dono: verifica se a pasta já existe
    const checkRes = await fetch(
      `${this.BASE}/me/drive/root:/${CONFIG.dataFolderPath}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (checkRes.ok) return false;

    // Cria a pasta
    if (onProgress) onProgress('Criando pasta de dados no OneDrive...');
    const createRes = await fetch(`${this.BASE}/me/drive/root/children`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: CONFIG.dataFolderPath, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })
    });
    if (!createRes.ok) throw new Error('Não foi possível criar a pasta de dados no OneDrive.');

    for (const col of ['clientes', 'armas', 'documentos', 'processos', 'clubes']) {
      if (onProgress) onProgress(`Inicializando: ${col}...`);
      await this._writeFile(col, []);
    }
    return true;
  }
}
