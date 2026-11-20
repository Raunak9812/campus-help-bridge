/* Campus Help Bridge Supabase adapter. Uses the official supabase-js v2 browser CDN. */
(function () {
  const url = (window.CHB_SUPABASE_URL || '').trim();
  const key = (window.CHB_SUPABASE_ANON_KEY || '').trim();
  const configured = Boolean(url && key && window.supabase?.createClient);
  let client = null;
  if (configured) {
    client = window.supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  const fail = (error) => { if (error) throw error; };
  const mapProfile = (p) => p ? ({
    id: p.id, name: p.full_name || 'Campus Student', initials: (p.full_name || 'CS').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase(),
    college: p.college || 'College not added', course: p.course || '', branch: p.branch || 'General',
    year: Number(p.academic_year || 1), semester: Number(p.semester || 1), email: p.email || '',
    emailVerified: Boolean(p.email_verified), phoneVerified: false, collegeVerified: Boolean(p.college_verified),
    showContact: false, contact: '', bio: p.bio || '', color: 'blue', isReal: true
  }) : null;
  const mapListing = (r) => ({
    id: r.id, title: r.title, author: r.author || 'Student-shared resource', type: r.material_type,
    category: r.category, college: r.college, branch: r.branch, year: Number(r.academic_year || 1),
    semester: Number(r.semester || 1), price: Number(r.price || 0), free: Number(r.price || 0) === 0,
    sellerId: r.seller_id, negotiation: Boolean(r.negotiation_allowed), showContact: false,
    condition: r.condition || 'Digital', subject: r.subject || '', description: r.description || '',
    availability: ({ available: 'Available', sold: 'Sold', removed: 'Removed' })[r.status] || 'Available',
    createdAt: new Date(r.created_at).getTime(), theme: null, comments: [], offers: [], demo: false,
    filePath: r.file_path || null, coverPath: r.cover_path || null, externalUrl: r.external_url || null
  });
  async function requireClient() { if (!client) throw new Error('Supabase is not configured. Add your Project URL and publishable key in supabase-config.js.'); return client; }
  async function getProfile(id) {
    const c = await requireClient();
    const { data, error } = await c.from('profiles').select('*').eq('id', id).maybeSingle();
    fail(error); return mapProfile(data);
  }
  async function saveProfile(user, details) {
    const c = await requireClient();
    const row = {
      full_name: details.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Campus Student',
      college: details.college || '', course: details.course || 'B.Tech', branch: details.branch || '',
      academic_year: Number(details.academic_year || 1), semester: Number(details.semester || 1), bio: details.bio || ''
    };
    const { error } = await c.from('profiles').update(row).eq('id', user.id); fail(error);
    return getProfile(user.id);
  }
  async function getMyPhone(userId) {
    const c = await requireClient();
    const { data: { user }, error: authError } = await c.auth.getUser(); fail(authError);
    if (!user || user.id !== userId) throw new Error('You can only view your own saved phone number.');
    const { data, error } = await c.from('private_contacts').select('phone_number, verified_at').eq('user_id', user.id).maybeSingle();
    fail(error); return data?.verified_at ? (data.phone_number || '') : '';
  }
  async function deleteMyPhone(userId) {
    const c = await requireClient();
    const { data: { user }, error: authError } = await c.auth.getUser(); fail(authError);
    if (!user || user.id !== userId) throw new Error('You can only remove your own saved phone number.');
    const { error } = await c.from('private_contacts').delete().eq('user_id', user.id); fail(error);
  }
  async function loadListings(userId) {
    const c = await requireClient();
    const { data, error } = await c.from('listings').select('*').order('created_at', { ascending: false }).limit(300);
    fail(error);
    const rows = data || [];
    const ids = [...new Set(rows.map(x => x.seller_id).concat(userId || []).filter(Boolean))];
    let profiles = [];
    if (ids.length) { const p = await c.from('profiles').select('*').in('id', ids); fail(p.error); profiles = p.data || []; }
    const profileMap = Object.fromEntries(profiles.map(p => [p.id, mapProfile(p)]));
    return { listings: rows.map(mapListing), profiles: profileMap };
  }
  async function createListing(userId, payload, file, editingId) {
    const c = await requireClient();
    let filePath = payload.filePath || null;
    if (file) {
      const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(file.type)) throw new Error('Upload a PDF, JPG, PNG or WEBP file.');
      if (file.size > 10 * 1024 * 1024) throw new Error('File size must be 10 MB or less.');
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-90);
      const path = `${userId}/${crypto.randomUUID()}-${safeName}`;
      const up = await c.storage.from('chb-materials').upload(path, file, { upsert: false, contentType: file.type }); fail(up.error);
      filePath = up.data.path;
    }
    const row = {
      title: payload.title, author: payload.author, subject: payload.subject, college: payload.college,
      branch: payload.branch, academic_year: Number(payload.year || 1), semester: Number(payload.semester || 1),
      category: payload.category, material_type: payload.type, price: Number(payload.price || 0),
      condition: payload.condition, description: payload.description, negotiation_allowed: Boolean(payload.negotiation),
      status: 'available', seller_id: userId, file_path: filePath, contact_visibility: false, external_url: payload.externalUrl || null
    };
    let result;
    if (editingId) result = await c.from('listings').update(row).eq('id', editingId).select().single();
    else result = await c.from('listings').insert(row).select().single();
    fail(result.error); return mapListing(result.data);
  }
  async function setListingStatus(id, status) {
    const c = await requireClient();
    const value = status === 'Sold' ? 'sold' : status === 'Removed' ? 'removed' : 'available';
    const { error } = await c.from('listings').update({ status: value }).eq('id', id); fail(error);
  }
  async function loadComments(listingId) {
    const c = await requireClient();
    const { data, error } = await c.from('comments').select('*').eq('listing_id', listingId).order('created_at', { ascending: true }); fail(error);
    const rows = data || [], ids = [...new Set(rows.map(x => x.user_id))];
    let prof = [];
    if (ids.length) { const p = await c.from('profiles').select('*').in('id', ids); fail(p.error); prof = p.data || []; }
    const cache = Object.fromEntries(prof.map(p => [p.id, mapProfile(p)]));
    return rows.map(x => ({ id: x.id, userId: x.user_id, text: x.body, createdAt: new Date(x.created_at).getTime(), profile: cache[x.user_id] }));
  }
  async function addComment(listingId, text) {
    const c = await requireClient(); const { data: { user } } = await c.auth.getUser();
    if (!user) throw new Error('Please log in to ask a question.');
    const { error } = await c.from('comments').insert({ listing_id: listingId, user_id: user.id, body: text }); fail(error);
  }
  async function loadWishlist(userId) {
    const c = await requireClient(); const { data, error } = await c.from('wishlists').select('listing_id').eq('user_id', userId); fail(error);
    return (data || []).map(x => x.listing_id);
  }
  async function toggleWishlist(userId, listingId, shouldSave) {
    const c = await requireClient();
    if (shouldSave) { const { error } = await c.from('wishlists').upsert({ user_id: userId, listing_id: listingId }, { onConflict: 'user_id,listing_id' }); fail(error); }
    else { const { error } = await c.from('wishlists').delete().eq('user_id', userId).eq('listing_id', listingId); fail(error); }
  }
  async function createRequest(userId, x) {
    const c = await requireClient(); const { error } = await c.from('material_requests').insert({ user_id: userId, title: x.title, subject: x.subject, college: x.college, branch: x.branch, semester: x.semester, budget: x.budget, details: x.details }); fail(error);
  }
  async function loadRequests() {
    const c = await requireClient(); const { data, error } = await c.from('material_requests').select('*').order('created_at', { ascending: false }).limit(200); fail(error);
    const rows = data || [], ids = [...new Set(rows.map(x => x.user_id))]; let prof = [];
    if (ids.length) { const p = await c.from('profiles').select('*').in('id', ids); fail(p.error); prof = p.data || []; }
    const cache = Object.fromEntries(prof.map(p => [p.id, mapProfile(p)]));
    return rows.map(x => ({ id:x.id, title:x.title, subject:x.subject, college:x.college, branch:x.branch, semester:x.semester, budget:x.budget, details:x.details, userId:x.user_id, createdAt:new Date(x.created_at).getTime(), profile:cache[x.user_id] }));
  }
  async function loadOffers(userId, listingRows) {
    const c = await requireClient(); const { data, error } = await c.from('offers').select('*').order('created_at', { ascending: false }).limit(300); fail(error);
    const offers = data || []; const map = Object.fromEntries((listingRows || []).map(x => [x.id, x]));
    offers.forEach(o => { const listing = map[o.listing_id]; if (listing) (listing.offers ||= []).push({ id:o.id, userId:o.buyer_id, price:Number(o.offered_price), message:o.message, status:o.status, createdAt:new Date(o.created_at).getTime() }); });
  }
  async function addOffer(listingId, price, message) {
    const c = await requireClient(); const { data: { user } } = await c.auth.getUser();
    if (!user) throw new Error('Please log in first.');
    const { error } = await c.from('offers').insert({ listing_id: listingId, buyer_id:user.id, offered_price:Number(price), message }); fail(error);
  }
  async function updateOffer(offerId, status) {
    const c = await requireClient(); const { error } = await c.from('offers').update({ status }).eq('id', offerId); fail(error);
  }
  async function getOrCreateConversation(userId, otherId, listingId) {
    const c = await requireClient();
    let q = c.from('conversations').select('*').or(`and(participant_one.eq.${userId},participant_two.eq.${otherId}),and(participant_one.eq.${otherId},participant_two.eq.${userId})`);
    q = listingId ? q.eq('listing_id', listingId) : q.is('listing_id', null);
    const found = await q.maybeSingle(); fail(found.error); if (found.data) return found.data;
    const created = await c.from('conversations').insert({ participant_one:userId, participant_two:otherId, listing_id:listingId || null }).select().single();
    if (created.error) { // A concurrent first message may have created the same conversation.
      const retry = await c.from('conversations').select('*').or(`and(participant_one.eq.${userId},participant_two.eq.${otherId}),and(participant_one.eq.${otherId},participant_two.eq.${userId})`).maybeSingle();
      fail(retry.error); if (retry.data) return retry.data; throw created.error;
    }
    return created.data;
  }
  async function startConversation(userId, otherId, listingId) { return getOrCreateConversation(userId, otherId, listingId); }
  async function sendMessage(userId, otherId, listingId, body) {
    const c = await requireClient(); const conv = await getOrCreateConversation(userId, otherId, listingId);
    const { error } = await c.from('messages').insert({ conversation_id:conv.id, sender_id:userId, body }); fail(error);
    return conv;
  }
  async function loadThreads(userId) {
    const c = await requireClient(); const conv = await c.from('conversations').select('*').order('created_at', { ascending: false }); fail(conv.error);
    const conversations = conv.data || []; const ids = conversations.map(x => x.id); if (!ids.length) return [];
    const m = await c.from('messages').select('*').in('conversation_id', ids).order('created_at', { ascending: true }); fail(m.error);
    const msgRows = m.data || []; const people = [...new Set(conversations.flatMap(x => [x.participant_one,x.participant_two]))];
    const p = await c.from('profiles').select('*').in('id', people); fail(p.error);
    const cache = Object.fromEntries((p.data || []).map(x => [x.id, mapProfile(x)]));
    return conversations.map(cn => ({ id:cn.id, members:[cn.participant_one,cn.participant_two], listingId:cn.listing_id, messages:msgRows.filter(x => x.conversation_id===cn.id).map(x => ({ from:x.sender_id, text:x.body, time:new Date(x.created_at).getTime() })), profiles:cache }));
  }
  async function getFileUrl(path) {
    const c = await requireClient(); const { data, error } = await c.storage.from('chb-materials').createSignedUrl(path, 60 * 30); fail(error); return data.signedUrl;
  }

  async function startPhoneVerification(userId, phoneNumber) {
    const c = await requireClient();
    const { data: { user }, error: authError } = await c.auth.getUser(); fail(authError);
    if (!user || user.id !== userId) throw new Error('Please sign in to verify your own phone number.');
    const value = String(phoneNumber || '').trim();
    if (!/^\+91[6-9][0-9]{9}$/.test(value)) throw new Error('Enter a valid 10-digit Indian mobile number.');
    const { error } = await c.auth.updateUser({ phone: value });
    fail(error);
    return true;
  }
  async function verifyPhoneOtp(userId, phoneNumber, token) {
    const c = await requireClient();
    const { data: { user: before }, error: authError } = await c.auth.getUser(); fail(authError);
    if (!before || before.id !== userId) throw new Error('Please sign in to verify your own phone number.');
    const value = String(phoneNumber || '').trim();
    const code = String(token || '').replace(/\s/g, '');
    if (!/^\+91[6-9][0-9]{9}$/.test(value)) throw new Error('Enter a valid Indian mobile number.');
    if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit OTP sent to your phone.');
    const { error } = await c.auth.verifyOtp({ phone: value, token: code, type: 'phone_change' });
    fail(error);
    const { data: { user: after }, error: verifyError } = await c.auth.getUser(); fail(verifyError);
    if (!after || after.id !== userId || after.phone !== value || !after.phone_confirmed_at) {
      throw new Error('Supabase did not confirm this phone number. Please try again.');
    }
    const { data, error: rowError } = await c.from('private_contacts').select('phone_number, verified_at').eq('user_id', userId).maybeSingle();
    fail(rowError);
    if (!data || data.phone_number !== value || !data.verified_at) {
      throw new Error('OTP was accepted, but the private contact record was not created. Re-run the database feature migration and retry.');
    }
    return { phone: data.phone_number, verified: true };
  }
  async function loadReviews(listingId) {
    const c = await requireClient();
    const { data, error } = await c.from('resource_reviews').select('*').eq('listing_id', listingId).order('created_at', { ascending: false }); fail(error);
    const rows = data || [], ids = [...new Set(rows.map(x => x.reviewer_id))];
    let prof = [];
    if (ids.length) { const p = await c.from('profiles').select('*').in('id', ids); fail(p.error); prof = p.data || []; }
    const cache = Object.fromEntries(prof.map(p => [p.id, mapProfile(p)]));
    return rows.map(x => ({ id:x.id, userId:x.reviewer_id, rating:Number(x.rating), body:x.body, createdAt:new Date(x.created_at).getTime(), profile:cache[x.reviewer_id] }));
  }
  async function addReview(listingId, rating, body) {
    const c = await requireClient();
    const { data: { user }, error: authError } = await c.auth.getUser(); fail(authError);
    if (!user) throw new Error('Please sign in to leave a review.');
    const score = Number(rating), text = String(body || '').trim();
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('Choose a star rating from 1 to 5.');
    if (text.length < 3 || text.length > 1000) throw new Error('Write a review of 3 to 1,000 characters.');
    const { error } = await c.from('resource_reviews').insert({ listing_id:listingId, reviewer_id:user.id, rating:score, body:text }); fail(error);
  }
  async function createConsultation(listingId, scheduledFor, message) {
    const c = await requireClient();
    const { data: { user }, error: authError } = await c.auth.getUser(); fail(authError);
    if (!user) throw new Error('Please sign in to request a call.');
    const { data: listing, error: listingError } = await c.from('listings').select('seller_id,status').eq('id', listingId).single(); fail(listingError);
    if (!listing || listing.seller_id === user.id) throw new Error('You cannot request a call for your own listing.');
    if (listing.status !== 'available') throw new Error('This resource is no longer available.');
    const date = new Date(scheduledFor);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) throw new Error('Choose a future date and time.');
    const { error } = await c.from('consultation_requests').insert({
      listing_id:listingId, requester_id:user.id, seller_id:listing.seller_id,
      scheduled_for:date.toISOString(), message:String(message || '').trim(), status:'Pending'
    }); fail(error);
  }
  async function loadConsultations(userId) {
    const c = await requireClient();
    const { data, error } = await c.from('consultation_requests').select('*')
      .or(`requester_id.eq.${userId},seller_id.eq.${userId}`).order('created_at', { ascending:false }).limit(100);
    fail(error);
    return (data || []).map(x => ({ id:x.id, listingId:x.listing_id, requesterId:x.requester_id, sellerId:x.seller_id,
      scheduledFor:x.scheduled_for, message:x.message || '', status:x.status, meetingUrl:x.meeting_url || '', createdAt:new Date(x.created_at).getTime() }));
  }
  async function updateConsultation(consultationId, status, meetingUrl) {
    const c = await requireClient();
    if (!['Accepted','Declined','Completed'].includes(status)) throw new Error('Invalid call-request status.');
    const url = meetingUrl ? String(meetingUrl) : null;
    if (url && !/^https:\/\/meet\.jit\.si\/[A-Za-z0-9_-]+$/.test(url)) throw new Error('Invalid meeting link.');
    const { error } = await c.from('consultation_requests').update({ status, meeting_url:url, updated_at:new Date().toISOString() }).eq('id', consultationId); fail(error);
  }

  window.CHB = {
    configured, get client(){ return client; }, getProfile, saveProfile, getMyPhone, deleteMyPhone, startPhoneVerification, verifyPhoneOtp, loadListings, createListing, setListingStatus,
    loadComments, addComment, loadReviews, addReview, createConsultation, loadConsultations, updateConsultation, loadWishlist, toggleWishlist, createRequest, loadRequests, loadOffers,
    addOffer, updateOffer, startConversation, sendMessage, loadThreads, getFileUrl, mapProfile
  };
})();
