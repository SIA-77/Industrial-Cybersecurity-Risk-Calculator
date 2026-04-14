/* SPDX-FileCopyrightText: Ian Suhih */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { createElement } from 'react';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return createElement(Component, pageProps);
}
