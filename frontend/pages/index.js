/* SPDX-FileCopyrightText: Ian Suhih */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import '../i18n/i18n';
import LanguageSwitcher from './components/LanguageSwitcher';
import { downloadReport } from './components/reporting/reportService';

export default function Home() {
  const { t, i18n } = useTranslation();
  const apiBase = globalThis.process?.env?.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
  const [activeMenu, setActiveMenu] = useState('calc');
  const [activeTab, setActiveTab] = useState('input');
  const defaultLayers = useMemo(
    () => [
      { name: t('default_layer_corporate'), pfd: 0.1, cyber: false },
      { name: t('default_layer_dmz'), pfd: 0.1, cyber: true },
      { name: t('default_layer_dcs'), pfd: 0.1, cyber: true },
      { name: t('default_layer_paz'), pfd: 0.005, cyber: true, kind: 'sis' },
      { name: t('default_layer_process'), pfd: 0.03, cyber: false }
    ],
    [t]
  );
  const defaultEventNames = useMemo(
    () => [
      t('default_event_1'),
      t('default_event_2'),
      t('default_event_3'),
      t('default_event_4'),
      t('default_event_5'),
      t('default_event_6'),
    ],
    [t]
  );
  const defaultEventLosses = [
    { sle: '20000', currency: 'USD', comment: '' },
    { sle: '50000', currency: 'USD', comment: '' },
    { sle: '150000', currency: 'USD', comment: '' },
    { sle: '250000', currency: 'USD', comment: '' },
    { sle: '700000', currency: 'USD', comment: '' },
    { sle: '500000000', currency: 'USD', comment: '' },
  ];
  const [layers, setLayers] = useState(() => defaultLayers);
  const [eventNames, setEventNames] = useState(() =>
    Array.from({ length: defaultLayers.length + 1 }).map((_, idx) => defaultEventNames[idx] || '')
  );
  const [technicalFile, setTechnicalFile] = useState(null);
  const [organizationalFile, setOrganizationalFile] = useState(null);
  const [attackerType, setAttackerType] = useState('internal');
  const [attackerPotential, setAttackerPotential] = useState('low');
  const [useMonteCarlo, setUseMonteCarlo] = useState(false);
  const [hasSis, setHasSis] = useState(true);
  const [sisIsIsolated, setSisIsIsolated] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [maxLossThreshold, setMaxLossThreshold] = useState('100000');
  const defaultEventNamesRef = useRef([]);
  const [eventLosses, setEventLosses] = useState(() =>
    Array.from({ length: defaultLayers.length + 1 }).map((_, idx) => {
      const fallback = defaultEventLosses[idx];
      if (fallback) {
        return { ...fallback };
      }
      return { sle: '', currency: 'USD', comment: '' };
    })
  );
  const [riskResult, setRiskResult] = useState(null);
  const [riskError, setRiskError] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [recommendations, setRecommendations] = useState('');
  const [recommendationsPrompt, setRecommendationsPrompt] = useState('');
  const [recommendationsError, setRecommendationsError] = useState(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsConfigLoaded, setRecommendationsConfigLoaded] = useState(false);
  const [reportFormat, setReportFormat] = useState('pdf');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);
  const layerColumnMin = 160;
  const layerColumnMax = layerColumnMin * 2;
  const resultColumnMin = layerColumnMin * 2;
  const resultColumnMax = layerColumnMax * 2;
  const totalMinWidth = layerColumnMin * layers.length + resultColumnMin;
  const totalMaxWidth = layerColumnMax * layers.length + resultColumnMax;
  const diagramGridStyle = {
    gridTemplateColumns: `${layers
      .map(() => `minmax(${layerColumnMin}px, 1fr)`)
      .concat(`minmax(${resultColumnMin}px, 2fr)`)
      .join(' ')}`
  };
  const questionnaireLang = (i18n.language || 'en').split('-')[0];
  const supportedQuestionnaireLangs = new Set(['en', 'ru', 'es', 'zh']);
  const questionnaireLocale = supportedQuestionnaireLangs.has(questionnaireLang)
    ? questionnaireLang
    : 'en';
  const technicalQuestionnaireUrl = `/questionnaires/Questionary_Technical_${questionnaireLocale}.csv`;
  const organizationalQuestionnaireUrl = `/questionnaires/Questionary_Organizational_${questionnaireLocale}.csv`;

  const renderRecommendations = (text) => {
    if (!text) return <span>{t('recommendations_empty')}</span>;
    const lines = String(text).split(/\r?\n/);
    const renderInline = (value, keyPrefix) => {
      const parts = String(value).split(/(\*\*.+?\*\*)/g).filter(Boolean);
      return parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return (
            <strong key={`${keyPrefix}-b-${idx}`} className="font-semibold text-slate-900">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={`${keyPrefix}-t-${idx}`}>{part}</span>;
      });
    };
    return (
      <div className="space-y-2">
        {lines.map((line, idx) => {
          const match = /^(#{1,6})\s+(.*)$/.exec(line);
          if (match) {
            const level = match[1].length;
            const content = match[2];
            const headingClasses = {
              1: 'text-xl font-semibold text-slate-900',
              2: 'text-lg font-semibold text-slate-800',
              3: 'text-base font-semibold text-slate-800',
              4: 'text-sm font-semibold text-slate-700 uppercase tracking-wide',
              5: 'text-sm font-semibold text-slate-700',
              6: 'text-xs font-semibold text-slate-600 uppercase tracking-wide',
            }[level];
            return createElement(
              `h${level}`,
              { key: `rec-h-${idx}`, className: headingClasses },
              renderInline(content, `rec-h-${idx}`)
            );
          }
          if (!line.trim()) {
            return <div key={`rec-sp-${idx}`} className="h-3" />;
          }
          return (
            <p key={`rec-p-${idx}`} className="text-sm text-slate-700 whitespace-pre-wrap">
              {renderInline(line, `rec-p-${idx}`)}
            </p>
          );
        })}
      </div>
    );
  };

  const formatApiError = useCallback((err, fallback) => {
    const detail = err?.response?.data?.detail;
    const detailCode = typeof detail === 'string' ? detail : '';
    const messageMap = {
      questionnaire_too_many_rows: 'Questionnaire file exceeds the 300-row limit.',
      model_too_many_rows: 'Uploaded model file exceeds the 300-row limit.',
      invalid_questionnaire_file_type: 'Only CSV questionnaires are supported.',
      invalid_file_type: 'Unsupported file type.',
      questionnaire_file_too_large: 'Questionnaire file is too large.',
      model_file_too_large: 'Model file is too large.',
      invalid_layers_json: 'Layer configuration is invalid.',
      invalid_layers_list: 'At least one layer must be provided.',
      invalid_attacker_type: 'Attacker type is invalid.',
      invalid_attacker_potential: 'Attacker capability is invalid.',
      invalid_event_names_length: 'Event names must match the number of model events.',
      invalid_event_losses_length: 'Event losses must match the number of model events.',
      invalid_report_format: 'Unsupported report format.',
      recommendations_unavailable: 'Recommendations are unavailable. Check .env and model access.',
      internal_server_error: 'The backend failed to process the request.',
    };
    if (detailCode && messageMap[detailCode]) {
      return `${fallback}: ${messageMap[detailCode]}`;
    }
    if (typeof detail === 'object' && Array.isArray(detail?.errors)) {
      return `${fallback}: questionnaire validation failed.`;
    }
    if (err?.code === 'ECONNABORTED') {
      return `${fallback}: request timed out.`;
    }
    if (err?.message) {
      return `${fallback}: ${err.message}`;
    }
    return fallback;
  }, []);

  const safePfd = layers.map((layer) => {
    const value = Number(layer.pfd);
    if (!Number.isFinite(value)) return 0;
    return Math.min(Math.max(value, 0), 1);
  });
  const scenarioBranches = [];
  let cumulativeFailure = 1;
  layers.forEach((layer, index) => {
    const pfd = safePfd[index] ?? 0;
    const successProbability = cumulativeFailure * (1 - pfd);
    const failureProbability = cumulativeFailure * pfd;
    scenarioBranches.push({
      index,
      name: layer.name || t('layer_name_placeholder'),
      stepSuccessProbability: 1 - pfd,
      stepFailureProbability: pfd,
      successProbability,
      failureProbability,
    });
    cumulativeFailure = failureProbability;
  });
  const totalEvents = layers.length + 1;
  const getDefaultEventName = useCallback(
    (index) => defaultEventNames[index] || t('event_label', { number: index + 1 }),
    [defaultEventNames, t]
  );
  const buildDefaultEventNames = useCallback(
    (count) => Array.from({ length: count }).map((_, index) => getDefaultEventName(index)),
    [getDefaultEventName]
  );
  const scenarioOutcomes = scenarioBranches.map((branch) => {
    const eventLabel = t('event_label', { number: branch.index + 1 });
    return {
      key: `success-${branch.index}`,
      label: eventLabel,
      name: eventNames[branch.index] || '',
      probability: branch.successProbability,
      anchorIndex: branch.index,
      type: 'success',
      eventLabel,
    };
  });
  const failureEventLabel = t('event_label', { number: totalEvents });
  scenarioOutcomes.push({
    key: 'failure-final',
    label: failureEventLabel,
    name: eventNames[totalEvents - 1] || t('outcome_breach'),
    probability: cumulativeFailure,
    anchorIndex: layers.length - 1,
    type: 'failure',
  });

  const scenarioHeight = Math.max(240, 120 + scenarioOutcomes.length * 40);
  const columnWidths = layers.map(() => layerColumnMin).concat(resultColumnMin);
  const scenarioWidth = totalMinWidth;
  const scenarioTop = 30;
  const scenarioBottom = scenarioHeight - 45;
  const scenarioMainY = scenarioBottom;
  const scenarioOutcomeStep =
    scenarioOutcomes.length > 1 ? (scenarioBottom - scenarioTop) / (scenarioOutcomes.length - 1) : 0;
  const columnOffsets = columnWidths.reduce((acc, width, index) => {
    const start = index === 0 ? 0 : acc[index - 1].end;
    acc.push({ start, end: start + width });
    return acc;
  }, []);
  const scenarioColumnCenter = (index) =>
    columnOffsets[index] ? (columnOffsets[index].start + columnOffsets[index].end) / 2 : 0;
  const layerCenters = layers.map((_, index) => scenarioColumnCenter(index));
  const resultCenterX = scenarioColumnCenter(layers.length);
  const resultColumnBounds = columnOffsets[layers.length] || {
    start: resultCenterX,
    end: resultCenterX + resultColumnMin,
  };
  const formatProbabilityPercent = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0%';
    const percent = numeric * 100;
    if (percent === 0) return '0%';
    if (Math.abs(percent) < 0.01) {
      return `${percent.toExponential(2).replace('e', 'e^')}%`;
    }
    let trimmed = '';
    if (Math.abs(percent) < 0.1) {
      trimmed = Number(percent.toPrecision(2)).toString();
    } else {
      trimmed = percent.toFixed(1).replace(/\.?0+$/, '');
    }
    return `${trimmed}%`;
  };

  const formatProbabilityComparison = (currentValue, baselineValue) => {
    return `${formatProbabilityPercent(currentValue)} (${formatProbabilityPercent(baselineValue)})`;
  };

  const formatMoney = (value, currency) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '-';
    const label = currency ? ` ${currency}` : '';
    return `${numeric.toLocaleString()}${label}`;
  };

  const getMaturityBadge = (value) => {
    if (value === null || value === undefined) {
      return { label: '-', className: 'text-slate-500' };
    }
    if (value < 25) {
      return { label: t('risk_maturity_level_critical'), className: 'text-rose-600' };
    }
    if (value < 50) {
      return { label: t('risk_maturity_level_low'), className: 'text-orange-500' };
    }
    if (value < 75) {
      return { label: t('risk_maturity_level_medium'), className: 'text-amber-500' };
    }
    return { label: t('risk_maturity_level_high'), className: 'text-emerald-600' };
  };

  useEffect(() => {
    const nextDefaults = buildDefaultEventNames(totalEvents);
    if (defaultEventNamesRef.current.length === 0) {
      defaultEventNamesRef.current = nextDefaults;
      return;
    }
    const previousDefaults = defaultEventNamesRef.current;
    setEventNames((current) =>
      current.map((name, index) => {
        const prevDefault = previousDefaults[index];
        const nextDefault = nextDefaults[index] || '';
        if (!name || name === prevDefault) {
          return nextDefault;
        }
        return name;
      })
    );
    defaultEventNamesRef.current = nextDefaults;
  }, [i18n.language, totalEvents, buildDefaultEventNames]);

  useEffect(() => {
    if (activeTab !== 'reco' || recommendationsConfigLoaded) return;
    const fetchConfig = async () => {
      try {
        const res = await axios.get(`${apiBase}/api/v1/recommendations/config`, { timeout: 300000 });
        if (!recommendationsPrompt) {
          setRecommendationsPrompt(res.data?.user_prompt || '');
        }
      } catch (err) {
        setRecommendationsError(formatApiError(err, t('recommendations_config_error')));
      } finally {
        setRecommendationsConfigLoaded(true);
      }
    };
    fetchConfig();
  }, [activeTab, recommendationsConfigLoaded, recommendationsPrompt, apiBase, formatApiError, t]);

  const getLossStyle = (value) => {
    const numeric = Number(value);
    const threshold = Number(maxLossThreshold);
    if (!Number.isFinite(numeric) || !Number.isFinite(threshold) || threshold <= 0) {
      return undefined;
    }
    const ratio = numeric / threshold;
    if (ratio <= 0.8) {
      return { backgroundColor: '#22c55e' };
    }
    if (ratio >= 1.2) {
      return { backgroundColor: '#ef4444' };
    }
    const t = Math.min(Math.max((ratio - 0.8) / 0.4, 0), 1);
    const start = { r: 34, g: 197, b: 94 };
    const mid = { r: 250, g: 204, b: 21 };
    const end = { r: 239, g: 68, b: 68 };
    const mix = (a, b, factor) => Math.round(a + (b - a) * factor);
    const from = t < 0.5 ? start : mid;
    const to = t < 0.5 ? mid : end;
    const local = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    return {
      backgroundColor: `rgb(${mix(from.r, to.r, local)}, ${mix(from.g, to.g, local)}, ${mix(from.b, to.b, local)})`,
    };
  };

  const validateCsvFile = (selected, inputEl) => {
    if (!selected) return true;
    const isCsv = selected.name.toLowerCase().endsWith('.csv');
    if (!isCsv) {
      if (inputEl) {
        inputEl.value = '';
      }
      return false;
    }
    return true;
  };

  const handleTechnicalFileChange = (e) => {
    const selected = e.target.files[0] || null;
    if (!validateCsvFile(selected, e.target)) {
      return;
    }
    setTechnicalFile(selected);
  };

  const handleOrganizationalFileChange = (e) => {
    const selected = e.target.files[0] || null;
    if (!validateCsvFile(selected, e.target)) {
      return;
    }
    setOrganizationalFile(selected);
  };

  const handleLayerChange = (i, key, value) => {
    const updated = [...layers];
    if (key === 'pfd') {
      updated[i][key] = parseFloat(value);
    } else if (key === 'cyber') {
      updated[i][key] = Boolean(value);
    } else {
      updated[i][key] = value;
    }
    setLayers(updated);
  };

  const handleEventNameChange = (i, value) => {
    const updated = [...eventNames];
    updated[i] = value;
    setEventNames(updated);
  };

  const handleEventLossChange = (index, key, value) => {
    const updated = [...eventLosses];
    if (!updated[index]) {
      updated[index] = { sle: '', currency: 'USD', comment: '' };
    }
    updated[index][key] = value;
    setEventLosses(updated);
  };

  const addLayer = () => {
    if (layers.length < 10) {
      setLayers([...layers, { name: '', pfd: 0.1, cyber: true }]);
      const previousFailure = eventNames[eventNames.length - 1] || '';
      setEventNames([...eventNames.slice(0, -1), '', previousFailure]);
      const previousFailureLoss = eventLosses[eventLosses.length - 1] || {
        sle: '',
        currency: 'USD',
        comment: '',
      };
      setEventLosses([...eventLosses.slice(0, -1), { sle: '', currency: 'USD', comment: '' }, previousFailureLoss]);
    }
  };

  const removeLayer = (index) => {
    const removed = layers[index];
    setLayers(layers.filter((_, i) => i !== index));
    setEventNames(eventNames.filter((_, i) => i !== index));
    setEventLosses(eventLosses.filter((_, i) => i !== index));
    if (removed && removed.kind === 'sis') {
      setHasSis(false);
    }
  };

  const ensureSisLayer = (enabled) => {
    const sisIndex = layers.findIndex((layer) => layer.kind === 'sis');
    if (!enabled && sisIndex >= 0) {
      removeLayer(sisIndex);
      return;
    }
    if (enabled && sisIndex === -1) {
      const previousFailure = eventNames[eventNames.length - 1] || '';
      setLayers([...layers, { name: t('default_layer_paz'), pfd: 0.005, cyber: true, kind: 'sis' }]);
      setEventNames([...eventNames.slice(0, -1), '', previousFailure]);
      const previousFailureLoss = eventLosses[eventLosses.length - 1] || {
        sle: '',
        currency: 'USD',
        comment: '',
      };
      setEventLosses([...eventLosses.slice(0, -1), { sle: '', currency: 'USD', comment: '' }, previousFailureLoss]);
    }
  };

  const handleSisToggle = (value) => {
    setHasSis(value);
    if (!value) {
      setSisIsIsolated(false);
    }
    ensureSisLayer(value);
  };

  const handleLayerDragStart = (index) => {
    setDragIndex(index);
  };

  const handleLayerDragOver = (event) => {
    event.preventDefault();
  };

  const handleLayerDrop = (index) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      return;
    }
    const reordered = [...layers];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    const failureEvent = eventNames[eventNames.length - 1] || '';
    const reorderedEvents = [...eventNames.slice(0, -1)];
    const [movedEvent] = reorderedEvents.splice(dragIndex, 1);
    reorderedEvents.splice(index, 0, movedEvent);
    setLayers(reordered);
    setEventNames([...reorderedEvents, failureEvent]);
    const failureLoss = eventLosses[eventLosses.length - 1] || { sle: '', currency: 'USD', comment: '' };
    const reorderedLosses = [...eventLosses.slice(0, -1)];
    const [movedLoss] = reorderedLosses.splice(dragIndex, 1);
    reorderedLosses.splice(index, 0, movedLoss);
    setEventLosses([...reorderedLosses, failureLoss]);
    setDragIndex(null);
  };


  const handleRiskAssessment = async () => {
    setRiskError(null);
    setRiskLoading(true);
    if (!technicalFile) {
      setRiskLoading(false);
      setRiskError(t('risk_missing_technical'));
      return;
    }
    try {
      const derivedEventNames = Array.from({ length: totalEvents }).map((_, idx) => {
        const name = eventNames[idx];
        if (name) return name;
        if (idx === totalEvents - 1) return t('outcome_breach');
        return t('event_label', { number: idx + 1 });
      });
      const formData = new globalThis.FormData();
      formData.append('technical_questionnaire', technicalFile);
      if (organizationalFile) {
        formData.append('organizational_questionnaire', organizationalFile);
      }
      formData.append('layers', JSON.stringify(layers));
      formData.append('attacker_type', attackerType);
      formData.append('attacker_potential', attackerPotential);
      formData.append('event_names', JSON.stringify(derivedEventNames));
      formData.append('event_losses', JSON.stringify(eventLosses));
      formData.append('use_monte_carlo', useMonteCarlo ? 'true' : 'false');
      formData.append('sis_is_integrated', sisIsIsolated ? 'false' : 'true');
      if (maxLossThreshold !== '') {
        formData.append('max_loss_threshold', String(maxLossThreshold));
      }
      const res = await axios.post(`${apiBase}/api/v1/risk_assessment`, formData, { timeout: 300000 });
      setRiskResult(res.data);
    } catch (err) {
      setRiskError(formatApiError(err, t('risk_error')));
    } finally {
      setRiskLoading(false);
    }
  };

  const handleRecommendations = async () => {
    setRecommendationsError(null);
    setRecommendationsLoading(true);
    if (!technicalFile) {
      setRecommendationsLoading(false);
      setRecommendationsError(t('recommendations_missing_technical'));
      return;
    }
    try {
      const formData = new globalThis.FormData();
      formData.append('technical_questionnaire', technicalFile);
      if (organizationalFile) {
        formData.append('organizational_questionnaire', organizationalFile);
      }
      formData.append('layers', JSON.stringify(layers));
      formData.append('attacker_type', attackerType);
      formData.append('attacker_potential', attackerPotential);
      formData.append('sis_is_integrated', sisIsIsolated ? 'false' : 'true');
      if (recommendationsPrompt) {
        formData.append('user_prompt', recommendationsPrompt);
      }
      const res = await axios.post(`${apiBase}/api/v1/recommendations`, formData, { timeout: 300000 });
      setRecommendations(res.data?.recommendations || '');
    } catch (err) {
      setRecommendationsError(formatApiError(err, t('recommendations_error')));
    } finally {
      setRecommendationsLoading(false);
    }
  };

  const handleSaveReport = async () => {
    setReportError(null);
    if (!technicalFile) {
      setReportError(t('report_missing_technical'));
      return;
    }
    if (!recommendations) {
      setReportError(t('report_missing_recommendations'));
      return;
    }
    setReportLoading(true);
    try {
      const derivedEventNames = Array.from({ length: totalEvents }).map((_, idx) => {
        const name = eventNames[idx];
        if (name) return name;
        if (idx === totalEvents - 1) return t('outcome_breach');
        return t('event_label', { number: idx + 1 });
      });
      await downloadReport({
        apiBase,
        technicalFile,
        organizationalFile,
        layers,
        attackerType,
        attackerPotential,
        useMonteCarlo,
        sisIsIsolated,
        eventNames: derivedEventNames,
        eventLosses,
        recommendations,
        reportFormat,
      });
    } catch (err) {
      setReportError(formatApiError(err, t('report_error')));
    } finally {
      setReportLoading(false);
    }
  };

  const riskLayers = riskResult?.layers || [];
  const riskTotalEvents = riskLayers.length + 1;
  const riskDiagramGridStyle = {
    gridTemplateColumns: `${riskLayers
      .map(() => `minmax(${layerColumnMin}px, 1fr)`)
      .concat(`minmax(${resultColumnMin}px, 2fr)`)
      .join(' ')}`
  };
  const riskTotalMinWidth = layerColumnMin * riskLayers.length + resultColumnMin;
  const riskTotalMaxWidth = layerColumnMax * riskLayers.length + resultColumnMax;

  const riskScenarioBranches = [];
  let riskCumulative = 1;
  let riskCumulativeBase = 1;
  const baselinePfdByIndex = layers.map((layer) => {
    const value = Number(layer.pfd);
    if (!Number.isFinite(value)) return 0;
    return Math.min(Math.max(value, 0), 1);
  });
  riskLayers.forEach((layer, index) => {
    const newFail = Number(layer.effective_pfd || 0);
    const oldFail = baselinePfdByIndex[index] ?? Number(layer.base_pfd || 0);
    const newSuccess = 1 - newFail;
    const oldSuccess = 1 - oldFail;
    riskScenarioBranches.push({
      index,
      name: layer.name,
      stepFailureProbability: newFail,
      stepFailureProbabilityBase: oldFail,
      stepSuccessProbability: newSuccess,
      stepSuccessProbabilityBase: oldSuccess,
      successProbability: riskCumulative * newSuccess,
      successProbabilityBase: riskCumulativeBase * oldSuccess,
    });
    riskCumulative *= newFail;
    riskCumulativeBase *= oldFail;
  });

  const riskScenarioOutcomes = riskScenarioBranches.map((branch) => {
    const eventLabel = t('event_label', { number: branch.index + 1 });
    return {
      key: `risk-success-${branch.index}`,
      label: eventLabel,
      name: eventNames[branch.index] || '',
      probability: branch.successProbability,
      probabilityBase: branch.successProbabilityBase,
      anchorIndex: branch.index,
      type: 'success',
    };
  });
  if (riskLayers.length > 0) {
    riskScenarioOutcomes.push({
      key: 'risk-failure-final',
      label: t('event_label', { number: riskTotalEvents }),
      name: eventNames[riskTotalEvents - 1] || t('outcome_breach'),
      probability: riskCumulative,
      probabilityBase: riskCumulativeBase,
      anchorIndex: riskLayers.length - 1,
      type: 'failure',
    });
  }

  const riskScenarioHeight = Math.max(240, 120 + riskScenarioOutcomes.length * 40);
  const riskScenarioWidth = riskTotalMinWidth;
  const riskScenarioTop = 30;
  const riskScenarioBottom = riskScenarioHeight - 45;
  const riskScenarioMainY = riskScenarioBottom;
  const riskScenarioOutcomeStep =
    riskScenarioOutcomes.length > 1 ? (riskScenarioBottom - riskScenarioTop) / (riskScenarioOutcomes.length - 1) : 0;
  const riskColumnWidths = riskLayers.map(() => layerColumnMin).concat(resultColumnMin);
  const riskColumnOffsets = riskColumnWidths.reduce((acc, width, index) => {
    const start = index === 0 ? 0 : acc[index - 1].end;
    acc.push({ start, end: start + width });
    return acc;
  }, []);
  const riskColumnCenter = (index) =>
    riskColumnOffsets[index] ? (riskColumnOffsets[index].start + riskColumnOffsets[index].end) / 2 : 0;
  const riskLayerCenters = riskLayers.map((_, index) => riskColumnCenter(index));
  const riskResultCenterX = riskColumnCenter(riskLayers.length);
  const riskResultColumnBounds = riskColumnOffsets[riskLayers.length] || {
    start: riskResultCenterX,
    end: riskResultCenterX + resultColumnMin,
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className="w-full px-6 py-4 flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-widest text-slate-500">{t('app_subtitle')}</div>
            <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
          </div>
          {createElement(LanguageSwitcher)}
        </div>
      </header>

      <div className="w-full px-6 py-8 grid gap-6 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-slate-200 bg-white p-4 h-fit lg:self-start">
          <div className="text-xs uppercase tracking-widest text-slate-500 mb-3">{t('menu_title')}</div>
          <nav className="space-y-1">
            {[
              { id: 'calc', label: t('menu_calc') },
              { id: 'settings', label: t('menu_settings') },
              { id: 'balance', label: t('menu_balance') },
              { id: 'history', label: t('menu_history') },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveMenu(item.id);
                  setActiveTab(item.id === 'calc' ? 'input' : 'single');
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                  activeMenu === item.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-6 min-w-0">
          <div className="flex flex-wrap gap-2">
            {activeMenu === 'calc' ? (
              [
                { id: 'input', label: t('tab_input') },
                { id: 'diagram', label: t('tab_diagram') },
                { id: 'risk', label: t('tab_risk') },
                { id: 'reco', label: t('tab_recommendations') },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-lg text-sm border ${
                    activeTab === tab.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))
            ) : (
              <button className="px-4 py-2 rounded-lg text-sm border bg-slate-900 text-white border-slate-900">
                {activeMenu === 'settings' && t('tab_settings')}
                {activeMenu === 'balance' && t('tab_balance')}
                {activeMenu === 'history' && t('tab_history')}
              </button>
            )}
          </div>

          {activeMenu === 'calc' && activeTab === 'input' && (
            <div className="space-y-6">
              <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                <label className="block mb-4 text-sm font-medium text-slate-700">{t('input_data_title')}</label>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="text-xs uppercase tracking-widest text-slate-500">
                      {t('questionnaire_download_title')}
                    </div>
                    <label className="block text-xs text-slate-500">{t('questionnaire_tech_title')}</label>
                    <a
                      href={technicalQuestionnaireUrl}
                      className="inline-flex items-center justify-center rounded-lg bg-slate-900 text-white text-sm px-3 py-1.5 hover:bg-slate-800"
                      download
                    >
                      {t('download_questionnaire')}
                    </a>
                    <label className="block text-xs text-slate-500 mt-2">{t('questionnaire_org_title')}</label>
                    <a
                      href={organizationalQuestionnaireUrl}
                      className="inline-flex items-center justify-center rounded-lg bg-slate-900 text-white text-sm px-3 py-1.5 hover:bg-slate-800"
                      download
                    >
                      {t('download_questionnaire')}
                    </a>
                  </div>
                  <div className="space-y-3">
                    <div className="text-xs uppercase tracking-widest text-slate-500">
                      {t('upload_filled_title')}
                    </div>
                    <label className="block text-xs text-slate-500">{t('upload_tech_survey')}</label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleTechnicalFileChange}
                      className="file:bg-slate-900 file:text-white file:px-4 file:py-2 file:rounded-lg file:font-medium file:border-none bg-white text-sm w-full"
                    />
                    <label className="block text-xs text-slate-500 mt-2">{t('upload_org_survey')}</label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleOrganizationalFileChange}
                      className="file:bg-slate-900 file:text-white file:px-4 file:py-2 file:rounded-lg file:font-medium file:border-none bg-white text-sm w-full"
                    />
                    <p className="text-xs text-slate-500 mt-1">{t('file_hint')}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                <label className="block mb-4 text-sm font-medium text-slate-700">
                  {t('attacker_params_title')}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-2">{t('attacker_type_label')}</label>
                    <select
                      value={attackerType}
                      onChange={(e) => setAttackerType(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="internal">{t('attacker_type_internal')}</option>
                      <option value="external">{t('attacker_type_external')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-2">{t('attacker_potential_label')}</label>
                    <select
                      value={attackerPotential}
                      onChange={(e) => setAttackerPotential(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="low">{t('attacker_potential_low')}</option>
                      <option value="medium">{t('attacker_potential_medium')}</option>
                      <option value="high">{t('attacker_potential_high')}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                <label className="block mb-4 text-sm font-medium text-slate-700">
                  {t('sis_block_title')}
                </label>
                <div className="flex flex-col gap-3 text-sm text-slate-600">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hasSis}
                      onChange={(e) => handleSisToggle(e.target.checked)}
                      className="h-4 w-4"
                    />
                    {t('sis_exists_label')}
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={sisIsIsolated}
                      onChange={(e) => setSisIsIsolated(e.target.checked)}
                      className="h-4 w-4"
                      disabled={!hasSis}
                    />
                    {t('sis_isolated_label')}
                  </label>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-sm font-semibold text-slate-700">{t('layers_title')}</h2>
                  <button
                    onClick={addLayer}
                    disabled={layers.length >= 10}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-sm px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    + {t('add_layer')}
                  </button>
                </div>
                {layers.map((layer, index) => (
                  <div
                    key={index}
                    className="flex flex-col md:flex-row md:items-center gap-2 py-1"
                    draggable
                    onDragStart={() => handleLayerDragStart(index)}
                    onDragOver={handleLayerDragOver}
                    onDrop={() => handleLayerDrop(index)}
                  >
                    <input
                      type="text"
                      placeholder={t('layer_name_placeholder')}
                      value={layer.name}
                      onChange={(e) => handleLayerChange(index, 'name', e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm w-full md:w-1/2"
                    />
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      max="1"
                      value={layer.pfd}
                      onChange={(e) => handleLayerChange(index, 'pfd', e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm w-full md:w-1/4"
                    />
                    <label className="inline-flex items-center gap-2 text-sm text-slate-600 md:w-1/4">
                      <input
                        type="checkbox"
                        checked={Boolean(layer.cyber)}
                        onChange={(e) => handleLayerChange(index, 'cyber', e.target.checked)}
                        className="h-4 w-4"
                      />
                      {t('layer_cyber_label')}
                    </label>
                    <button
                      onClick={() => removeLayer(index)}
                      className="text-slate-500 hover:text-slate-700 text-sm"
                    >
                      {t('remove')}
                    </button>
                  </div>
                ))}
                {layers.length >= 10 && <p className="text-xs text-amber-600 mt-1">{t('max_layers_warning')}</p>}
              </div>

              <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                <label className="block mb-4 text-sm font-medium text-slate-700">
                  {t('damage_assessment_title')}
                </label>
                <div className="mb-4 max-w-md">
                  <label className="block text-xs text-slate-500 mb-1">
                    {t('max_loss_label')}
                  </label>
                  <input
                    type="number"
                    value={maxLossThreshold}
                    onChange={(e) => setMaxLossThreshold(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm w-full"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr_0.6fr_1.4fr] gap-3 text-xs text-slate-500 mb-2">
                  <div>{t('risk_event')}</div>
                  <div>{t('risk_sle')}</div>
                  <div>{t('risk_currency')}</div>
                  <div>{t('risk_comment')}</div>
                </div>
                {Array.from({ length: totalEvents }).map((_, index) => (
                  <div
                    key={`event-sle-${index}`}
                    className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr_0.6fr_1.4fr] gap-3 py-1"
                  >
                    <div className="text-sm text-slate-700">
                      {eventNames[index] || t('event_label', { number: index + 1 })}
                    </div>
                    <input
                      type="number"
                      value={eventLosses[index]?.sle || ''}
                      onChange={(e) => handleEventLossChange(index, 'sle', e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <select
                      value={eventLosses[index]?.currency || 'USD'}
                      onChange={(e) => handleEventLossChange(index, 'currency', e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="RUB">RUB</option>
                      <option value="CNY">CNY</option>
                    </select>
                    <input
                      type="text"
                      value={eventLosses[index]?.comment || ''}
                      onChange={(e) => handleEventLossChange(index, 'comment', e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-600">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={useMonteCarlo}
                    onChange={(e) => setUseMonteCarlo(e.target.checked)}
                    className="h-4 w-4"
                  />
                  {t('monte_carlo_label')}
                </label>
                <div className="relative group">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] text-slate-600">
                    i
                  </span>
                  <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    {t('monte_carlo_hint')}
                  </div>
                </div>
              </div>

            </div>
          )}

          {activeMenu === 'calc' && activeTab === 'diagram' && (
            <div className="space-y-6">
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <div style={{ width: `clamp(${totalMinWidth}px, 100%, ${totalMaxWidth}px)` }}>
                    <div className="grid bg-slate-900 text-white text-xs font-medium" style={diagramGridStyle}>
                      {layers.map((_, index) => (
                        <div key={`layer-header-${index}`} className="px-3 py-2 border-r border-slate-800">
                          {t('lopa_layer')} {index + 1}
                        </div>
                      ))}
                      <div className="px-3 py-2">{t('lopa_result')}</div>
                    </div>
                <div className="grid text-xs bg-white" style={diagramGridStyle}>
                  {layers.map((layer, index) => (
                    <div key={`layer-name-${index}`} className="px-3 py-3 border-r border-slate-200">
                      <div>{layer.name || t('layer_name_placeholder')}</div>
                      <label className="mt-2 inline-flex items-center gap-2 text-[11px] text-slate-500">
                        <input type="checkbox" checked={Boolean(layer.cyber)} readOnly className="h-3 w-3" />
                        {t('layer_cyber_label')}
                      </label>
                    </div>
                  ))}
                      <div
                        className="px-3 py-3"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          wordBreak: 'break-word',
                        }}
                      >
                        {t('lopa_result_desc')}
                      </div>
                    </div>
                    <div
                      className="relative bg-black"
                      style={{ aspectRatio: `${scenarioWidth} / ${scenarioHeight}` }}
                    >
                      <svg
                        viewBox={`0 0 ${scenarioWidth} ${scenarioHeight}`}
                        className="absolute inset-0 h-full w-full"
                        preserveAspectRatio="xMinYMin meet"
                      >
                      {layerCenters.length > 0 && (
                        <line
                          x1="0"
                          y1={scenarioMainY}
                          x2={layerCenters[0]}
                          y2={scenarioMainY}
                          stroke="#ef4444"
                          strokeWidth="4"
                        />
                      )}
                      {layerCenters.slice(0, -1).map((x, index) => {
                        const nextX = layerCenters[index + 1];
                        return (
                          <g key={`scenario-path-${index}`}>
                            <line
                              x1={x}
                              y1={scenarioMainY}
                              x2={nextX}
                              y2={scenarioMainY}
                              stroke="#ef4444"
                              strokeWidth="4"
                            />
                            <text
                              x={(x + nextX) / 2}
                              y={scenarioMainY - 10}
                              fill="#fca5a5"
                              fontSize="11"
                              textAnchor="middle"
                            >
                            {t('branch_failure')} {formatProbabilityPercent(scenarioBranches[index].stepFailureProbability || 0)}
                            </text>
                          </g>
                        );
                      })}
                      {layerCenters.map((x, index) => {
                        const isCyber = Boolean(layers[index]?.cyber);
                        return (
                          <circle
                            key={`scenario-split-${index}`}
                            cx={x}
                            cy={scenarioMainY}
                            r="6"
                            fill={isCyber ? "#f97316" : "#94a3b8"}
                          />
                        );
                      })}
                            {scenarioOutcomes.map((outcome, index) => {
                              const originX = layerCenters[outcome.anchorIndex] ?? 0;
                              const y = scenarioTop + scenarioOutcomeStep * index;
                              const textX = resultCenterX + 12;
                              const textY = y - 6;
                              const isSuccess = outcome.type === 'success';
                              const strokeColor = isSuccess ? '#22c55e' : '#ef4444';
                              const nameText = outcome.name || '';
                              const nameX = textX;
                              const nameWidth = Math.max(0, resultColumnBounds.end - textX - 8);
                              const nameCharsPerLine = Math.max(1, Math.floor(nameWidth / 6));
                              const nameLineCount = Math.min(2, Math.ceil(nameText.length / nameCharsPerLine));
                              const probabilityY = textY + (nameLineCount >= 2 ? 42 : 28);
                              return (
                                <g key={outcome.key}>
                                  {isSuccess && (
                                    <text
                                x={originX + 10}
                                y={(scenarioMainY + y) / 2}
                                fill="#86efac"
                                fontSize="11"
                              >
                                {t('branch_success')} {formatProbabilityPercent(scenarioBranches[outcome.anchorIndex]?.stepSuccessProbability || 0)}
                              </text>
                            )}
                            <line
                              x1={originX}
                              y1={scenarioMainY}
                              x2={originX}
                              y2={y}
                              stroke={strokeColor}
                              strokeWidth="3"
                            />
                            <line
                              x1={originX}
                              y1={y}
                              x2={resultCenterX}
                              y2={y}
                              stroke={strokeColor}
                              strokeWidth="3"
                            />
                                  <text x={textX} y={textY} fill="#e2e8f0" fontSize="12">
                                    {outcome.label}
                                  </text>
                                  <foreignObject x={nameX} y={textY + 4} width={nameWidth} height="26">
                                    <div
                                      xmlns="http://www.w3.org/1999/xhtml"
                                      style={{
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        wordBreak: 'break-word',
                                        fontSize: '11px',
                                        lineHeight: 1.2,
                                        color: '#94a3b8',
                                      }}
                                    >
                                      {nameText}
                                    </div>
                                  </foreignObject>
                                  <text x={textX} y={probabilityY} fill={strokeColor} fontSize="11">
                                    {formatProbabilityPercent(outcome.probability || 0)}
                                  </text>
                                </g>
                              );
                            })}
                      <line
                        x1={resultCenterX}
                        y1={scenarioTop}
                        x2={resultCenterX}
                        y2={scenarioBottom}
                        stroke="#94a3b8"
                        strokeWidth="2"
                        opacity="0.7"
                      />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-700">{t('lopa_layers_title')}</h3>
                  <button
                    onClick={addLayer}
                    disabled={layers.length >= 10}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-sm px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    + {t('add_layer')}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-2 text-xs text-slate-500 mb-2">
                  <div>{t('layer_name_placeholder')}</div>
                  <div>{t('pfd_label')}</div>
                  <div className="opacity-0">x</div>
                </div>
                {layers.map((layer, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-2 py-1">
                    <input
                      type="text"
                      placeholder={t('layer_name_placeholder')}
                      value={layer.name}
                      onChange={(e) => handleLayerChange(index, 'name', e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      max="1"
                      value={layer.pfd}
                      onChange={(e) => handleLayerChange(index, 'pfd', e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => removeLayer(index)}
                      className="text-slate-500 hover:text-slate-700 text-sm px-2"
                    >
                      {t('remove')}
                    </button>
                  </div>
                ))}
                {layers.length >= 10 && <p className="text-xs text-amber-600 mt-1">{t('max_layers_warning')}</p>}
              </div>

              <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">{t('event_names_title')}</h3>
                <div className="grid gap-2">
                  {Array.from({ length: totalEvents }).map((_, index) => (
                    <div key={`event-name-${index}`} className="grid grid-cols-[80px_1fr] items-center gap-3">
                      <div className="text-xs text-slate-500">{t('event_label', { number: index + 1 })}</div>
                      <input
                        type="text"
                        placeholder={t('event_name_placeholder')}
                        value={eventNames[index] || ''}
                        onChange={(e) => handleEventNameChange(index, e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm w-full"
                      />
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {activeMenu === 'calc' && activeTab === 'risk' && (
            <div className="space-y-6">
              <div className="rounded-lg border border-slate-200 p-4 bg-white">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleRiskAssessment();
                    }}
                    className="bg-slate-900 hover:bg-slate-800 px-5 py-2.5 text-white rounded-lg text-sm"
                  >
                    {riskLoading ? t('risk_loading') : t('risk_run')}
                  </button>
                  {riskError && <div className="text-rose-600 text-sm">{riskError}</div>}
                </div>
                {riskResult && riskLayers.length > 0 && (
                  <div className="mt-4 rounded-lg border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <div style={{ width: `clamp(${riskTotalMinWidth}px, 100%, ${riskTotalMaxWidth}px)` }}>
                        <div className="grid bg-slate-900 text-white text-xs font-medium" style={riskDiagramGridStyle}>
                          {riskLayers.map((_, index) => (
                            <div key={`risk-layer-header-${index}`} className="px-3 py-2 border-r border-slate-800">
                              {t('lopa_layer')} {index + 1}
                            </div>
                          ))}
                          <div className="px-3 py-2">{t('lopa_result')}</div>
                        </div>
                        <div className="grid text-xs bg-white" style={riskDiagramGridStyle}>
                          {riskLayers.map((layer, index) => (
                            <div key={`risk-layer-name-${index}`} className="px-3 py-3 border-r border-slate-200">
                              <div>{layer.name || t('layer_name_placeholder')}</div>
                              <label className="mt-2 inline-flex items-center gap-2 text-[11px] text-slate-500">
                                <input type="checkbox" checked={Boolean(layer.cyber_sensitive)} readOnly className="h-3 w-3" />
                                {t('layer_cyber_label')}
                              </label>
                            </div>
                          ))}
                          <div
                            className="px-3 py-3"
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              wordBreak: 'break-word',
                            }}
                          >
                            {t('lopa_result_desc')}
                          </div>
                        </div>
                        <div
                          className="relative bg-black"
                          style={{ aspectRatio: `${riskScenarioWidth} / ${riskScenarioHeight}` }}
                        >
                          <svg
                            viewBox={`0 0 ${riskScenarioWidth} ${riskScenarioHeight}`}
                            className="absolute inset-0 h-full w-full"
                            preserveAspectRatio="xMinYMin meet"
                          >
                            {riskLayerCenters.length > 0 && (
                              <line
                                x1="0"
                                y1={riskScenarioMainY}
                                x2={riskLayerCenters[0]}
                                y2={riskScenarioMainY}
                                stroke="#ef4444"
                                strokeWidth="4"
                              />
                            )}
                            {riskLayerCenters.slice(0, -1).map((x, index) => {
                              const nextX = riskLayerCenters[index + 1];
                              const branch = riskScenarioBranches[index];
                              return (
                                <g key={`risk-path-${index}`}>
                                  <line
                                    x1={x}
                                    y1={riskScenarioMainY}
                                    x2={nextX}
                                    y2={riskScenarioMainY}
                                    stroke="#ef4444"
                                    strokeWidth="4"
                                  />
                                  <text
                                    x={(x + nextX) / 2}
                                    y={riskScenarioMainY - 10}
                                    fill="#fca5a5"
                                    fontSize="11"
                                    textAnchor="middle"
                                  >
                                    {t('branch_failure')}{' '}
                                    {formatProbabilityComparison(
                                      branch.stepFailureProbability || 0,
                                      branch.stepFailureProbabilityBase || 0
                                    )}
                                  </text>
                                </g>
                              );
                            })}
                            {riskLayerCenters.map((x, index) => (
                              <circle key={`risk-split-${index}`} cx={x} cy={riskScenarioMainY} r="6" fill="#f97316" />
                            ))}
                            {riskScenarioOutcomes.map((outcome, index) => {
                              const originX = riskLayerCenters[outcome.anchorIndex] ?? 0;
                              const y = riskScenarioTop + riskScenarioOutcomeStep * index;
                              const textX = riskResultCenterX + 12;
                              const textY = y - 6;
                              const isSuccess = outcome.type === 'success';
                              const strokeColor = isSuccess ? '#22c55e' : '#ef4444';
                              const nameText = outcome.name || '';
                              const nameX = textX;
                              const nameWidth = Math.max(0, riskResultColumnBounds.end - textX - 8);
                              const nameCharsPerLine = Math.max(1, Math.floor(nameWidth / 6));
                              const nameLineCount = Math.min(2, Math.ceil(nameText.length / nameCharsPerLine));
                              const probabilityY = textY + (nameLineCount >= 2 ? 42 : 28);
                              return (
                                <g key={outcome.key}>
                                  {isSuccess && (
                                    <text
                                      x={originX + 10}
                                      y={(riskScenarioMainY + y) / 2}
                                      fill="#86efac"
                                      fontSize="11"
                                    >
                                      {t('branch_success')}{' '}
                                      {formatProbabilityComparison(
                                        riskScenarioBranches[outcome.anchorIndex]?.stepSuccessProbability || 0,
                                        riskScenarioBranches[outcome.anchorIndex]?.stepSuccessProbabilityBase || 0
                                      )}
                                    </text>
                                  )}
                                  <line
                                    x1={originX}
                                    y1={riskScenarioMainY}
                                    x2={originX}
                                    y2={y}
                                    stroke={strokeColor}
                                    strokeWidth="3"
                                  />
                                  <line
                                    x1={originX}
                                    y1={y}
                                    x2={riskResultCenterX}
                                    y2={y}
                                    stroke={strokeColor}
                                    strokeWidth="3"
                                  />
                                  <text x={textX} y={textY} fill="#e2e8f0" fontSize="12">
                                    {outcome.label}
                                  </text>
                                  <foreignObject x={nameX} y={textY + 4} width={nameWidth} height="26">
                                    <div
                                      xmlns="http://www.w3.org/1999/xhtml"
                                      style={{
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        wordBreak: 'break-word',
                                        fontSize: '11px',
                                        lineHeight: 1.2,
                                        color: '#94a3b8',
                                      }}
                                    >
                                      {nameText}
                                    </div>
                                  </foreignObject>
                                  <text x={textX} y={probabilityY} fill={strokeColor} fontSize="11">
                                    {formatProbabilityComparison(outcome.probability || 0, outcome.probabilityBase || 0)}
                                  </text>
                                </g>
                              );
                            })}
                            <line
                              x1={riskResultCenterX}
                              y1={riskScenarioTop}
                              x2={riskResultCenterX}
                              y2={riskScenarioBottom}
                              stroke="#94a3b8"
                              strokeWidth="2"
                              opacity="0.7"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {riskResult && !riskResult.error && (
                  <div className="mt-4 space-y-4 text-sm text-slate-700">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      {(() => {
                        const badge = getMaturityBadge(riskResult.maturity_score);
                        return (
                          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                            <div>
                              <div className="text-xs uppercase tracking-widest text-slate-500">
                                {t('risk_maturity')}
                              </div>
                              <div className={`text-3xl font-semibold ${badge.className}`}>
                                {riskResult.maturity_score ?? '-'}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">{badge.label}</div>
                            </div>
                            <div className="text-xs text-slate-500">
                              <div>{t('risk_maturity_hint')}</div>
                              <div className="mt-3 grid max-w-xs grid-cols-2 gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                                  {t('risk_maturity_critical')}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                                  {t('risk_maturity_low')}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                                  {t('risk_maturity_medium')}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                  {t('risk_maturity_high')}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">
                        {t('risk_layers_title')}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_0.7fr_0.9fr_0.9fr_0.9fr] gap-2 text-xs text-slate-500">
                        <div>{t('risk_layer_name')}</div>
                        <div>{t('risk_layer_cyber_prone')}</div>
                        <div>{t('risk_layer_base_pfd')}</div>
                        <div>{t('risk_layer_degradation')}</div>
                        <div>{t('risk_layer_org_multiplier')}</div>
                        <div className="inline-flex items-center gap-2">
                          {t('risk_layer_effective_pfd_y1')}
                          <span className="relative group inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-500">
                            i
                            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-72 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                              {t('risk_layer_effective_pfd_hint')}
                            </span>
                          </span>
                        </div>
                        <div className="inline-flex items-center gap-2">
                          {t('risk_layer_effective_pfd_y2')}
                          <span className="relative group inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-500">
                            i
                            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-72 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                              {t('risk_layer_effective_pfd_hint')}
                            </span>
                          </span>
                        </div>
                        <div className="inline-flex items-center gap-2">
                          {t('risk_layer_effective_pfd_y3')}
                          <span className="relative group inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-500">
                            i
                            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-72 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                              {t('risk_layer_effective_pfd_hint')}
                            </span>
                          </span>
                        </div>
                      </div>
                      {(riskResult.layers || []).map((layer, idx) => (
                        <div
                          key={`risk-layer-${idx}`}
                          className="grid grid-cols-1 md:grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_0.7fr_0.9fr_0.9fr_0.9fr] gap-2 text-sm py-1"
                        >
                          <div>{layer.name}</div>
                          <div>{layer.cyber_sensitive ? t('risk_yes') : t('risk_no')}</div>
                          <div>{Number(layer.base_pfd || 0).toFixed(4)}</div>
                          <div>{Number(layer.degradation_factor || 1).toFixed(2)}</div>
                          <div>{Number(layer.org_multiplier || 1).toFixed(2)}</div>
                          <div>{Number(layer.effective_pfd || 0).toFixed(4)}</div>
                          <div>{Number(layer.effective_pfd_year2 || layer.effective_pfd || 0).toFixed(4)}</div>
                          <div>{Number(layer.effective_pfd_year3 || layer.effective_pfd || 0).toFixed(4)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">
                        {t('risk_losses_title')}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.9fr_0.9fr_0.9fr] gap-2 text-xs text-slate-500">
                        <div>{t('risk_event')}</div>
                        <div>{t('risk_probability_year1')}</div>
                        <div>{t('risk_probability_year2')}</div>
                        <div>{t('risk_probability_year3')}</div>
                        <div>{t('risk_sle')}</div>
                        <div>{t('risk_loss_year1')}</div>
                        <div>{t('risk_loss_year2')}</div>
                        <div>{t('risk_loss_year3')}</div>
                      </div>
                      {(riskResult.event_losses || []).map((item, idx) => (
                        <div
                          key={`risk-loss-${idx}`}
                          className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.9fr_0.9fr_0.9fr] gap-2 text-sm py-1"
                        >
                          <div>{item.name}</div>
                          <div>{formatProbabilityPercent(item.probability_year1 || 0)}</div>
                          <div>{formatProbabilityPercent(item.probability_year2 || 0)}</div>
                          <div>{formatProbabilityPercent(item.probability_year3 || 0)}</div>
                          <div>{formatMoney(item.sle, item.currency)}</div>
                          <div style={getLossStyle(item.loss_year1)}>{formatMoney(item.loss_year1, item.currency)}</div>
                          <div style={getLossStyle(item.loss_year2)}>{formatMoney(item.loss_year2, item.currency)}</div>
                          <div style={getLossStyle(item.loss_year3)}>{formatMoney(item.loss_year3, item.currency)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeMenu === 'calc' && activeTab === 'reco' && (
            <div className="space-y-6">
              <div className="rounded-lg border border-slate-200 p-4 bg-white">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('recommendations_title')}</h3>
                <label className="block text-xs text-slate-500 mb-2">{t('recommendations_prompt_label')}</label>
                <textarea
                  value={recommendationsPrompt}
                  onChange={(e) => setRecommendationsPrompt(e.target.value)}
                  className="w-full min-h-[120px] bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm"
                />
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleRecommendations}
                    className="bg-slate-900 hover:bg-slate-800 px-5 py-2.5 text-white rounded-lg text-sm"
                  >
                    {recommendationsLoading ? t('recommendations_loading') : t('recommendations_run')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveReport}
                    disabled={!recommendations || reportLoading || recommendationsLoading}
                    className="bg-slate-700 hover:bg-slate-800 px-5 py-2.5 text-white rounded-lg text-sm disabled:opacity-50"
                  >
                    {reportLoading ? t('report_loading') : t('report_save')}
                  </button>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <label className="text-xs text-slate-500">{t('report_format_label')}</label>
                    <select
                      value={reportFormat}
                      onChange={(e) => setReportFormat(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm"
                    >
                      <option value="pdf">{t('report_format_pdf')}</option>
                      <option value="docx">{t('report_format_docx')}</option>
                    </select>
                  </div>
                  {recommendationsError && <div className="text-rose-600 text-sm">{recommendationsError}</div>}
                  {reportError && <div className="text-rose-600 text-sm">{reportError}</div>}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">
                  {t('recommendations_output_label')}
                </div>
                <div>{renderRecommendations(recommendations)}</div>
              </div>
            </div>
          )}

          {(activeMenu !== 'calc' || (activeTab !== 'input' && activeTab !== 'diagram' && activeTab !== 'risk' && activeTab !== 'reco')) && (
            <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-500 text-sm">
              {t('section_placeholder')}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
