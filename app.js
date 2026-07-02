// NOAA POES/ESSA Image Archive browser.
// The NOAA NCEI directory (Apache autoindex, CORS-open) is used directly as the data
// source: we fetch its HTML index pages and parse them, we never copy or re-host files.

const BASE = 'https://www.ncei.noaa.gov/data/poes-essa-noaa-image-files/access/';
const IMG_EXT = /\.(png|jpe?g|gif)$/i;
const BATCH_SIZE = 48;

const els = {
  yearSelect: document.getElementById('year-select'),
  countLabel: document.getElementById('count-label'),
  grid: document.getElementById('grid'),
  loading: document.getElementById('loading'),
  sentinel: document.getElementById('sentinel'),
  lightbox: document.getElementById('lightbox'),
  lightboxImg: document.getElementById('lightbox-img'),
  lightboxTitle: document.getElementById('lightbox-title'),
  lightboxSub: document.getElementById('lightbox-sub'),
  lightboxOriginal: document.getElementById('lightbox-original'),
  lightboxClose: document.getElementById('lightbox-close'),
  lightboxPrev: document.getElementById('lightbox-prev'),
  lightboxNext: document.getElementById('lightbox-next'),
};

let items = [];
let renderedCount = 0;
let currentLightboxIndex = -1;

// --- directory listing ---------------------------------------------------

async function fetchDir(relPath) {
  const res = await fetch(BASE + relPath);
  if (!res.ok) throw new Error(`Failed to fetch ${relPath}: ${res.status}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const entries = [];
  doc.querySelectorAll('tr').forEach((tr) => {
    const a = tr.querySelector('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href === '..') return;
    const cells = tr.querySelectorAll('td');
    const size = cells.length >= 3 ? cells[2].textContent.trim() : '-';
    entries.push({ name: href, isDir: !IMG_EXT.test(href), size });
  });
  return entries;
}

function parseFilename(name) {
  const match = name.match(IMG_EXT);
  if (!match) return null;
  const base = name.slice(0, name.length - match[0].length);
  const parts = base.split('.');
  if (parts.length < 5) {
    return {
      satellite: parts[0] || 'unknown',
      channel: parts[1] || 'unknown',
      hemisphere: null,
      dateStr: '',
      seq: 0,
    };
  }
  const satellite = parts[0];
  const channel = parts[1];
  let idx = 2;
  let hemisphere = null;
  if (!/^\d{4}$/.test(parts[idx])) {
    hemisphere = parts[idx];
    idx += 1;
  }
  const year = parts[idx];
  const month = parts[idx + 1];
  const day = parts[idx + 2];
  const seq = parseInt(parts[idx + 3], 10) || 0;
  return {
    satellite,
    channel,
    hemisphere,
    dateStr: year && month && day ? `${year}-${month}-${day}` : '',
    seq,
  };
}

function formatBytes(str) {
  const bytes = parseInt(str, 10);
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

// --- thumbnail proxy (on-the-fly resize, nothing stored) ------------------

function thumbUrl(path, width) {
  const full = encodeURIComponent(BASE + path);
  return `https://wsrv.nl/?url=${full}&w=${width}&output=webp&q=78`;
}

// --- loading a year ---------------------------------------------------

let loadToken = 0;

async function loadYear(year) {
  const token = ++loadToken;
  setLoading(true);
  try {
    const monthEntries = (await fetchDir(`${year}/`)).filter((e) => e.isDir);
    const monthFileLists = await Promise.all(
      monthEntries.map((m) => fetchDir(`${year}/${m.name}/`))
    );
    if (token !== loadToken) return; // a newer year was selected while this was in flight

    const collected = [];
    monthFileLists.forEach((files, i) => {
      const month = monthEntries[i].name;
      files
        .filter((f) => !f.isDir)
        .forEach((f) => {
          const meta = parseFilename(f.name);
          if (!meta) return;
          collected.push({
            ...meta,
            filename: f.name,
            path: `${year}/${month}/${f.name}`,
            size: f.size,
          });
        });
    });

    collected.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.seq - b.seq);
    items = collected;
    els.countLabel.textContent = `${items.length} images`;
    els.grid.innerHTML = '';
    renderedCount = 0;
    renderNextBatch();
  } catch (err) {
    if (token !== loadToken) return;
    els.grid.innerHTML = `<p style="padding:40px;color:#8a8a85;font-family:monospace">Could not load ${year}: ${err.message}</p>`;
  } finally {
    if (token === loadToken) setLoading(false);
  }
}

function setLoading(isLoading) {
  els.loading.classList.toggle('hidden', !isLoading);
}

// --- rendering ----------------------------------------------------------

function renderNextBatch() {
  const next = items.slice(renderedCount, renderedCount + BATCH_SIZE);
  const frag = document.createDocumentFragment();
  next.forEach((item, i) => frag.appendChild(createCard(item, renderedCount + i)));
  els.grid.appendChild(frag);
  renderedCount += next.length;
}

function createCard(item, index) {
  const card = document.createElement('div');
  card.className = 'card';

  const imgWrap = document.createElement('div');
  imgWrap.className = 'card-img-wrap';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = thumbUrl(item.path, 480);
  img.alt = item.filename;
  img.onerror = () => {
    img.onerror = null;
    img.src = BASE + item.path;
  };
  imgWrap.appendChild(img);
  card.appendChild(imgWrap);

  const caption = document.createElement('div');
  caption.className = 'card-caption';
  const tag = [item.satellite, item.channel, item.hemisphere].filter(Boolean).join(' · ');
  caption.innerHTML = `<span class="card-date">${item.dateStr || item.filename}</span><span class="card-tag">${tag}</span>`;
  card.appendChild(caption);

  card.addEventListener('click', () => openLightbox(index));
  return card;
}

const observer = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && renderedCount < items.length) {
    renderNextBatch();
  }
});
observer.observe(els.sentinel);

// --- lightbox -------------------------------------------------------------

function openLightbox(index) {
  currentLightboxIndex = index;
  showLightboxItem();
  els.lightbox.classList.remove('hidden');
}

function closeLightbox() {
  els.lightbox.classList.add('hidden');
  els.lightboxImg.src = '';
}

function showLightboxItem() {
  const item = items[currentLightboxIndex];
  if (!item) return;
  els.lightboxImg.src = thumbUrl(item.path, 1600);
  els.lightboxImg.onerror = () => {
    els.lightboxImg.onerror = null;
    els.lightboxImg.src = BASE + item.path;
  };
  const tag = [item.satellite, item.channel, item.hemisphere].filter(Boolean).join(' · ');
  els.lightboxTitle.textContent = tag;
  els.lightboxSub.textContent = `${item.dateStr || ''}${item.seq ? ` · frame ${item.seq}` : ''} · ${formatBytes(item.size)}`;
  els.lightboxOriginal.href = BASE + item.path;
}

function stepLightbox(delta) {
  if (currentLightboxIndex < 0) return;
  const next = currentLightboxIndex + delta;
  if (next < 0 || next >= items.length) return;
  currentLightboxIndex = next;
  showLightboxItem();
}

els.lightboxClose.addEventListener('click', closeLightbox);
els.lightboxPrev.addEventListener('click', () => stepLightbox(-1));
els.lightboxNext.addEventListener('click', () => stepLightbox(1));
els.lightbox.addEventListener('click', (e) => {
  if (e.target === els.lightbox) closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (els.lightbox.classList.contains('hidden')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') stepLightbox(-1);
  if (e.key === 'ArrowRight') stepLightbox(1);
});

// --- controls ---------------------------------------------------------

els.yearSelect.addEventListener('change', () => loadYear(els.yearSelect.value));

// --- init ---------------------------------------------------------------

async function init() {
  setLoading(true);
  const years = (await fetchDir('')).filter((e) => e.isDir && /^\d{4}$/.test(e.name));
  years.forEach((y) => {
    const opt = document.createElement('option');
    opt.value = y.name;
    opt.textContent = y.name;
    els.yearSelect.appendChild(opt);
  });
  const firstYear = years[0]?.name;
  if (firstYear) {
    els.yearSelect.value = firstYear;
    loadYear(firstYear);
  } else {
    setLoading(false);
  }
}

init();
