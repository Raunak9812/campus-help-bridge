/* Campus Help Bridge — feature extensions for external resources, reviews and call requests. */
function chbCleanHttpUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch (_) { return null; }
}

(function () {
  const originalOpenSellModal = openSellModal;
  const originalOpenListing = openListing;
  const originalRenderDashboard = renderDashboard;

  function addExternalLinkField(editId) {
    const form = document.getElementById('listing-form');
    if (!form || form.querySelector('[name="external_url"]')) return;
    const field = document.createElement('div');
    field.className = 'form-field full chb-external-field';
    field.innerHTML = '<label for="chb-external-url">External resource link (optional)</label><input id="chb-external-url" name="external_url" type="url" maxlength="1000" placeholder="https://example.com/resource"><span class="form-help">Add a public resource, publisher page or permitted external file link. Use only links you are allowed to share.</span>';
    const description = form.querySelector('[name="description"]')?.closest('.form-field');
    if (description) description.insertAdjacentElement('beforebegin', field);
    else form.querySelector('.form-grid')?.appendChild(field);
    const old = editId ? listings.find(x => x.id === editId) : null;
    field.querySelector('input').value = old?.externalUrl || '';
  }

  openSellModal = function (editId = null) {
    originalOpenSellModal(editId);
    addExternalLinkField(editId);
  };

  // A listing detail now loads community reviews before rendering the modal.
  openListing = async function (id) {
    const item = listings.find(x => x.id === id);
    if (!item) return;
    let reviewError = '';
    if (liveMode) {
      try {
        if (!item.commentsLoaded) {
          const comments = await CHB.loadComments(id);
          item.comments = comments;
          item.commentsLoaded = true;
          comments.forEach(x => { if (x.profile) liveProfiles[x.userId] = x.profile; });
        }
      } catch (error) {
        item.comments = [];
        item.commentsLoaded = true;
        reviewError = error.message || 'Questions could not be loaded.';
      }
      try {
        item.reviews = await CHB.loadReviews(id);
        item.reviewsLoaded = true;
        item.reviews.forEach(x => { if (x.profile) liveProfiles[x.userId] = x.profile; });
      } catch (error) {
        item.reviews = [];
        item.reviewsLoaded = false;
        reviewError = reviewError || 'Run the feature-upgrade SQL to enable ratings and reviews.';
      }
    }
    originalOpenListing(id);
    addListingExtras(item, reviewError);
  };

  function addListingExtras(item, reviewError) {
    const body = document.querySelector('#modal-root .modal-body');
    if (!body) return;
    const actions = body.querySelector('.detail-actions');
    if (actions && item.externalUrl) {
      const url = chbCleanHttpUrl(item.externalUrl);
      if (url && !actions.querySelector('[data-chb-external-link]')) {
        const link = document.createElement('a');
        link.className = 'button button-outline button-small';
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.dataset.chbExternalLink = 'true';
        link.textContent = 'Open external resource ↗';
        actions.prepend(link);
      }
    }
    if (actions && liveMode && currentAuthUser && item.sellerId !== currentUser.id && !actions.querySelector('[data-chb-call-request]')) {
      const button = document.createElement('button');
      button.className = 'button button-outline button-small';
      button.type = 'button';
      button.dataset.chbCallRequest = item.id;
      button.textContent = 'Request a quick video call';
      actions.appendChild(button);
    }
    if (body.querySelector('#chb-review-section')) return;
    const reviews = Array.isArray(item.reviews) ? item.reviews : [];
    const avg = reviews.length ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length : 0;
    const mine = currentAuthUser && reviews.some(review => review.userId === currentUser.id);
    const reviewCards = reviews.map(review => {
      const profile = review.profile || userById(review.userId);
      return `<article class="chb-review-card"><div class="chb-review-top"><strong>${esc(profile.name || 'Student')}</strong><span class="chb-stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span></div><small>${new Date(review.createdAt).toLocaleDateString()}</small><p>${esc(review.body)}</p></article>`;
    }).join('');
    const section = document.createElement('section');
    section.id = 'chb-review-section';
    section.className = 'chb-review-section';
    section.innerHTML = `
      <div class="chb-review-heading"><div><h3>Ratings & reviews</h3><small>Community feedback · not purchase-verified</small></div>
      <div class="chb-rating-summary"><strong>${reviews.length ? avg.toFixed(1) : '—'}</strong><span class="chb-stars">${reviews.length ? '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg)) : '☆☆☆☆☆'}</span><small>${reviews.length} review${reviews.length === 1 ? '' : 's'}</small></div></div>
      ${reviewError ? `<p class="chb-feature-note">${esc(reviewError)}</p>` : ''}
      <div class="chb-review-list">${reviewCards || '<p class="chb-feature-note">No reviews yet. Share honest feedback after using this resource.</p>'}</div>
      ${liveMode && currentAuthUser && item.sellerId !== currentUser.id && !mine ? `
        <form id="chb-review-form" class="chb-review-form" data-listing-id="${esc(item.id)}">
          <label>Leave a rating</label><select name="rating" required><option value="">Choose stars</option><option value="5">★★★★★ — Excellent</option><option value="4">★★★★☆ — Good</option><option value="3">★★★☆☆ — Average</option><option value="2">★★☆☆☆ — Below average</option><option value="1">★☆☆☆☆ — Poor</option></select>
          <textarea name="review_body" maxlength="1000" minlength="3" required placeholder="What was useful? What could be better? (3–1,000 characters)"></textarea>
          <button class="button button-primary button-small" type="submit">Post review</button><small>Please review only resources you have actually used.</small>
        </form>` : (mine ? '<p class="chb-feature-note">You have already reviewed this resource.</p>' : (liveMode ? '<p class="chb-feature-note">Sign in to leave a review after using this resource.</p>' : '<p class="chb-feature-note">Reviews are available in the live community.</p>'))}
    `;
    body.appendChild(section);
  }

  function localDateTimeInput(date) {
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function openCallRequestModal(listingId) {
    const listing = listings.find(x => x.id === listingId);
    if (!listing) return;
    if (!liveMode || !currentAuthUser) { openLoginModal(); return; }
    const earliest = new Date(Date.now() + 60 * 60 * 1000);
    const minimum = localDateTimeInput(new Date(Date.now() + 10 * 60 * 1000));
    showModal(`<div class="modal-header"><div><div class="section-kicker">CONNECT WITH THE SELLER</div><h2>Request a quick video call</h2><p>${esc(listing.title)}</p></div><button class="modal-close" data-action="close-modal">×</button></div>
      <div class="modal-body"><form id="chb-consultation-form" data-listing-id="${esc(listingId)}">
        <div class="form-field"><label for="chb-call-time">Preferred date and time *</label><input id="chb-call-time" name="scheduled_for" type="datetime-local" min="${minimum}" value="${localDateTimeInput(earliest)}" required></div>
        <div class="form-field"><label for="chb-call-message">What would you like to discuss? (optional)</label><textarea id="chb-call-message" name="message" maxlength="1000" placeholder="A quick question about the resource, topics or availability..."></textarea></div>
        <p class="chb-feature-note">The seller must accept before a meeting link is created. Your phone number is not shared. Do not forward the meeting link.</p>
        <div class="form-actions"><button type="button" class="button button-muted" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">Send call request ↗</button></div>
      </form></div>`);
  }

  async function renderConsultationsPanel() {
    const main = document.querySelector('#other-page .dashboard-main');
    if (!main || !liveMode || !currentAuthUser) return;
    let panel = document.getElementById('chb-consultations-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'chb-consultations-panel';
      panel.className = 'panel chb-consultations-panel';
      main.appendChild(panel);
    }
    panel.innerHTML = '<div class="panel-heading"><h3>Call requests</h3><span class="section-kicker">PRIVATE CONSULTATIONS</span></div><p class="chb-feature-note">Loading your call requests…</p>';
    try {
      const rows = await CHB.loadConsultations(currentUser.id);
      const html = rows.map(row => {
        const incoming = row.sellerId === currentUser.id;
        const listing = listings.find(x => x.id === row.listingId);
        const title = listing?.title || 'Campus resource';
        const when = new Date(row.scheduledFor).toLocaleString();
        const statusClass = row.status.toLowerCase();
        return `<article class="chb-call-card"><div class="chb-call-top"><strong>${incoming ? 'Incoming request' : 'Your request'} · ${esc(title)}</strong><span class="chb-call-status ${statusClass}">${esc(row.status)}</span></div>
          <p><b>${incoming ? 'Student' : 'Seller'}:</b> ${esc(userById(incoming ? row.requesterId : row.sellerId).name || 'Campus student')}</p>
          <p><b>Preferred time:</b> ${esc(when)}</p>${row.message ? `<p>${esc(row.message)}</p>` : ''}
          ${incoming && row.status === 'Pending' ? `<div class="chb-call-actions"><button class="button button-primary button-small" data-chb-call-action="accept" data-call-id="${esc(row.id)}">Accept & create link</button><button class="button button-outline button-small" data-chb-call-action="decline" data-call-id="${esc(row.id)}">Decline</button></div>` : ''}
          ${row.status === 'Accepted' && row.meetingUrl ? `<a class="button button-primary button-small" href="${esc(row.meetingUrl)}" target="_blank" rel="noopener noreferrer">Join video call ↗</a>` : ''}
        </article>`;
      }).join('');
      panel.innerHTML = `<div class="panel-heading"><h3>Call requests</h3><span class="section-kicker">PRIVATE CONSULTATIONS</span></div>${html || '<p class="chb-feature-note">No call requests yet. Open a resource and choose “Request a quick video call” to connect with its seller.</p>'}`;
    } catch (error) {
      panel.innerHTML = `<div class="panel-heading"><h3>Call requests</h3></div><p class="chb-feature-note">Call requests are not ready yet. Run the supplied Supabase feature-upgrade SQL first. (${esc(error.message || 'Database error')})</p>`;
    }
  }

  function addPhoneOtpControls() {
    const form = document.getElementById('phone-contact-form');
    if (!form || form.dataset.otpReady === 'true') return;
    form.dataset.otpReady = 'true';
    const saveButton = form.querySelector('button[type="submit"]');
    const phoneInput = form.querySelector('[name="phone_number"]');
    if (phoneInput) { phoneInput.required = false; phoneInput.removeAttribute('pattern'); }
    if (saveButton) {
      saveButton.type = 'button';
      saveButton.dataset.chbPhoneSend = 'true';
      saveButton.textContent = 'Send OTP';
    }
    const note = form.querySelector('.phone-private-note');
    if (note) note.textContent = 'Optional. Skip for now, or verify a 10-digit number by SMS OTP. Your number stays private and is never shown publicly.';
    const skipButton = document.createElement('button');
    skipButton.type = 'button';
    skipButton.className = 'button button-muted button-small';
    skipButton.dataset.chbPhoneSkip = 'true';
    skipButton.textContent = 'Skip for now';
    form.querySelector('.form-actions')?.appendChild(skipButton);
    const otp = document.createElement('div');
    otp.className = 'chb-phone-otp hidden';
    otp.id = 'chb-phone-otp';
    otp.innerHTML = '<label for="chb-phone-otp-code">6-digit OTP</label><input id="chb-phone-otp-code" name="phone_otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="Enter SMS code"><button class="button button-primary button-small" type="button" data-chb-phone-verify="true">Verify & save number</button>';
    form.appendChild(otp);
    form.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); });
  }

  renderDashboard = function () {
    originalRenderDashboard();
    addPhoneOtpControls();
    renderConsultationsPanel();
  };

  document.addEventListener('click', async event => {
    const skipPhone = event.target.closest('[data-chb-phone-skip]');
    if (skipPhone) {
      event.preventDefault();
      const form = skipPhone.closest('#phone-contact-form');
      const field = form?.querySelector('.form-field');
      const send = form?.querySelector('[data-chb-phone-send]');
      const otp = form?.querySelector('#chb-phone-otp');
      const isSkipped = skipPhone.dataset.skipped === 'true';
      if (field) field.classList.toggle('hidden', !isSkipped);
      if (send) send.classList.toggle('hidden', !isSkipped);
      if (otp) otp.classList.add('hidden');
      skipPhone.dataset.skipped = isSkipped ? 'false' : 'true';
      skipPhone.textContent = isSkipped ? 'Skip for now' : 'Add number';
      toast(isSkipped ? 'Phone number can be added later.' : 'Phone number field is ready.');
      return;
    }

    const sendPhone = event.target.closest('[data-chb-phone-send]');
    if (sendPhone) {
      event.preventDefault();
      const form = sendPhone.closest('#phone-contact-form');
      const input = form?.querySelector('[name="phone_number"]');
      const digits = String(input?.value || '').replace(/\D/g, '');
      const phoneDigits = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
      if (!/^[6-9]\d{9}$/.test(phoneDigits)) { toast('Enter a valid 10-digit Indian mobile number.'); return; }
      const phone = '+91' + phoneDigits;
      sendPhone.disabled = true;
      try {
        await CHB.startPhoneVerification(currentUser.id, phone);
        const otpBox = document.getElementById('chb-phone-otp');
        if (otpBox) { otpBox.classList.remove('hidden'); otpBox.dataset.phone = phone; }
        toast('OTP sent. Enter the 6-digit code from your SMS.');
      } catch (error) {
        toast(`Could not send OTP: ${error.message}. Check that Phone Auth and an SMS provider are enabled in Supabase.`);
      } finally { sendPhone.disabled = false; }
      return;
    }

    const verifyPhone = event.target.closest('[data-chb-phone-verify]');
    if (verifyPhone) {
      event.preventDefault();
      const otpBox = document.getElementById('chb-phone-otp');
      const code = String(otpBox?.querySelector('[name="phone_otp"]')?.value || '').trim();
      const phone = otpBox?.dataset.phone || '';
      verifyPhone.disabled = true;
      try {
        await CHB.verifyPhoneOtp(currentUser.id, phone, code);
        const input = document.querySelector('#phone-contact-form [name="phone_number"]');
        if (input) input.value = phone.replace(/^\+91/, '');
        if (otpBox) { otpBox.classList.add('hidden'); otpBox.querySelector('[name="phone_otp"]').value = ''; }
        const note = document.querySelector('#phone-contact-form .phone-private-note');
        if (note) note.textContent = '✓ Phone number OTP-verified and saved privately.';
        toast('Phone number OTP-verified and saved privately.');
      } catch (error) {
        toast(`Phone verification failed: ${error.message}`);
      } finally { verifyPhone.disabled = false; }
      return;
    }

    const callButton = event.target.closest('[data-chb-call-request]');
    if (callButton) { event.preventDefault(); openCallRequestModal(callButton.dataset.chbCallRequest); return; }

    const callAction = event.target.closest('[data-chb-call-action]');
    if (callAction) {
      event.preventDefault();
      const id = callAction.dataset.callId;
      callAction.disabled = true;
      try {
        if (callAction.dataset.chbCallAction === 'accept') {
          const room = `https://meet.jit.si/CHB-${crypto.randomUUID().replace(/-/g, '')}`;
          await CHB.updateConsultation(id, 'Accepted', room);
          toast('Call request accepted. A private meeting link is ready.');
        } else {
          await CHB.updateConsultation(id, 'Declined', null);
          toast('Call request declined.');
        }
        await renderConsultationsPanel();
      } catch (error) { toast(`Could not update call request: ${error.message}`); }
      finally { callAction.disabled = false; }
      return;
    }
  });

  document.getElementById('modal-root')?.addEventListener('submit', async event => {
    const reviewForm = event.target.closest('#chb-review-form');
    if (reviewForm) {
      event.preventDefault();
      const data = new FormData(reviewForm);
      const submit = reviewForm.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        await CHB.addReview(reviewForm.dataset.listingId, Number(data.get('rating')), String(data.get('review_body') || ''));
        toast('Your review has been posted.');
        await openListing(reviewForm.dataset.listingId);
      } catch (error) { toast(`Could not post review: ${error.message}`); }
      finally { if (submit) submit.disabled = false; }
      return;
    }
    const callForm = event.target.closest('#chb-consultation-form');
    if (callForm) {
      event.preventDefault();
      const data = new FormData(callForm);
      const submit = callForm.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        await CHB.createConsultation(callForm.dataset.listingId, String(data.get('scheduled_for') || ''), String(data.get('message') || ''));
        closeModal();
        toast('Call request sent to the seller. Check My Dashboard for the response.');
        if (activeView === 'dashboard') renderDashboard();
      } catch (error) { toast(`Could not send call request: ${error.message}`); }
      finally { if (submit) submit.disabled = false; }
    }
  });
})();
