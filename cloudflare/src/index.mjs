/*
 * Copyright 2022 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

'use strict';

import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage, Mailbox } from 'mimetext/browser';

const BOOKING_FIELDS = ['name', 'phone', 'email', 'preferredDate', 'note'];
const BOOKING_RECIPIENT = 'cpilsworth@gmail.com';

const escapeHtml = (s = '') => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

export const handleBooking = async (request, env) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }
  let data;
  try {
    data = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  const missing = ['name', 'phone', 'email', 'preferredDate'].filter((k) => !data || !String(data[k] || '').trim());
  if (missing.length) {
    return jsonResponse({ error: `Missing fields: ${missing.join(', ')}` }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email))) {
    return jsonResponse({ error: 'Invalid email' }, 400);
  }

  const fields = {};
  BOOKING_FIELDS.forEach((k) => { fields[k] = String(data[k] || '').trim(); });

  const textLines = [
    'New booking request from TrueGloss website',
    '',
    `Name:           ${fields.name}`,
    `Phone:          ${fields.phone}`,
    `Email:          ${fields.email}`,
    `Preferred date: ${fields.preferredDate}`,
    '',
    'Note:',
    fields.note || '(none)',
  ];
  const htmlRows = BOOKING_FIELDS
    .map((k) => `<tr><th align="left">${k}</th><td>${escapeHtml(fields[k] || '')}</td></tr>`)
    .join('');

  const msg = createMimeMessage();
  msg.setSender({ name: 'TrueGloss Bookings', addr: `bookings@${env.BOOKING_SENDER_DOMAIN || 'truegloss.uk'}` });
  msg.setRecipient(BOOKING_RECIPIENT);
  msg.setSubject(`New booking request — ${fields.name}`);
  msg.setHeader('Reply-To', new Mailbox({ addr: fields.email, name: fields.name }));
  msg.addMessage({ contentType: 'text/plain', data: textLines.join('\n') });
  msg.addMessage({
    contentType: 'text/html',
    data: `<h2>New booking request</h2><table>${htmlRows}</table>`,
  });

  if (!env.BOOKING_EMAIL || typeof env.BOOKING_EMAIL.send !== 'function') {
    return jsonResponse({ error: 'Email binding unavailable' }, 500);
  }

  try {
    const message = new EmailMessage(
      `bookings@${env.BOOKING_SENDER_DOMAIN || 'truegloss.uk'}`,
      BOOKING_RECIPIENT,
      msg.asRaw(),
    );
    await env.BOOKING_EMAIL.send(message);
  } catch (err) {
    return jsonResponse({ error: `Email send failed: ${err.message}` }, 502);
  }
  return jsonResponse({ ok: true });
};

const getExtension = (path) => {
  const basename = path.split('/').pop();
  const pos = basename.lastIndexOf('.');
  return (basename === '' || pos < 1) ? '' : basename.slice(pos + 1);
};

const isMediaRequest = (url) => /\/media_[0-9a-f]{40,}[/a-zA-Z0-9_-]*\.[0-9a-z]+$/.test(url.pathname);
const isRUMRequest = (url) => /\/\.(rum|optel)\/.*/.test(url.pathname);


const handleRequest = async (request, env, ctx) => {
  const url = new URL(request.url);

  if (url.pathname === '/api/booking') {
    return handleBooking(request, env);
  }

  if (url.port) {
    // Cloudflare opens a couple more ports than 443, so we redirect visitors
    // to the default port to avoid confusion.
    // https://developers.cloudflare.com/fundamentals/reference/network-ports/#network-ports-compatible-with-cloudflares-proxy
    const redirectTo = new URL(request.url);
    redirectTo.port = '';
    return new Response('Moved permanently to ' + redirectTo.href, {
      status: 301,
      headers: {
        location: redirectTo.href
      }
    });
  }

  if (url.pathname.startsWith('/drafts/')) {
    return new Response('Not Found', { status: 404 });
  }

  if(isRUMRequest(url)) {
    // only allow GET, POST, OPTIONS
    if(!['GET', 'POST', 'OPTIONS'].includes(request.method)) {
      return new Response('Method Not Allowed', { status: 405 });
    }
  }

  const extension = getExtension(url.pathname);

  // remember original search params
  const savedSearch = url.search;

  // sanitize search params
  const { searchParams } = url;
  if (isMediaRequest(url)) {
    for (const [key] of searchParams.entries()) {
      if (!['format', 'height', 'optimize', 'width'].includes(key)) {
        searchParams.delete(key);
      }
    }
  } else if (extension === 'json') {
    for (const [key] of searchParams.entries()) {
      if (!['limit', 'offset', 'sheet'].includes(key)) {
        searchParams.delete(key);
      }
    }
  } else {
    // neither media nor json request: strip search params
    url.search = '';
  }
  searchParams.sort();

  url.hostname = env.ORIGIN_HOSTNAME;
  if (!url.origin.match(/^https:\/\/main--.*--.*\.(?:aem|hlx)\.live/)) {
    return new Response('Invalid ORIGIN_HOSTNAME', { status: 500 });
  }
  const req = new Request(url, request);
  req.headers.set('x-forwarded-host', req.headers.get('host'));
  req.headers.set('x-byo-cdn-type', 'cloudflare');
  if (env.PUSH_INVALIDATION !== 'disabled') {
    req.headers.set('x-push-invalidation', 'enabled');
  }
  if (env.ORIGIN_AUTHENTICATION) {
    req.headers.set('authorization', `token ${env.ORIGIN_AUTHENTICATION}`);
  }
  let resp = await fetch(req, {
    method: req.method,
    cf: {
      // cf doesn't cache html by default: need to override the default behavior
      cacheEverything: true,
    },
  });
  resp = new Response(resp.body, resp);
  if (resp.status === 301 && savedSearch) {
    const location = resp.headers.get('location');
    if (location && !location.match(/\?.*$/)) {
      resp.headers.set('location', `${location}${savedSearch}`);
    }
  }
  if (resp.status === 304) {
    // 304 Not Modified - remove CSP header
    resp.headers.delete('Content-Security-Policy');
  }
  resp.headers.delete('age');
  resp.headers.delete('x-robots-tag');
  return resp;
};

export default {
  fetch: handleRequest,
};
