// ============================================================
// DADOS FIXOS DO SISTEMA CAC GESTÃO
// ============================================================

const PAISES_FABRICACAO = [
  'Brasil','Estados Unidos','Alemanha','Áustria','Itália','Bélgica',
  'República Tcheca','Israel','Suíça','Argentina','Espanha','França',
  'Rússia','China','Turquia','Portugal','Croácia','Finlândia',
  'Hungria','Sérvia','Outros'
];

const TIPOS_PROCESSO = [
  'Aquisição de Arma SIGMA',
  'Aquisição de Arma PF',
  'Atualização de Documento de Identificação',
  'Concessão/Renovação de CR',
  'Guia de Tráfego',
  'Alteração de Endereço',
  'Inclusão de Atividade',
  'Exclusão de Atividade',
  'Mudança de Acervo',
  'Renovação de CRAF',
  'Segunda via de CRAF',
  'Transferência de Arma SIGMA x SINARM',
  'Transferência de Arma SINARM x SINARM',
  'Transferência de Arma SIGMA x SIGMA',
  'Transferência de Arma SINARM x SIGMA'
];

const TIPOS_TRANSFERENCIA = [
  'Transferência de Arma SIGMA x SINARM',
  'Transferência de Arma SINARM x SINARM',
  'Transferência de Arma SIGMA x SIGMA',
  'Transferência de Arma SINARM x SIGMA'
];

const CHECKLIST_AQUISICAO = [
  'Teste de Tiro','Certidão Justiça Federal','Anexo C',
  'Doc. Identificação','Avaliação Psicológica',
  'Comprovante de Residência','Comprovante de Ocupação Lícita',
  'Declaração de Filiação','Certidão Justiça Estadual',
  'DSA','CTF + SIMAF','Certidão Justiça Militar','Certidão Justiça Eleitoral'
];

const CHECKLIST_CR_INCLUSAO_RENOVCRAF = [
  'Teste de Tiro','Certidão da Justiça Federal','Anexo C',
  'Documento de Identificação Pessoal','Avaliação Psicológica',
  'Comprovante de Residência','Comprovante de Ocupação',
  'Declaração de Filiação','Comprovante de 2° Endereço',
  'Certidão da Justiça Estadual','DSA','CTF + SIMAF',
  'Certidão da Justiça Militar','Certidão da Justiça Eleitoral'
];

const CHECKLIST_TRANSFERENCIA = [
  'Documento de Identificação do Vendedor','CR do Vendedor','CRAF',
  'Comprovante de Residência do Vendedor',
  'Documento de Identificação do Comprador','CR do Comprador',
  'Comprovante de Residência do Comprador','Comprovante de Ocupação',
  'Anexo C','DSA 1° Endereço','Certidão Justiça Federal',
  'Certidão Justiça Estadual','Certidão Justiça Militar',
  'Certidão Justiça Eleitoral','Avaliação Psicológica','Teste de Tiro',
  'CTF + SIMAF','Declaração de Habitualidade','Procuração','Requerimento','GRUs'
];

const CHECKLISTS = {
  'Aquisição de Arma SIGMA':                  CHECKLIST_AQUISICAO,
  'Aquisição de Arma PF':                     CHECKLIST_AQUISICAO,
  'Atualização de Documento de Identificação': [],
  'Concessão/Renovação de CR':                CHECKLIST_CR_INCLUSAO_RENOVCRAF,
  'Guia de Tráfego': {
    'Caça':                  ['Declaração de Filiação','CTF + SIMAF'],
    'Caça-Treinamento Tiro': ['Documento de Identificação'],
    'Tiro Esportivo':        ['Documento de Identificação']
  },
  'Alteração de Endereço':  ['Comprovante de Residência'],
  'Inclusão de Atividade':  CHECKLIST_CR_INCLUSAO_RENOVCRAF,
  'Exclusão de Atividade':  ['Documento de Identificação'],
  'Mudança de Acervo': [
    'Documento de Identificação','Certidão Justiça Federal',
    'Certidão Justiça Estadual','Certidão Justiça Militar',
    'Certidão Justiça Eleitoral','Comprovante de Ocupação',
    'Comprovante de Residência','Anexo C','DSA','CTF + SIMAF',
    'Declaração de Habitualidade','Requerimento','GRUs'
  ],
  'Renovação de CRAF':    CHECKLIST_CR_INCLUSAO_RENOVCRAF,
  'Segunda via de CRAF':  ['Documento de Identificação'],
  'Transferência de Arma SIGMA x SINARM':  CHECKLIST_TRANSFERENCIA,
  'Transferência de Arma SINARM x SINARM': CHECKLIST_TRANSFERENCIA,
  'Transferência de Arma SIGMA x SIGMA':   CHECKLIST_TRANSFERENCIA,
  'Transferência de Arma SINARM x SIGMA':  CHECKLIST_TRANSFERENCIA
};

function getChecklist(tipoProcesso, subTipo = null) {
  const base = CHECKLISTS[tipoProcesso];
  if (!base) return [];
  if (tipoProcesso === 'Guia de Tráfego') {
    return subTipo ? (base[subTipo] || []) : [];
  }
  return Array.isArray(base) ? [...base] : [];
}

function buildChecklistItems(tipoProcesso, subTipo = null) {
  return getChecklist(tipoProcesso, subTipo).map(nome => ({
    nome, concluido: false, observacao: ''
  }));
}

// Definição das colunas de cada lista do SharePoint
const _text  = (name) => ({ name, text: {} });
const _textM = (name) => ({ name, text: { allowMultipleLines: true, linesForEditing: 6 } });
const _num   = (name) => ({ name, number: { decimalPlaces: 'none', displayAs: 'number' } });
const _date  = (name) => ({ name, dateTime: { displayAs: 'dateOnly', format: 'dateOnly' } });

const COLUMNS_CLIENTES = [
  _text('CPF'), _text('SenhaGOV'), _text('NumeroCR'), _text('DataValidadeCR'),
  _text('RG'), _date('DataExpedicaoRG'), _date('DataValidadeRGouCNH'),
  _text('OrgaoEmissor'), _text('UFDoc'), _date('DataNascimento'),
  _text('Nacionalidade'), _text('Naturalidade'), _text('UFNaturalidade'),
  _text('Profissao'), _text('Celular'), _text('Email'),
  _text('NomeMae'), _text('NomePai'), _text('Categoria'),
  _text('CEP1'), _text('Endereco1'), _text('Numero1'),
  _text('Complemento1'), _text('Bairro1'), _text('Cidade1'), _text('UF1Endereco'),
  _text('CEP2'), _text('Endereco2'), _text('Numero2'),
  _text('Complemento2'), _text('Bairro2'), _text('Cidade2'), _text('UF2Endereco')
];

const COLUMNS_ARMAS = [
  _num('ClienteId'), _text('ClienteNome'),
  _text('NumeroSerie'), _text('NumeroSIGMA'), _text('AtividadeCadastrada'),
  _text('Modelo'), _text('Calibre'), _text('Especie'), _text('Marca'),
  _text('GrupoCalibre'), _text('PaisFabricacao'), _text('CapacidadeTiro'),
  _text('NumeroCanos'), _text('AlmaCano'), _text('NumeroRaias'),
  _text('SentidoRaias'), _text('Acabamento'), _text('Funcionamento'),
  _textM('Observacoes')
];

const COLUMNS_DOCUMENTOS = [
  _num('ClienteId'), _text('ClienteNome'), _text('TipoDocumento'),
  _text('LinkArquivo'), _date('DataEmissao'), _date('DataValidade'),
  _text('CidadeDoc'), _text('NomeFazenda'), _text('NumeroCar'),
  _num('ClienteDonoCRAFId'), _text('ClienteDonoCRAFNome'),
  _num('ArmaVinculadaId'), _text('ArmaVinculadaDesc'),
  _text('EnderecoGuia'), _text('TipoGuia'),
  _text('CidadeGuia'), _text('UFGuia'),
  _text('NomeClubeTiro'), _text('CRClubeTiro'), _text('EnderecoClubeTiro')
];

const COLUMNS_PROCESSOS = [
  _num('ClienteId'), _text('ClienteNome'), _text('TipoProcesso'),
  _text('NumeroProtocolo'), _date('DataAbertura'), _date('DataPrazo'),
  _text('Status'), _num('ValorProcesso'), _text('FormaPagamento'),
  _date('DataPagamento'), _textM('Observacoes'),
  _textM('ChecklistJSON'), _textM('DadosEspecificosJSON')
];
