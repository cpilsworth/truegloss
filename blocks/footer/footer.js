import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

const ICONS = {
  phone: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
  mail: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"></path><rect x="2" y="4" width="20" height="16" rx="2"></rect></svg>',
  mapPin: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"></path><circle cx="12" cy="10" r="3"></circle></svg>',
  instagram: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"></line></svg>',
};

/**
 * Style the brand heading — wrap "Autos" in an accent span.
 * @param {Element} footer
 */
function decorateBrand(footer) {
  footer.querySelectorAll('h2').forEach((h2) => {
    if (h2.textContent.trim() === 'TrueGloss Autos') {
      h2.innerHTML = 'TrueGloss <span class="footer-brand-accent">Autos</span>';
    }
  });
}

/**
 * Strip .button styling from links inside .button-container paragraphs.
 * Keeps the <p> wrapper intact but removes button classes and container class.
 * @param {Element} footer
 */
function stripButtonStyles(footer) {
  footer.querySelectorAll('.button-container').forEach((container) => {
    container.classList.remove('button-container');
  });
  footer.querySelectorAll('a.button').forEach((a) => {
    a.classList.remove('button', 'primary', 'secondary');
  });
}

/**
 * Add inline SVG icons to contact items and wrap each in a flex row.
 * Finds the contact column via the "Contact" heading.
 * @param {Element} footer
 */
function decorateContactItems(footer) {
  const contactHeading = [...footer.querySelectorAll('h2')]
    .find((h2) => h2.textContent.trim() === 'Contact');
  if (!contactHeading) return;

  const contactCol = contactHeading.closest('div');
  if (!contactCol) return;

  contactCol.querySelectorAll('p').forEach((p) => {
    const text = p.textContent.trim();
    let icon = '';

    if (p.querySelector('a[href^="tel:"]')) {
      icon = ICONS.phone;
    } else if (p.querySelector('a[href^="mailto:"]')) {
      icon = ICONS.mail;
    } else if (text.toLowerCase().includes('buckingham')) {
      icon = ICONS.mapPin;
    }

    if (icon) {
      const wrapper = document.createElement('div');
      wrapper.className = 'footer-contact-item';
      wrapper.innerHTML = icon;
      p.parentNode.insertBefore(wrapper, p);
      wrapper.append(p);
    }
  });
}

/**
 * Add Instagram social link after the brand description.
 * Finds the brand column via the "TrueGloss" heading.
 * @param {Element} footer
 */
function addSocialLinks(footer) {
  const brandHeading = [...footer.querySelectorAll('h2')]
    .find((h2) => h2.textContent.trim().includes('TrueGloss'));
  if (!brandHeading) return;

  const brandCol = brandHeading.closest('div');
  if (!brandCol) return;

  const desc = brandCol.querySelector('p');
  if (!desc) return;

  const social = document.createElement('div');
  social.className = 'footer-social';
  social.innerHTML = `<a href="https://instagram.com/truegloss_autos" target="_blank" rel="noopener noreferrer" aria-label="Instagram" class="footer-social-icon">${ICONS.instagram}</a>`;
  desc.after(social);
}

/**
 * Loads and decorates the footer.
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  // load footer as fragment
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const fragment = await loadFragment(footerPath);

  // decorate footer DOM
  block.textContent = '';
  const footer = document.createElement('div');
  while (fragment.firstElementChild) footer.append(fragment.firstElementChild);

  // Apply design enhancements — order matters:
  // 1. Strip button classes first (keeps <p> wrappers intact)
  stripButtonStyles(footer);
  // 2. Then decorate brand, contact icons, and social links
  decorateBrand(footer);
  decorateContactItems(footer);
  addSocialLinks(footer);

  block.append(footer);
}
