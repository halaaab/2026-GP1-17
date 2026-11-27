/* ==========================================================
   The logo row of the admin add / edit panels: upload a picture (button or drop), or keep the address already saved.
   The same as the Incubators & Accelerators panel (migration 0011), for the Startups and Regulatory pages
   (migration 0049: the "startup-logos" and "authority-logos" Storage buckets). The picture is shrunk in the
   browser to at most 400 px and saved as WebP (PNG where the browser cannot), then its public address is saved
   in the page's own column (startups.logo, regulatory_requirements.authority_logo).

     import { makeLogoUpload } from '../../../shared/logo-upload.js';
     const logo = makeLogoUpload({ bucket: 'startup-logos', row: '#logo-picker', preview: '#logo-preview',
       choose: '#logo-choose', remove: '#logo-remove', file: '#f-logo-file', error: '#logo-error',
       initials: () => 'AB', addressOf: (address) => address, onChange: () => {} });
     logo.reset(savedAddress);        // when the panel opens
     const address = await logo.save(id);   // on Save: the new address, the old one, or null when removed
   ========================================================== */
import { t } from './language.js';
import { supabase } from './supabase.js';

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;   // what an admin may pick; it is shrunk before upload
const SIZE = 400;                    // the longest side of the uploaded logo, in pixels

// the same arrow-up icon as the Incubators & Accelerators panel
const UPLOAD = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>';

const safe = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function shrink(file) {
  const picture = await createImageBitmap(file);
  const scale = Math.min(1, SIZE / Math.max(picture.width, picture.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(picture.width * scale);
  canvas.height = Math.round(picture.height * scale);
  canvas.getContext('2d').drawImage(picture, 0, 0, canvas.width, canvas.height);
  picture.close();
  const toBlob = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
  const webp = await toBlob('image/webp');
  return webp && webp.type === 'image/webp' ? webp : toBlob('image/png');
}

export function makeLogoUpload({ bucket, row, preview, choose, remove, file, error, initials, addressOf = (a) => a, onChange = () => {} }) {
  const $ = (selector) => document.querySelector(selector);
  const rowEl = $(row);
  const previewEl = $(preview);
  const chooseEl = $(choose);
  const removeEl = $(remove);
  const fileEl = $(file);
  const errorEl = $(error);
  const logo = { current: '', file: null, preview: '', removed: false };

  function show() {
    const shown = logo.preview || (logo.removed ? '' : addressOf(logo.current));
    previewEl.classList.toggle('has-image', Boolean(shown));
    previewEl.innerHTML = shown ? `<img src="${safe(shown)}" alt="">` : safe(initials() || '?');
    chooseEl.innerHTML = `${UPLOAD}<span>${t(shown ? 'programsAdmin.f.logoReplace' : 'programsAdmin.f.logoUpload')}</span>`;
    removeEl.hidden = !shown;
  }

  function showError(key) {
    errorEl.textContent = key ? t(key) : '';
    errorEl.hidden = !key;
    rowEl.classList.toggle('is-error', Boolean(key));
  }

  async function pick(picked) {
    showError('');
    if (!picked) return;
    if (!TYPES.includes(picked.type)) return showError('programsAdmin.f.logoType');
    if (picked.size > MAX_BYTES) return showError('programsAdmin.f.logoSize');
    try {
      const small = await shrink(picked);
      if (logo.preview) URL.revokeObjectURL(logo.preview);
      Object.assign(logo, { file: small, preview: URL.createObjectURL(small), removed: false });
      onChange();
    } catch {
      showError('programsAdmin.f.logoType');
    }
    show();
  }

  chooseEl.addEventListener('click', () => fileEl.click());
  fileEl.addEventListener('change', () => pick(fileEl.files[0]));
  removeEl.addEventListener('click', () => {
    if (logo.preview) URL.revokeObjectURL(logo.preview);
    Object.assign(logo, { file: null, preview: '', removed: true });
    fileEl.value = '';
    onChange();
    show();
  });
  // a picture can also be dropped on the row
  rowEl.addEventListener('dragover', (event) => { event.preventDefault(); rowEl.classList.add('is-dragging'); });
  rowEl.addEventListener('dragleave', () => rowEl.classList.remove('is-dragging'));
  rowEl.addEventListener('drop', (event) => {
    event.preventDefault();
    rowEl.classList.remove('is-dragging');
    pick(event.dataTransfer.files[0]);
  });

  // The file's path inside the bucket, from its public address ('' when it is not one of this bucket's)
  function pathOf(address) {
    const marker = `/object/public/${bucket}/`;
    const index = (address || '').indexOf(marker);
    return index === -1 ? '' : decodeURIComponent(address.slice(index + marker.length));
  }

  return {
    show,
    // When the panel opens: the saved address (or an empty one)
    reset(current) {
      if (logo.preview) URL.revokeObjectURL(logo.preview);
      Object.assign(logo, { current: current || '', file: null, preview: '', removed: false });
      fileEl.value = '';
      showError('');
      show();
    },
    // Another control set the address (a link typed, a known authority logo picked): forget the waiting picture
    useAddress(address) {
      if (logo.preview) URL.revokeObjectURL(logo.preview);
      Object.assign(logo, { current: address || '', file: null, preview: '', removed: false });
      fileEl.value = '';
      show();
    },
    hasNewPicture: () => Boolean(logo.file),
    isRemoved: () => logo.removed,
    // On Save: uploads a new picture under the item's id and returns its address; otherwise the saved address,
    // or null when it was removed. Throws when the upload fails (the page then shows its error and keeps the form).
    async save(id) {
      const old = logo.current;
      if (logo.file) {
        const extension = logo.file.type === 'image/webp' ? 'webp' : 'png';
        const path = `${id}/${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(path, logo.file, { contentType: logo.file.type });
        if (uploadError) throw uploadError;
        const address = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
        removeOld(old);
        return address;
      }
      if (logo.removed) {
        removeOld(old);
        return null;
      }
      return old || null;
    },
  };

  // Removing an old uploaded file is tidying up: if it fails, the item is still saved
  async function removeOld(address) {
    const path = pathOf(address);
    if (!path) return;
    const { error: removeError } = await supabase.storage.from(bucket).remove([path]);
    if (removeError) console.error('remove old logo:', removeError.message);
  }
}
