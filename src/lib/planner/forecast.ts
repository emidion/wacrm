/**
 * EXGROW Revenue Planner — Parâmetros and Forecast Base.
 *
 * Formulas copied from the workbook (Forecast Base cascade and the
 * sensitivity block D24:D30). Rates are stored as fractions, the same
 * way the sheet stores them (35% is 0.35).
 *
 * Forecast Base scheduling rate is the local input (sheet C7). It is
 * not Parâmetros C11. The other cascade rates, the ticket, and the
 * meta are read from Parâmetros.
 *
 * The cascade is a product, not a quotient. A zero rate yields zero
 * revenue. Blank or non-finite inputs stop the result. `guardDivide`
 * is the shared divide-by-zero guard for any formula that does divide;
 * none of the Forecast Base formulas do.
 */

export interface Parametros {
  /** C6. Meta mensal MRR. */
  metaMensal: number;
  /** C7. Ticket médio MRR por contrato. */
  ticket: number;
  /** C8. Fraction. Meta agressiva = base × (1 + esticada). */
  esticada: number;
  /** C11. Not used by Forecast Base. */
  taxaAgendamento: number;
  /** C12. */
  comparecimento: number;
  /** C13. */
  conversao: number;
  /** C16. */
  mqlAds: number;
  /** C17. */
  mqlIndicacao: number;
  /** C18. */
  mqlOutros: number;
  /** C21. Not used by Forecast Base. */
  taxaEnzo: number;
  /** C22. Not used by Forecast Base. */
  taxaItalo: number;
  /** C25:C28. Not used by Forecast Base. */
  pesoSemana1: number;
  pesoSemana2: number;
  pesoSemana3: number;
  pesoSemana4: number;
  /** C31. */
  cargoNovoMembro: string;
  /** C32. */
  mesProducao: number;
  /** C33. */
  agendamentosSemana: number;
  /** C34. */
  conversaoMes1: number;
  /** C35. */
  conversaoMes2: number;
  /** C36. */
  conversaoMes3: number;
}

/** Inputs that the Forecast Base cascade and the meta comparison read. */
export type CascadeField =
  | 'metaMensal'
  | 'ticket'
  | 'esticada'
  | 'comparecimento'
  | 'conversao'
  | 'mqlAds'
  | 'mqlIndicacao'
  | 'mqlOutros'
  | 'taxaAgendamentoForecast';

export interface FieldIssue {
  field: CascadeField;
  message: string;
}

export interface Cenario {
  alavanca: string;
  cenario: string;
  impacto: number;
}

export interface ForecastBase {
  mqlTotal: number;
  taxaAgendamento: number;
  reunioesAgendadas: number;
  taxaComparecimento: number;
  reunioesFeitas: number;
  taxaConversao: number;
  contratos: number;
  ticket: number;
  forecastBase: number;
  metaAgressiva: number;
  metaDefinida: number;
  gap: number;
  diagnostico: string;
  onTrack: boolean;
  cenarios: Cenario[];
}

export interface ForecastResult {
  forecast: ForecastBase | null;
  issues: FieldIssue[];
}

export const DEFAULT_PARAMETROS: Parametros = {
  metaMensal: 10_000,
  ticket: 2_000,
  esticada: 0.5,
  taxaAgendamento: 0.3,
  comparecimento: 0.7,
  conversao: 0.57,
  mqlAds: 30,
  mqlIndicacao: 0,
  mqlOutros: 0,
  taxaEnzo: 0.35,
  taxaItalo: 0.35,
  pesoSemana1: 0.25,
  pesoSemana2: 0.25,
  pesoSemana3: 0.25,
  pesoSemana4: 0.25,
  cargoNovoMembro: 'SDR outbound',
  mesProducao: 3,
  agendamentosSemana: 5,
  conversaoMes1: 0.15,
  conversaoMes2: 0.25,
  conversaoMes3: 0.3,
};

/** Forecast Base!C7. Independent of Parâmetros!C11. */
export const DEFAULT_TAXA_AGENDAMENTO_FORECAST = 0.35;

export const DIAGNOSTICO_NO_RUMO = 'FORECAST BASE >= META · time em rota';
export const DIAGNOSTICO_GAP =
  'GAP · precisa ajustar 1 alavanca do funil em 15 dias';

const INVALID_NUMBER = 'Informe um número válido.';
const DIVIDE_BY_ZERO = 'Não é possível dividir por zero.';

export function parsePlannerNumber(raw: string): number {
  const trimmed = raw
    .trim()
    .replace(/\s/g, '')
    .replace(/%$/, '')
    .replace(',', '.');
  if (!trimmed) return Number.NaN;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function formatInputNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** Percent points for an input. 0.57 → "57". */
export function percentToInput(fraction: number): string {
  if (!Number.isFinite(fraction)) return '';
  const points = Math.round(fraction * 10_000) / 100;
  return String(points);
}

export function formatPercent(fraction: number, digits = 1): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(fraction);
}

/**
 * Sheet currency format is whole reais, but values such as the
 * aggressive meta keep a half real. Whole amounts omit the cents;
 * anything else shows two decimal places. Zero uses the sheet's
 * zero format ("-").
 */
export function formatBrl(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '-';
  const rounded = Math.round(value * 100) / 100;
  const whole = Math.abs(rounded - Math.round(rounded)) < 1e-9;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(rounded);
}

/** Count format `#,##0` with the zero section shown as "-". */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '-';
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 4,
  }).format(value);
}

export function guardDivide(
  numerator: number,
  denominator: number
): { ok: true; value: number } | { ok: false; message: string } {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return { ok: false, message: INVALID_NUMBER };
  }
  if (denominator === 0) {
    return { ok: false, message: DIVIDE_BY_ZERO };
  }
  return { ok: true, value: numerator / denominator };
}

function finiteIssue(field: CascadeField, value: number): FieldIssue | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { field, message: INVALID_NUMBER };
  }
  return null;
}

export function computeForecast(
  parametros: Parametros,
  taxaAgendamentoForecast: number
): ForecastResult {
  const checks: Array<[CascadeField, number]> = [
    ['metaMensal', parametros.metaMensal],
    ['ticket', parametros.ticket],
    ['esticada', parametros.esticada],
    ['comparecimento', parametros.comparecimento],
    ['conversao', parametros.conversao],
    ['mqlAds', parametros.mqlAds],
    ['mqlIndicacao', parametros.mqlIndicacao],
    ['mqlOutros', parametros.mqlOutros],
    ['taxaAgendamentoForecast', taxaAgendamentoForecast],
  ];

  const issues = checks.flatMap(([field, value]) => {
    const issue = finiteIssue(field, value);
    return issue ? [issue] : [];
  });

  if (issues.length > 0) {
    return { forecast: null, issues };
  }

  // C6 = Parâmetros!C16 + C17 + C18
  const mqlTotal =
    parametros.mqlAds + parametros.mqlIndicacao + parametros.mqlOutros;
  // C8 = C6 * C7
  const reunioesAgendadas = mqlTotal * taxaAgendamentoForecast;
  // C10 = C8 * C9, C9 = Parâmetros!C12
  const reunioesFeitas = reunioesAgendadas * parametros.comparecimento;
  // C12 = C10 * C11, C11 = Parâmetros!C13
  const contratos = reunioesFeitas * parametros.conversao;
  // C14 = C12 * C13, C13 = Parâmetros!C7
  const forecastBase = contratos * parametros.ticket;
  // C15 = C14 * (1 + Parâmetros!C8)
  const metaAgressiva = forecastBase * (1 + parametros.esticada);
  // C19 = C14 - C18, C18 = Parâmetros!C6
  const gap = forecastBase - parametros.metaMensal;
  const onTrack = forecastBase >= parametros.metaMensal;

  const c6 = mqlTotal;
  const c7 = taxaAgendamentoForecast;
  const c9 = parametros.comparecimento;
  const c11 = parametros.conversao;
  const c13 = parametros.ticket;

  const cenarios: Cenario[] = [
    {
      alavanca: '+50 MQL adicionais',
      cenario: 'cenário 1',
      impacto: (c6 + 50) * c7 * c9 * c11 * c13,
    },
    {
      alavanca: 'Taxa de agendamento sobe pra 35%',
      cenario: 'cenário 2',
      impacto: c6 * 0.35 * c9 * c11 * c13,
    },
    {
      alavanca: 'Taxa de agendamento sobe pra 45%',
      cenario: 'cenário 3',
      impacto: c6 * 0.45 * c9 * c11 * c13,
    },
    {
      alavanca: 'Comparecimento sobe pra 80%',
      cenario: 'cenário 4',
      impacto: c6 * c7 * 0.8 * c11 * c13,
    },
    {
      alavanca: 'Conversão (close) sobe pra 40%',
      cenario: 'cenário 5',
      impacto: c6 * c7 * c9 * 0.4 * c13,
    },
    {
      alavanca: 'Ticket sobe pra R$ 12.000 (mix Gold maior)',
      cenario: 'cenário 6',
      impacto: c6 * c7 * c9 * c11 * 12_000,
    },
    {
      alavanca: 'Melhoria simultânea das 3 taxas',
      cenario: 'cenário 7',
      impacto: c6 * 0.35 * 0.8 * 0.4 * c13,
    },
  ];

  return {
    forecast: {
      mqlTotal,
      taxaAgendamento: taxaAgendamentoForecast,
      reunioesAgendadas,
      taxaComparecimento: parametros.comparecimento,
      reunioesFeitas,
      taxaConversao: parametros.conversao,
      contratos,
      ticket: parametros.ticket,
      forecastBase,
      metaAgressiva,
      metaDefinida: parametros.metaMensal,
      gap,
      diagnostico: onTrack ? DIAGNOSTICO_NO_RUMO : DIAGNOSTICO_GAP,
      onTrack,
      cenarios,
    },
    issues: [],
  };
}
