import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMETROS,
  DEFAULT_TAXA_AGENDAMENTO_FORECAST,
  DIAGNOSTICO_GAP,
  DIAGNOSTICO_NO_RUMO,
  computeForecast,
  formatBrl,
  formatCount,
  formatPercent,
  guardDivide,
  percentToInput,
} from './forecast';

function defaults() {
  return computeForecast(DEFAULT_PARAMETROS, DEFAULT_TAXA_AGENDAMENTO_FORECAST);
}

describe('computeForecast defaults', () => {
  it('matches the stored Forecast Base cascade', () => {
    const { forecast, issues } = defaults();

    expect(issues).toEqual([]);
    expect(forecast?.mqlTotal).toBe(30);
    expect(forecast?.reunioesAgendadas).toBeCloseTo(10.5, 8);
    expect(forecast?.reunioesFeitas).toBeCloseTo(7.35, 8);
    expect(forecast?.contratos).toBeCloseTo(4.1895, 8);
    expect(forecast?.forecastBase).toBeCloseTo(8379, 6);
    expect(forecast?.metaAgressiva).toBeCloseTo(12568.5, 6);
    expect(forecast?.gap).toBeCloseTo(-1621, 6);
    expect(forecast?.diagnostico).toBe(DIAGNOSTICO_GAP);
    expect(forecast?.onTrack).toBe(false);
  });

  it('formats the headline numbers in reais', () => {
    const forecast = defaults().forecast;
    expect(forecast).not.toBeNull();
    expect(formatBrl(forecast!.forecastBase).replace(/\s/g, ' ')).toBe(
      'R$ 8.379'
    );
    expect(formatBrl(forecast!.metaAgressiva).replace(/\s/g, ' ')).toBe(
      'R$ 12.568,50'
    );
    expect(formatBrl(forecast!.gap).replace(/\s/g, ' ')).toBe('-R$ 1.621');
  });

  it('uses the local scheduling rate, not Parâmetros C11', () => {
    const changedParam = computeForecast(
      { ...DEFAULT_PARAMETROS, taxaAgendamento: 0.99 },
      DEFAULT_TAXA_AGENDAMENTO_FORECAST
    );
    const changedLocal = computeForecast(DEFAULT_PARAMETROS, 0.45);

    expect(changedParam.forecast?.forecastBase).toBeCloseTo(8379, 6);
    expect(changedLocal.forecast?.forecastBase).toBeCloseTo(10773, 6);
  });

  it('recalculates when MQL inputs change', () => {
    const { forecast } = computeForecast(
      { ...DEFAULT_PARAMETROS, mqlAds: 80, mqlIndicacao: 0, mqlOutros: 0 },
      DEFAULT_TAXA_AGENDAMENTO_FORECAST
    );
    expect(forecast?.mqlTotal).toBe(80);
    expect(forecast?.forecastBase).toBeCloseTo((80 / 30) * 8379, 4);
    expect(forecast?.onTrack).toBe(true);
    expect(forecast?.diagnostico).toBe(DIAGNOSTICO_NO_RUMO);
  });

  it('treats an equal forecast and meta as on track', () => {
    const { forecast } = computeForecast(
      { ...DEFAULT_PARAMETROS, metaMensal: 8379 },
      DEFAULT_TAXA_AGENDAMENTO_FORECAST
    );
    expect(forecast?.gap).toBeCloseTo(0, 6);
    expect(forecast?.diagnostico).toBe(DIAGNOSTICO_NO_RUMO);
  });

  it('matches the seven sensitivity scenarios', () => {
    const impactos = defaults().forecast?.cenarios.map((item) => item.impacto);
    expect(impactos?.map((value) => Math.round(value!))).toEqual([
      22344, 8379, 10773, 9576, 5880, 50274, 6720,
    ]);
  });

  it('keeps scenario 2 on the hardcoded 35% even if C7 changes', () => {
    const { forecast } = computeForecast(DEFAULT_PARAMETROS, 0.5);
    expect(forecast?.cenarios[1]?.impacto).toBeCloseTo(8379, 6);
    expect(forecast?.forecastBase).not.toBeCloseTo(8379, 0);
  });

  it('stops the cascade when a required input is blank', () => {
    const { forecast, issues } = computeForecast(
      { ...DEFAULT_PARAMETROS, comparecimento: Number.NaN },
      DEFAULT_TAXA_AGENDAMENTO_FORECAST
    );
    expect(forecast).toBeNull();
    expect(issues).toEqual([
      { field: 'comparecimento', message: 'Informe um número válido.' },
    ]);
  });

  it('treats a zero rate as a product, not a division', () => {
    const { forecast, issues } = computeForecast(
      { ...DEFAULT_PARAMETROS, comparecimento: 0 },
      DEFAULT_TAXA_AGENDAMENTO_FORECAST
    );
    expect(issues).toEqual([]);
    expect(forecast?.forecastBase).toBe(0);
    expect(formatBrl(0)).toBe('-');
    expect(formatCount(0)).toBe('-');
  });
});

describe('guards and percent inputs', () => {
  it('refuses to divide by zero', () => {
    expect(guardDivide(10, 0)).toEqual({
      ok: false,
      message: 'Não é possível dividir por zero.',
    });
    expect(guardDivide(10, 2)).toEqual({ ok: true, value: 5 });
  });

  it('turns stored fractions into percent-point inputs', () => {
    expect(percentToInput(0.57)).toBe('57');
    expect(percentToInput(0.35)).toBe('35');
    expect(formatPercent(0.57, 2)).toBe('57,00%');
    expect(formatPercent(0.7, 1)).toBe('70,0%');
  });
});
