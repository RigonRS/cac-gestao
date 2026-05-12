// ============================================================
// CONFIGURAÇÕES DO SISTEMA CAC GESTÃO
// Preencha os campos marcados com CONFIGURAR antes de usar
// ============================================================
const CONFIG = {

  // --- AUTENTICAÇÃO MICROSOFT (Azure AD) ---
  // Obtenha estes dados no portal.azure.com → App Registrations
  msalConfig: {
    auth: {
      clientId: 'b9e4b955-b4e0-498c-b1c1-e996cc91dcf0',
      authority: 'https://login.microsoftonline.com/be520b86-b5ad-44dd-acd2-b6a56d438ca5',
      redirectUri: window.location.origin + window.location.pathname
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false
    }
  },

  loginRequest: {
    scopes: ['User.Read', 'Files.ReadWrite']
  },

  graphScopes: {
    scopes: ['Files.ReadWrite', 'User.Read']
  },

  // --- ONEDRIVE COMPARTILHADO ---
  // E-mail (UPN) do proprietário do OneDrive onde os dados ficam salvos.
  // Todos os usuários lerão e gravarão NESTE OneDrive, não no próprio.
  // Após alterar, faça logout e login novamente para renovar as permissões.
  dataOwnerUpn: 'matheus@simonebpegoraro.onmicrosoft.com',

  // --- SHAREPOINT ---
  // URL do site SharePoint onde o sistema será hospedado
  // Ex: "https://minhaempresa.sharepoint.com/sites/escritorio"
  sharePointSiteUrl: 'https://simonebpegoraro-my.sharepoint.com/personal/matheus_simonebpegoraro_onmicrosoft_com',

  // --- CONFIGURAÇÕES DO ESCRITÓRIO ---
  nomeEscritorio: 'Escritório CAC',

  // Quantos dias antes do vencimento o sistema deve alertar
  diasAlertaVencimento: 60,

  // Pasta no OneDrive onde os dados serão salvos
  dataFolderPath: 'cac-gestao-dados',

  // Nomes dos arquivos de dados (não alterar)
  listas: {
    clientes:   'clientes',
    armas:      'armas',
    documentos: 'documentos',
    processos:  'processos',
    clubes:     'clubes'
  }
};
