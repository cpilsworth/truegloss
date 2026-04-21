// ESM loader that stubs the `cloudflare:email` specifier for tests.
const STUB = `
export class EmailMessage {
  constructor(from, to, raw) { this.from = from; this.to = to; this.raw = raw; }
}
`;

export function resolve(specifier, context, next) {
  if (specifier === 'cloudflare:email') {
    return { url: 'cloudflare-email-stub:', shortCircuit: true, format: 'module' };
  }
  if (specifier === 'mimetext/browser') {
    return next('mimetext', context);
  }
  return next(specifier, context);
}

export function load(url, context, next) {
  if (url === 'cloudflare-email-stub:') {
    return { format: 'module', shortCircuit: true, source: STUB };
  }
  return next(url, context);
}
