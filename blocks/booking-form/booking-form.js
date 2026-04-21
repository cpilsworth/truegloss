import { readBlockConfig } from '../../scripts/aem.js';

const TEMPLATE_HTML = `
  <style>
    :host { display: block; }
    form {
      display: grid;
      gap: 16px;
      max-width: 560px;
      margin: 0 auto;
      font: inherit;
    }
    label {
      display: grid;
      gap: 6px;
      font-weight: 600;
      font-size: 0.95rem;
    }
    input, textarea {
      font: inherit;
      padding: 10px 12px;
      border: 1px solid #ccc;
      border-radius: 6px;
      background: #fff;
    }
    input:focus, textarea:focus {
      outline: 2px solid var(--accent-color, #2b8a3e);
      outline-offset: 1px;
    }
    textarea { min-height: 100px; resize: vertical; }
    button {
      font: inherit;
      font-weight: 700;
      padding: 12px 20px;
      border: 0;
      border-radius: 6px;
      background: var(--accent-color, #2b8a3e);
      color: #fff;
      cursor: pointer;
    }
    button[disabled] { opacity: 0.6; cursor: not-allowed; }
    .status { min-height: 1.5em; font-size: 0.95rem; }
    .status.success { color: #2b8a3e; }
    .status.error { color: #c92a2a; }
    .required::after { content: ' *'; color: #c92a2a; }
  </style>
  <form novalidate>
    <label class="required" for="bf-name">Name
      <input id="bf-name" name="name" type="text" required autocomplete="name" />
    </label>
    <label class="required" for="bf-phone">Phone
      <input id="bf-phone" name="phone" type="tel" required autocomplete="tel" />
    </label>
    <label class="required" for="bf-email">Email
      <input id="bf-email" name="email" type="email" required autocomplete="email" />
    </label>
    <label class="required" for="bf-date">Preferred Date
      <input id="bf-date" name="preferredDate" type="date" required />
    </label>
    <label for="bf-note">Note
      <textarea id="bf-note" name="note" rows="4"></textarea>
    </label>
    <button type="submit">Request Booking</button>
    <div class="status" role="status" aria-live="polite"></div>
  </form>
`;

export class BookingFormElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    if (this.shadowRoot.childNodes.length) return;
    this.shadowRoot.innerHTML = TEMPLATE_HTML;
    this.form = this.shadowRoot.querySelector('form');
    this.status = this.shadowRoot.querySelector('.status');
    this.submitBtn = this.shadowRoot.querySelector('button[type="submit"]');
    this.form.addEventListener('submit', (e) => this.onSubmit(e));
  }

  get endpoint() {
    return this.getAttribute('endpoint') || '/api/booking';
  }

  payload() {
    const data = {};
    this.form.querySelectorAll('input, textarea').forEach((f) => {
      data[f.name] = f.value.trim();
    });
    return data;
  }

  setStatus(message, kind) {
    this.status.textContent = message;
    this.status.classList.remove('success', 'error');
    if (kind) this.status.classList.add(kind);
  }

  async onSubmit(e) {
    e.preventDefault();
    if (!this.form.checkValidity()) {
      this.form.reportValidity();
      return;
    }
    this.submitBtn.disabled = true;
    this.setStatus('Sending your booking request…');
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.payload()),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Request failed (${res.status})`);
      }
      this.setStatus('Thanks! We received your request and will be in touch shortly.', 'success');
      this.form.reset();
      this.dispatchEvent(new CustomEvent('booking-submitted', { bubbles: true, composed: true }));
    } catch (err) {
      this.setStatus(`Sorry, something went wrong. ${err.message}`, 'error');
    } finally {
      this.submitBtn.disabled = false;
    }
  }
}

if (!customElements.get('booking-form')) {
  customElements.define('booking-form', BookingFormElement);
}

export default function decorate(block) {
  const config = readBlockConfig(block);
  const endpoint = config.endpoint || '/api/booking';
  const el = document.createElement('booking-form');
  el.setAttribute('endpoint', endpoint);
  block.replaceChildren(el);
}
