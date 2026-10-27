'use client';

import { useMemo, useState } from 'react';
import { LineChart } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  DEFAULT_PARAMETROS,
  DEFAULT_TAXA_AGENDAMENTO_FORECAST,
  type ForecastBase,
  type Parametros,
  computeForecast,
  formatBrl,
  formatCount,
  formatInputNumber,
  formatPercent,
  parsePlannerNumber,
  percentToInput,
} from '@/lib/planner/forecast';

type NumericParam = Exclude<keyof Parametros, 'cargoNovoMembro'>;
type FieldKind = 'currency' | 'percent' | 'count';
type DraftKey = NumericParam | 'taxaAgendamentoForecast';

function numericError(
  field: NumericParam,
  params: Parametros
): string | undefined {
  return Number.isFinite(params[field])
    ? undefined
    : 'Informe um número válido.';
}

type PlannerField =
  | {
      field: NumericParam;
      label: string;
      kind: FieldKind;
      hint?: string;
    }
  | {
      field: 'cargoNovoMembro';
      label: string;
      kind: 'text';
      hint?: string;
    };

const SECTIONS: Array<{
  title: string;
  note?: string;
  fields: PlannerField[];
}> = [
  {
    title: 'Meta e ticket',
    fields: [
      {
        field: 'metaMensal',
        label: 'Meta mensal MRR',
        kind: 'currency',
        hint: 'Preencher a cada mês. Referência jul/2026: meta atual R$ 50k/mês, super meta R$ 100k.',
      },
      {
        field: 'ticket',
        label: 'Ticket médio MRR por contrato',
        kind: 'currency',
        hint: 'Ticket médio pós-pivot transportadora (CONTEXTO jul/2026). Ajustar se mudar o mix Silver/Gold/Platinum.',
      },
      {
        field: 'esticada',
        label: '% de esticada sobre o forecast base (meta agressiva)',
        kind: 'percent',
        hint: 'Meta agressiva = base × (1+%). Vexus historicamente estica ~2x (meta 50k vs super meta 100k) — ajuste se quiser refletir isso em vez de 20%.',
      },
    ],
  },
  {
    title: 'Taxas de funil (histórico Vexus)',
    fields: [
      {
        field: 'taxaAgendamento',
        label: 'Taxa de agendamento (MQL → reunião agendada)',
        kind: 'percent',
        hint: 'Baseline Ítalo, jun/2026. Time não tem taxa separada por SDR documentada, ajuste se quebrar Enzo x Ítalo. O Forecast Base não usa esta taxa.',
      },
      {
        field: 'comparecimento',
        label: 'Taxa de comparecimento (agendada → feita)',
        kind: 'percent',
        hint: 'Baseline jun/2026.',
      },
      {
        field: 'conversao',
        label: 'Taxa de conversão em reunião (Felipe, close)',
        kind: 'percent',
        hint: 'Decisão viva de 18/07/2026, status piloto. Substitui a taxa MQL→venda de 20%.',
      },
    ],
  },
  {
    title: 'Projeção de MQL para o mês',
    fields: [
      {
        field: 'mqlAds',
        label: 'MQL projetado Meta Ads',
        kind: 'count',
        hint: 'Preencher a cada mês. Baseline jun/2026: 147 MQL, 100% Meta Ads, investimento parcial após dia 11.',
      },
      {
        field: 'mqlIndicacao',
        label: 'MQL projetado indicação',
        kind: 'count',
      },
      {
        field: 'mqlOutros',
        label: 'MQL projetado outros canais',
        kind: 'count',
      },
    ],
  },
  {
    title: 'Capacidade de agendamento · SDR',
    note: 'Nenhuma fórmula do Forecast Base usa estas taxas.',
    fields: [
      {
        field: 'taxaEnzo',
        label: 'Taxa de agendamento · Enzo',
        kind: 'percent',
        hint: 'EXEMPLO igual à do Ítalo — não documentado separado ainda, ajustar quando tiver o número real do Enzo.',
      },
      {
        field: 'taxaItalo',
        label: 'Taxa de agendamento · Ítalo',
        kind: 'percent',
      },
    ],
  },
  {
    title: 'Pesos da distribuição semanal',
    fields: [
      {
        field: 'pesoSemana1',
        label: 'Peso semana 1 · ativação',
        kind: 'percent',
      },
      {
        field: 'pesoSemana2',
        label: 'Peso semana 2 · aceleração',
        kind: 'percent',
      },
      { field: 'pesoSemana3', label: 'Peso semana 3 · pico', kind: 'percent' },
      {
        field: 'pesoSemana4',
        label: 'Peso semana 4 · fechamento',
        kind: 'percent',
      },
    ],
  },
  {
    title: 'Rampa novo membro do time',
    fields: [
      {
        field: 'cargoNovoMembro',
        label: 'Cargo do novo membro (texto livre)',
        kind: 'text',
        hint: 'Editar: "SDR outbound" (decisão de contratação até 10/ago/2026) ou "SDR Expansão" (upsell de base, decisão viva 29/07/2026).',
      },
      {
        field: 'mesProducao',
        label: 'Mês em que começa a produzir (1, 2, 3...)',
        kind: 'count',
        hint: 'Meses após a contratação, contando integração.',
      },
      {
        field: 'agendamentosSemana',
        label: 'Agendamentos/semana que consegue · mês 1',
        kind: 'count',
        hint: 'EXEMPLO — ajustar conforme o volume de lead disponível pra ele.',
      },
      {
        field: 'conversaoMes1',
        label: 'Taxa de conversão dele · mês 1',
        kind: 'percent',
        hint: 'Rampa inicial',
      },
      {
        field: 'conversaoMes2',
        label: 'Taxa de conversão dele · mês 2',
        kind: 'percent',
        hint: 'Rampa média',
      },
      {
        field: 'conversaoMes3',
        label: 'Taxa de conversão dele · mês 3+',
        kind: 'percent',
        hint: 'Operador pleno',
      },
    ],
  },
];

export function RevenuePlanner() {
  const [params, setParams] = useState<Parametros>(DEFAULT_PARAMETROS);
  const [taxaForecast, setTaxaForecast] = useState(
    DEFAULT_TAXA_AGENDAMENTO_FORECAST
  );
  const [drafts, setDrafts] = useState<Partial<Record<DraftKey, string>>>({});

  const result = useMemo(
    () => computeForecast(params, taxaForecast),
    [params, taxaForecast]
  );
  const errors = new Map(
    result.issues.map((issue) => [issue.field, issue.message])
  );

  function shown(field: DraftKey, kind: FieldKind): string {
    if (drafts[field] !== undefined) return drafts[field];
    const value =
      field === 'taxaAgendamentoForecast' ? taxaForecast : params[field];
    return kind === 'percent'
      ? percentToInput(value)
      : formatInputNumber(value);
  }

  function editNumeric(field: DraftKey, raw: string, kind: FieldKind) {
    setDrafts((current) => ({ ...current, [field]: raw }));
    const parsed = parsePlannerNumber(raw);
    const stored = kind === 'percent' ? parsed / 100 : parsed;
    if (field === 'taxaAgendamentoForecast') {
      setTaxaForecast(stored);
      return;
    }
    setParams((current) => ({ ...current, [field]: stored }));
  }

  function blurNumeric(field: DraftKey) {
    const value =
      field === 'taxaAgendamentoForecast' ? taxaForecast : params[field];
    if (!Number.isFinite(value)) return;
    setDrafts((current) => {
      if (current[field] === undefined) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  return (
    <div
      lang="pt-BR"
      className="min-h-screen bg-black px-4 py-10 text-zinc-100 sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
              EXGROW
              <span className="mx-2 font-normal text-zinc-600">|</span>
              Revenue Planner
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Parâmetros do mês e forecast base em cascata.
            </p>
          </div>
          <div
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-300"
          >
            <LineChart className="size-5" />
          </div>
        </header>

        <section
          data-testid="parametros"
          className="rounded-3xl border border-zinc-800 bg-zinc-950 px-5 py-6 sm:px-8"
        >
          <h2 className="text-base font-semibold tracking-wide text-white">
            PARÂMETROS DE INPUT · MÊS
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Ajuste as células amarelas · todas as abas recalculam sozinhas
          </p>

          <div className="mt-6 flex flex-col gap-8">
            {SECTIONS.map((section) => (
              <div key={section.title} className="flex flex-col gap-3">
                <h3 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                  {section.title}
                </h3>
                {section.note ? (
                  <p className="text-xs text-zinc-500">{section.note}</p>
                ) : null}
                {section.fields.map((field) =>
                  field.kind === 'text' ? (
                    <TextField
                      key={field.field}
                      id={field.field}
                      label={field.label}
                      hint={field.hint}
                      value={params.cargoNovoMembro}
                      onChange={(value) =>
                        setParams((current) => ({
                          ...current,
                          cargoNovoMembro: value,
                        }))
                      }
                    />
                  ) : (
                    <NumberField
                      key={field.field}
                      id={field.field}
                      label={field.label}
                      hint={field.hint}
                      kind={field.kind}
                      value={shown(field.field, field.kind)}
                      error={numericError(field.field, params)}
                      onChange={(value) =>
                        editNumeric(field.field, value, field.kind)
                      }
                      onBlur={() => blurNumeric(field.field)}
                    />
                  )
                )}
              </div>
            ))}
          </div>
        </section>

        <ForecastSection
          forecast={result.forecast}
          blocked={result.issues.length > 0}
          scheduleValue={shown('taxaAgendamentoForecast', 'percent')}
          scheduleError={errors.get('taxaAgendamentoForecast')}
          onScheduleChange={(value) =>
            editNumeric('taxaAgendamentoForecast', value, 'percent')
          }
          onScheduleBlur={() => blurNumeric('taxaAgendamentoForecast')}
        />
      </div>
    </div>
  );
}

function ForecastSection({
  forecast,
  blocked,
  scheduleValue,
  scheduleError,
  onScheduleChange,
  onScheduleBlur,
}: {
  forecast: ForecastBase | null;
  blocked: boolean;
  scheduleValue: string;
  scheduleError?: string;
  onScheduleChange: (value: string) => void;
  onScheduleBlur: () => void;
}) {
  return (
    <section
      data-testid="forecast-base"
      aria-live="polite"
      className="rounded-3xl border border-zinc-800 bg-zinc-950 px-5 py-6 sm:px-8"
    >
      <h2 className="text-base font-semibold tracking-wide text-white">
        FORECAST BASE · FÓRMULA EM CASCATA
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        MQL × Taxa agendamento × Taxa comparecimento × Taxa conversão × Ticket =
        Forecast base
      </p>

      <h3 className="mt-6 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
        Cálculo em cascata
      </h3>

      {blocked ? (
        <p className="mt-3 text-sm text-red-400" data-testid="forecast-blocked">
          Ajuste os campos destacados para calcular o plano.
        </p>
      ) : null}

      <dl className="mt-2">
        <ValueRow
          label="MQL total projetado (todos os canais)"
          value={forecast ? formatCount(forecast.mqlTotal) : '—'}
          testId="forecast-mql"
        />
        <div className="grid gap-2 border-b border-zinc-800/80 py-3 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center">
          <div>
            <Label
              htmlFor="taxaAgendamentoForecast"
              className="text-sm text-zinc-200"
            >
              × Taxa de agendamento
            </Label>
            <p className="mt-1 text-xs text-zinc-500">
              Input desta aba. A cascata não usa a taxa de agendamento dos
              parâmetros.
            </p>
          </div>
          <NumberControl
            id="taxaAgendamentoForecast"
            kind="percent"
            value={scheduleValue}
            error={scheduleError}
            onChange={onScheduleChange}
            onBlur={onScheduleBlur}
          />
        </div>
        <ValueRow
          label="→ Reuniões agendadas no mês"
          value={forecast ? formatCount(forecast.reunioesAgendadas) : '—'}
          testId="forecast-agendadas"
        />
        <ValueRow
          label="× Taxa de comparecimento"
          value={forecast ? formatPercent(forecast.taxaComparecimento, 1) : '—'}
        />
        <ValueRow
          label="→ Reuniões feitas no mês"
          value={forecast ? formatCount(forecast.reunioesFeitas) : '—'}
          testId="forecast-feitas"
        />
        <ValueRow
          label="× Taxa de conversão (close)"
          value={forecast ? formatPercent(forecast.taxaConversao, 2) : '—'}
        />
        <ValueRow
          label="→ Contratos fechados no mês"
          value={forecast ? formatCount(forecast.contratos) : '—'}
          testId="forecast-contratos"
        />
        <ValueRow
          label="× Ticket médio TCV"
          value={forecast ? formatBrl(forecast.ticket) : '—'}
        />
        <ValueRow
          label="Forecast base"
          value={forecast ? formatBrl(forecast.forecastBase) : '—'}
          testId="forecast-base-value"
          emphasize
        />
        <ValueRow
          label="Meta agressiva (base × (1+%))"
          value={forecast ? formatBrl(forecast.metaAgressiva) : '—'}
          testId="meta-agressiva"
          emphasize
        />
      </dl>

      <h3 className="mt-8 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
        Comparativo com a meta
      </h3>
      <dl className="mt-2">
        <ValueRow
          label="Meta definida"
          value={forecast ? formatBrl(forecast.metaDefinida) : '—'}
          testId="meta-definida"
        />
        <ValueRow
          label="Gap forecast base vs meta"
          value={forecast ? formatBrl(forecast.gap) : '—'}
          testId="gap"
        />
      </dl>
      {forecast ? (
        <p
          data-testid="diagnostico"
          className={cn(
            'mt-4 rounded-xl border px-4 py-3 text-sm',
            forecast.onTrack
              ? 'border-emerald-900/80 bg-emerald-950/50 text-emerald-300'
              : 'border-amber-900/80 bg-amber-950/40 text-amber-200'
          )}
        >
          {forecast.diagnostico}
        </p>
      ) : null}

      <h3 className="mt-8 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
        Cenários de sensibilidade · se melhorar 1 alavanca
      </h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
              <th className="py-2 pr-3 font-medium">Alavanca melhorada</th>
              <th className="py-2 pr-3 font-medium">Cenário</th>
              <th className="py-2 text-right font-medium">
                Impacto no forecast
              </th>
            </tr>
          </thead>
          <tbody>
            {(forecast?.cenarios ?? PLACEHOLDER_CENARIOS).map((item, index) => (
              <tr key={item.cenario} className="border-b border-zinc-800/80">
                <td className="py-2.5 pr-3 text-zinc-300">{item.alavanca}</td>
                <td className="py-2.5 pr-3 text-zinc-500">{item.cenario}</td>
                <td
                  className="py-2.5 text-right font-medium text-white tabular-nums"
                  data-testid={`cenario-${index + 1}`}
                >
                  {forecast ? formatBrl(item.impacto) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const PLACEHOLDER_CENARIOS = [
  { alavanca: '+50 MQL adicionais', cenario: 'cenário 1', impacto: 0 },
  {
    alavanca: 'Taxa de agendamento sobe pra 35%',
    cenario: 'cenário 2',
    impacto: 0,
  },
  {
    alavanca: 'Taxa de agendamento sobe pra 45%',
    cenario: 'cenário 3',
    impacto: 0,
  },
  { alavanca: 'Comparecimento sobe pra 80%', cenario: 'cenário 4', impacto: 0 },
  {
    alavanca: 'Conversão (close) sobe pra 40%',
    cenario: 'cenário 5',
    impacto: 0,
  },
  {
    alavanca: 'Ticket sobe pra R$ 12.000 (mix Gold maior)',
    cenario: 'cenário 6',
    impacto: 0,
  },
  {
    alavanca: 'Melhoria simultânea das 3 taxas',
    cenario: 'cenário 7',
    impacto: 0,
  },
];

function ValueRow({
  label,
  value,
  testId,
  emphasize = false,
}: {
  label: string;
  value: string;
  testId?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 border-b border-zinc-800/80 py-2.5',
        emphasize && 'pt-3'
      )}
    >
      <dt
        className={cn(
          'text-sm',
          emphasize ? 'font-semibold text-white' : 'text-zinc-400'
        )}
      >
        {label}
      </dt>
      <dd
        data-testid={testId}
        className={cn(
          'shrink-0 tabular-nums',
          emphasize
            ? 'text-lg font-semibold text-white'
            : 'text-sm text-zinc-100'
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function TextField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
      <div>
        <Label htmlFor={id} className="text-sm font-medium text-zinc-200">
          {label}
        </Label>
        {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
      </div>
      <Input
        id={id}
        value={value}
        data-testid={`input-${id}`}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-xl border-amber-700/40 bg-black px-3 text-zinc-100 focus-visible:border-amber-500 focus-visible:ring-amber-500/30"
      />
    </div>
  );
}

function NumberField({
  id,
  label,
  hint,
  kind,
  value,
  error,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  hint?: string;
  kind: FieldKind;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-start">
      <div className="sm:pt-2">
        <Label htmlFor={id} className="text-sm font-medium text-zinc-200">
          {label}
        </Label>
        {hint ? (
          <p id={`${id}-hint`} className="mt-1 text-xs text-zinc-500">
            {hint}
          </p>
        ) : null}
      </div>
      <NumberControl
        id={id}
        kind={kind}
        value={value}
        error={error}
        hintId={hint ? `${id}-hint` : undefined}
        onChange={onChange}
        onBlur={onBlur}
      />
    </div>
  );
}

function NumberControl({
  id,
  kind,
  value,
  error,
  hintId,
  onChange,
  onBlur,
}: {
  id: string;
  kind: FieldKind;
  value: string;
  error?: string;
  hintId?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const errorId = `${id}-error`;
  const prefix = kind === 'currency' ? 'R$' : undefined;
  const suffix = kind === 'percent' ? '%' : undefined;
  return (
    <div>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-zinc-500">
            {prefix}
          </span>
        ) : null}
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [hintId, error ? errorId : null].filter(Boolean).join(' ') ||
            undefined
          }
          data-testid={`input-${id}`}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          className={cn(
            'h-11 rounded-xl border-amber-700/40 bg-black text-zinc-100 focus-visible:border-amber-500 focus-visible:ring-amber-500/30',
            prefix ? 'pl-9' : 'px-3',
            suffix ? 'pr-8' : 'pr-3'
          )}
        />
        {suffix ? (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-zinc-500">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
