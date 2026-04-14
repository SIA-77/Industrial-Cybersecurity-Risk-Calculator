/* SPDX-FileCopyrightText: Ian Suhih */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import axios from 'axios';

const buildReportFormData = ({
  technicalFile,
  organizationalFile,
  layers,
  attackerType,
  attackerPotential,
  useMonteCarlo,
  sisIsIsolated,
  eventNames,
  eventLosses,
  recommendations,
  reportFormat,
}) => {
  const FormDataCtor = globalThis.FormData;
  const totalEvents = layers.length + 1;
  const derivedEventNames = Array.isArray(eventNames) && eventNames.length
    ? eventNames
    : Array.from({ length: totalEvents }).map((_, idx) => `Event ${idx + 1}`);

  const formData = new FormDataCtor();
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
  formData.append('recommendations', recommendations || '');
  formData.append('report_format', reportFormat || 'pdf');
  return formData;
};

const downloadBlob = (blob, filename) => {
  const url = globalThis.window.URL.createObjectURL(blob);
  const link = globalThis.document.createElement('a');
  link.href = url;
  link.download = filename;
  globalThis.document.body.appendChild(link);
  link.click();
  link.remove();
  globalThis.window.URL.revokeObjectURL(url);
};

export const downloadReport = async ({
  apiBase,
  technicalFile,
  organizationalFile,
  layers,
  attackerType,
  attackerPotential,
  useMonteCarlo,
  sisIsIsolated,
  eventNames,
  eventLosses,
  recommendations,
  reportFormat,
  timeoutMs = 300000,
}) => {
  const formData = buildReportFormData({
    technicalFile,
    organizationalFile,
    layers,
    attackerType,
    attackerPotential,
    useMonteCarlo,
    sisIsIsolated,
    eventNames,
    eventLosses,
    recommendations,
    reportFormat,
  });

  const res = await axios.post(`${apiBase}/api/v1/report`, formData, {
    responseType: 'blob',
    timeout: timeoutMs,
  });

  const suffix = (reportFormat || 'pdf').toLowerCase() === 'docx' ? 'docx' : 'pdf';
  downloadBlob(res.data, `risk_report.${suffix}`);
};
