// ============================================================
// SERVIÇO DE DADOS — OneDrive (arquivos JSON)
// Não requer permissões de administrador
// ============================================================
class GraphService {
  constructor(msalInstance) {
    this.msal = msalInstance;
    this.BASE = 'https://graph.microsoft.com/v1.0';
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

  // Lê um arquivo JSON do OneDrive
  async _readFile(nome) {
    const token = await this.getToken();
    const url = `${this.BASE}/me/drive/root:/${CONFIG.dataFolderPath}/${nome}.json:/content`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Erro ao ler ${nome}: HTTP ${res.status}`);
    try { return await res.json(); } catch { return []; }
  }

  // Salva um arquivo JSON no OneDrive
  async _writeFile(nome, dados) {
    const token = await this.getToken();
    const url = `${this.BASE}/me/drive/root:/${CONFIG.dataFolderPath}/${nome}.json:/content`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Erro ao salvar ${nome}`);
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
    // Verifica se a pasta já existe
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
    for (const col of ['clientes', 'armas', 'documentos', 'processos']) {
      if (onProgress) onProgress(`Inicializando: ${col}...`);
      await this._writeFile(col, []);
    }
    return true;
  }
}
