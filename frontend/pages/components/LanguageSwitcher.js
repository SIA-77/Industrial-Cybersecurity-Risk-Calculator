/* SPDX-FileCopyrightText: Ian Suhih */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="flex gap-2 items-center text-sm">
      <span className="text-gray-400">🌍 {t('language_label')}:</span>
      <button onClick={() => changeLanguage('en')} className="hover:text-white">EN</button>
      <button onClick={() => changeLanguage('ru')} className="hover:text-white">RU</button>
      <button onClick={() => changeLanguage('es')} className="hover:text-white">ES</button>
      <button onClick={() => changeLanguage('zh')} className="hover:text-white">中文</button>
    </div>
  );
}
