'use strict';

/* ============================================================
   partials.js — injects the shared chrome (header, footer,
   floating CTA, registration modal, credit bar) into every
   page so they stay identical. Runs synchronously BEFORE
   main.js, so main.js finds all the elements it wires up.
   ============================================================ */

(function () {
  const NAV = [
    { href: '/#about', label: 'About' },
    { href: '/#programme', label: 'Programme' },
    { href: '/#tariff', label: 'Tariff' },
    { href: '/sponsorship', label: 'Sponsorship', path: '/sponsorship' },
    { href: '/people', label: 'Council', path: '/people' },
    { href: '/#contact', label: 'Contact' },
  ];
  const here = location.pathname.replace(/\.html$/, '') || '/';
  const navLinks = NAV.map((n) =>
    `<a href="${n.href}"${n.path && n.path === here ? ' class="is-active"' : ''}><span>${n.label}</span></a>`
  ).join('');

  const HEADER = `
  <div class="scroll-progress" id="scrollProgress" aria-hidden="true"></div>
  <header class="site-header" id="siteHeader">
    <div class="container">
      <a class="brand" href="/" aria-label="Sampark 2026 — National Edible Oil Conclave — home">
        <img class="brand__logo" src="/img/nepa-mark.png" alt="NEPA" width="108" height="108" />
        <span class="brand__text">
          <span class="brand__name">Sampark <span class="brand__yr">2026</span></span>
          <span class="brand__sub">Edible Oil Conclave</span>
        </span>
      </a>
      <nav class="nav" id="primaryNav">
        ${navLinks}
        <button class="btn btn-primary nav__cta" data-open-register>Register<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </nav>
      <button class="nav-toggle" id="navToggle" aria-label="Toggle menu" aria-expanded="false" aria-controls="primaryNav">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>`;

  const FOOTER = `
  <footer class="site-footer">
    <div class="container">
      <p class="footer-motto">One Industry · One Purpose · One Collective Voice</p>
      <p class="footer-submotto">National Edible Oil Conclave 2026 · संपर्क Sampark</p>
      <div class="footer-grid">
        <div>
          <h4>National Edible Oil Conclave 2026</h4>
          <p>Hosted by the National Edible Oil Promotion Association (NEPA), Guwahati — organised by the Mustard Oil Promotion Council under COOIT, New Delhi, and supported by MOPA.</p>
          <div class="footer-logos">
            <img class="footer-logo" src="/img/nepa-logo.png" alt="NEPA" width="96" height="96" />
            <div class="logo-chip">COOIT</div>
            <div class="logo-chip">MOPA</div>
          </div>
        </div>
        <div>
          <h4>Explore</h4>
          <ul>
            <li><a href="/#why">Why Attend</a></li>
            <li><a href="/#programme">Programme</a></li>
            <li><a href="/#tariff">Delegate Tariff</a></li>
            <li><a href="/sponsorship">Sponsorship</a></li>
            <li><a href="/people">Council &amp; Committee</a></li>
            <li><a href="/#contact">Contact Us</a></li>
          </ul>
        </div>
        <div>
          <h4>Secretariat</h4>
          <ul>
            <li>NEPA, Ajit Singh Bothra &amp; Sons</li>
            <li>Lakhi Gali, Guwahati – 781001</li>
            <li><a href="tel:+919091655502">+91 90916 55502</a> · Abhishek Mour (The Midas Touch)</li>
            <li><a href="mailto:nepaconnect2026@gmail.com">nepaconnect2026@gmail.com</a></li>
          </ul>
        </div>
      </div>
      <p class="footer-bottom">© 2026 National Edible Oil Promotion Association (NEPA), Guwahati. All rights reserved.</p>
    </div>
  </footer>`;

  const FLOATING = `
  <button class="floating-register" data-open-register aria-label="Register Now">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke-linecap="round" /></svg>
    <span>Register Now</span>
  </button>`;

  const MODAL = `
  <div class="modal" id="registerModal" aria-hidden="true">
    <div class="modal__overlay" data-close-register></div>
    <div class="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <button class="modal__close" id="modalClose" aria-label="Close registration" data-close-register>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" /></svg>
      </button>
      <div class="modal__head">
        <span class="eyebrow">Delegate Registration</span>
        <h2 id="modalTitle">Reserve Your Seat</h2>
      </div>
      <ol class="stepper" id="stepper">
        <li class="step is-active" data-step="1"><span class="step__no">01</span><span class="step__label">Details</span></li>
        <li class="step" data-step="2"><span class="step__no">02</span><span class="step__label">Membership</span></li>
        <li class="step" data-step="3"><span class="step__no">03</span><span class="step__label">Payment</span></li>
      </ol>
      <form id="registerForm" novalidate>
        <div class="form-step is-active" data-step-panel="1">
          <div class="field"><label for="fullName">Full Name</label><input type="text" id="fullName" name="fullName" autocomplete="name" required /><span class="field__error" data-error-for="fullName"></span></div>
          <div class="field"><label for="mobile">Mobile Number</label><input type="tel" id="mobile" name="mobile" inputmode="numeric" maxlength="10" placeholder="10-digit number" autocomplete="tel" required /><span class="field__error" data-error-for="mobile"></span></div>
          <div class="field"><label for="email">Email</label><input type="email" id="email" name="email" autocomplete="email" required /><span class="field__error" data-error-for="email"></span></div>
          <div class="field"><label for="organization">Organization</label><input type="text" id="organization" name="organization" autocomplete="organization" required /><span class="field__error" data-error-for="organization"></span></div>
          <div class="form-nav"><span></span><button type="button" class="btn btn-primary" data-next>Continue</button></div>
        </div>
        <div class="form-step" data-step-panel="2">
          <p class="step-question">Want to become a NEPA member?</p>
          <p class="step-help">NEPA Membership fee: ₹3,100 (one-time).</p>
          <div class="toggle-group" id="memberToggle" role="group" aria-label="NEPA membership">
            <button type="button" class="toggle-btn" data-member="true">Yes, add membership</button>
            <button type="button" class="toggle-btn" data-member="false">No, thank you</button>
          </div>
          <span class="field__error" data-error-for="member"></span>
          <div class="price-summary" id="priceSummary">
            <div class="price-row"><span id="delegateLabel">Delegate Fee</span><span id="delegateAmount">₹8,000</span></div>
            <div class="price-row price-row--member" id="memberRow" hidden><span>NEPA Membership</span><span id="memberAmount">₹3,100</span></div>
            <div class="price-row price-row--total"><span>Total Payable</span><span id="totalAmount">₹8,000</span></div>
          </div>
          <p class="price-gst-note">All delegate fees are exclusive of GST, charged as applicable.</p>
          <div class="form-nav"><button type="button" class="btn btn-ghost" data-prev>Back</button><button type="button" class="btn btn-primary" data-next>Continue</button></div>
        </div>
        <div class="form-step" data-step-panel="3">
          <div class="pay-amount"><span>Amount Payable</span><strong id="payAmount">₹8,000</strong></div>
          <p class="step-question">Choose a payment method</p>
          <div class="method-group" id="methodGroup" role="group" aria-label="Payment method">
            <button type="button" class="method-card" data-method="UPI"><span class="method-card__title">UPI</span><span class="method-card__sub">Scan &amp; pay</span></button>
            <button type="button" class="method-card" data-method="Bank"><span class="method-card__title">Bank Transfer</span><span class="method-card__sub">NEFT / IMPS</span></button>
            <button type="button" class="method-card" data-method="Cash"><span class="method-card__title">Cash / At Venue</span><span class="method-card__sub">Pay at desk</span></button>
          </div>
          <span class="field__error" data-error-for="method"></span>
          <div class="pay-panel" data-pay-panel="UPI" hidden>
            <div class="upi-box">
              <div class="qr-placeholder">QR Code<br />Placeholder</div>
              <div class="upi-meta"><span class="pay-label">UPI ID</span><span class="pay-value" id="upiId">nepa-conclave@upi (placeholder)</span><p class="pay-hint">Scan the QR or pay to the UPI ID above, then upload your payment screenshot.</p></div>
            </div>
            <div class="field"><label for="upiScreenshot">Payment Screenshot <span class="req">required</span></label><input type="file" id="upiScreenshot" accept="image/*" data-upload="UPI" /><span class="field__error" data-error-for="upiScreenshot"></span></div>
          </div>
          <div class="pay-panel" data-pay-panel="Bank" hidden>
            <div class="bank-box">
              <div class="bank-row"><span>Bank</span><strong>Bandhan Bank</strong></div>
              <div class="bank-row"><span>Account Name</span><strong>National Edible Oil Promotion Association</strong></div>
              <div class="bank-row"><span>Account No.</span><strong>20100082897192</strong></div>
              <div class="bank-row"><span>IFSC</span><strong>BDBL0002488</strong></div>
              <div class="bank-row"><span>Branch</span><strong>Fancy Bazar, Guwahati</strong></div>
            </div>
            <div class="field"><label for="bankRef">Reference / UTR No. <span class="opt">optional</span></label><input type="text" id="bankRef" name="referenceNo" /></div>
            <div class="field"><label for="bankScreenshot">Payment Screenshot <span class="req">required</span></label><input type="file" id="bankScreenshot" accept="image/*" data-upload="Bank" /><span class="field__error" data-error-for="bankScreenshot"></span></div>
          </div>
          <div class="pay-panel" data-pay-panel="Cash" hidden>
            <div class="cash-note">Pay at the registration desk; your seat is provisionally reserved.</div>
            <div class="field"><label for="cashNote">Note <span class="opt">optional</span></label><textarea id="cashNote" name="note" rows="3" placeholder="Anything we should know?"></textarea></div>
          </div>
          <span class="field__error field__error--submit" data-error-for="submit"></span>
          <div class="form-nav"><button type="button" class="btn btn-ghost" data-prev>Back</button><button type="submit" class="btn btn-primary" id="submitBtn">Complete Registration</button></div>
        </div>
      </form>
      <div class="confirmation" id="confirmation" hidden>
        <div class="confirmation__seal" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h2>Registration Received</h2>
        <p class="confirmation__name" id="confName"></p>
        <div class="confirmation__meta">
          <div><span>Registration ID</span><strong id="confRegId"></strong></div>
          <div><span>Fee Type</span><strong id="confFeeType"></strong></div>
          <div><span>Amount</span><strong id="confAmount"></strong></div>
        </div>
        <p class="confirmation__note">We'll confirm your payment shortly. A member of the Secretariat may reach out if anything is needed.</p>
        <button type="button" class="btn btn-primary" data-close-register>Done</button>
      </div>
    </div>
  </div>`;

  const CREDIT = `
  <div class="credit-bar">
    <span class="credit-bar__text">Developed by</span>
    <a class="credit-bar__link" href="https://www.vibrnd.in" target="_blank" rel="noopener noreferrer" aria-label="vibrnd — www.vibrnd.in">
      <img class="credit-bar__logo" src="/img/vibrnd-logo.png" alt="vibrnd" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';" />
      <span class="credit-bar__word" style="display:none">vibrnd</span>
    </a>
  </div>`;

  // Inject. Header at the very top; the rest after the page content.
  document.body.insertAdjacentHTML('afterbegin', HEADER);
  document.body.insertAdjacentHTML('beforeend', FOOTER + FLOATING + MODAL + CREDIT);
})();
