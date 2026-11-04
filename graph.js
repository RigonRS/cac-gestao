// ============================================================
// SERVIÇO DE DADOS — OneDrive (arquivos JSON)
// Requer consentimento de administrador para Files.ReadWrite.All
// ============================================================
class GraphService {
  constructor(msalInstance) {
    this.msal = msalInstance;
    this.BASE = 'https://graph.microsoft.com/v1.0';
    // Quantos registros cada arquivo (coleção) tinha na última leitura/gravação
    // bem-sucedida desta sessão. Usado como trava de segurança contra gravações
    // que apagariam quase tudo (ex.: uma leitura que falhou e voltou vazia).
    this._contagens = {};
  }

  async getToken() {
    const accounts = this.msal.getAllAccounts();
    if (!accounts.length) throw new Error('Usuário não autenticado.');
    try {
      const r = await this.msal.acquireTokenSilent({ scopes: ['Files.ReadWrite.All', 'User.Read'], account: accounts[0] });
      return r.accessToken;
    } catch {
      const r = await this.msal.acquireTokenPopup({ scopes: ['Files.ReadWrite.All', 'User.Read'] });
      return r.accessToken;
    }
  }

  // Retorna a base da URL do drive compartilhado (OneDrive do proprietário dos dados)
  _driveBase() {
    const upn = CONFIG.dataOwnerUpn;
    if (!upn) return `${this.BASE}/me/drive/root:`;
    return `${this.BASE}/users/${encodeURIComponent(upn)}/drive/root:`;
  }

  // Aguarda N milissegundos
  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Memoriza quantos registros a coleção tem agora (apenas para listas/arrays).
  _registrarContagem(nome, dados) {
    if (Array.isArray(dados)) this._contagens[nome] = dados.length;
  }

  // TRAVA DE SEGURANÇA: impede substituir uma lista cheia por uma lista
  // drasticamente menor (o que normalmente é sinal de falha de leitura).
  // Não se aplica a arquivos de configuração (que são objetos, não listas).
  _checarReducaoPerigosa(nome, dados, forcar) {
    if (forcar) return;                    // gravação explicitamente autorizada
    if (!Array.isArray(dados)) return;     // config (objeto): não se aplica
    const conhecida = this._contagens[nome];
    if (conhecida == null) return;         // nunca lida nesta sessão: sem comparação
    const nova = dados.length;
    const quedaGrande = nova < Math.ceil(conhecida * 0.5) && (conhecida - nova) >= 5;
    if (conhecida >= 8 && quedaGrande) {
      throw new Error(
        `Gravação de "${nome}" BLOQUEADA por segurança: o arquivo tinha ${conhecida} ` +
        `registro(s) e a operação tentou salvar apenas ${nova}. Isso costuma indicar ` +
        `uma falha de leitura. Nenhum dado foi alterado — recarregue a página (Ctrl+F5) ` +
        `e tente novamente.`
      );
    }
  }

  // Lê um arquivo JSON do OneDrive (3 tentativas com backoff)
  async _readFile(nome, tentativa = 1) {
    try {
      const token = await this.getToken();
      const url = `${this._driveBase()}/${CONFIG.dataFolderPath}/${nome}.json:/content`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.status === 404) {
        // Se já conhecíamos este arquivo com registros nesta sessão, um 404 agora
        // é falha transitória (não "arquivo novo"): não devolver [] para não
        // arriscar uma gravação seguinte apagar tudo.
        if (this._contagens[nome] > 0) {
          throw new Error(`Falha ao ler "${nome}" (HTTP 404 inesperado). Recarregue a página (Ctrl+F5).`);
        }
        return [];
      }
      if (res.status === 401 && tentativa < 3) {
        await this._sleep(500 * tentativa);
        return this._readFile(nome, tentativa + 1);
      }
      if (!res.ok) throw new Error(`Erro ao ler ${nome}: HTTP ${res.status}`);
      let dados;
      try {
        dados = await res.json();
      } catch (eParse) {
        // Conteúdo corrompido/incompleto: NÃO devolver [] (isso poderia fazer a
        // gravação seguinte apagar o arquivo). Tratar como falha de leitura.
        throw new Error(`Arquivo de dados "${nome}" veio corrompido/incompleto na leitura. Recarregue a página (Ctrl+F5).`);
      }
      this._registrarContagem(nome, dados);
      return dados;
    } catch (e) {
      if (e.name === 'TypeError' && tentativa < 3) {
        await this._sleep(1000 * tentativa);
        return this._readFile(nome, tentativa + 1);
      }
      throw e;
    }
  }

  // Salva um arquivo JSON no OneDrive (3 tentativas com backoff)
  async _writeFile(nome, dados, tentativa = 1, opcoes = {}) {
    // Trava de segurança: roda antes de gravar (só na 1ª tentativa).
    if (tentativa === 1) this._checarReducaoPerigosa(nome, dados, opcoes.forcar);
    try {
      const token = await this.getToken();
      const url = `${this._driveBase()}/${CONFIG.dataFolderPath}/${nome}.json:/content`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
      });
      if (!res.ok) {
        if (res.status === 401 && tentativa < 3) {
          await this._sleep(500 * tentativa);
          return this._writeFile(nome, dados, tentativa + 1, opcoes);
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Erro ao salvar ${nome}`);
      }
      // Gravou com sucesso: atualiza a contagem conhecida desta coleção.
      this._registrarContagem(nome, dados);
    } catch (e) {
      if (e.name === 'TypeError' && tentativa < 3) {
        await this._sleep(1000 * tentativa);
        return this._writeFile(nome, dados, tentativa + 1, opcoes);
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

  // ---- INICIALIZAÇÃO ----

  async initializeLists(onProgress) {
    const token = await this.getToken();
    const checkRes = await fetch(
      `${this._driveBase()}/${CONFIG.dataFolderPath}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (checkRes.ok) return false;

    if (onProgress) onProgress('Criando pasta de dados no OneDrive...');
    const upn = CONFIG.dataOwnerUpn;
    const rootUrl = upn
      ? `${this.BASE}/users/${encodeURIComponent(upn)}/drive/root/children`
      : `${this.BASE}/me/drive/root/children`;
    const createRes = await fetch(rootUrl, {
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
