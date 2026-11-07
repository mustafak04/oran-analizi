const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const {
  loadMatchesDatabase,
  saveMatchesDatabase,
  scrapeLiveIddaaMatches,
  fetchSingleEventFullOdds,
  loadSavedFilters,
  saveSavedFilters
} = require('./scraper');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

let matchesCache = loadMatchesDatabase();
let savedFiltersCache = loadSavedFilters();
let lastSyncTime = new Date().toISOString();
let lastSyncMethod = matchesCache.length > 0 ? 'iddaa-permanent-archive' : 'initializing';

/**
 * iddaa.com (sportsbookv2 + statisticsv2) üzerinden canlı veri çekme
 * ve eski tarihli hiçbir maçı silmeden KALICI ARŞİVE birleştirme
 */
async function performSync() {
  const result = await scrapeLiveIddaaMatches(matchesCache);
  if (result.success && result.matches.length > 0) {
    matchesCache = result.matches;
    saveMatchesDatabase(matchesCache);
  }
  lastSyncTime = new Date().toISOString();
  lastSyncMethod = result.method;
  return {
    lastSyncTime,
    method: lastSyncMethod,
    totalMatches: matchesCache.length,
    upcomingCount: matchesCache.filter((m) => m.status !== 'FINISHED').length,
    finishedCount: matchesCache.filter((m) => m.status === 'FINISHED').length
  };
}

// Sunucu açılışında hemen canlı bülteni ve biten maçları senkronize et
performSync().catch((err) => console.error('İlk senkronizasyon hatası:', err.message));

// Her 5 dakikada bir otomatik bülten, kapanış oranı ve maç sonucu güncelleme (kalıcı arşive ekler)
cron.schedule('*/5 * * * *', async () => {
  try {
    await performSync();
  } catch (err) {
    console.error('Otomatik senkronizasyon hatası:', err.message);
  }
});

/**
 * GET /api/matches
 * Tüm geçmiş (kalıcı arşiv) ve güncel bülten maçlarını döndürür
 */
app.get('/api/matches', (req, res) => {
  const finishedMatches = matchesCache.filter((m) => m.status === 'FINISHED');
  const upcomingMatches = matchesCache.filter((m) => m.status !== 'FINISHED');

  // En eski arşiv tarihini bul
  const sortedFinishedByTime = [...finishedMatches].sort(
    (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
  );
  const oldestFinishedDate = sortedFinishedByTime[0]?.date || null;

  res.json({
    success: true,
    lastSyncTime,
    lastSyncMethod,
    stats: {
      total: matchesCache.length,
      finished: finishedMatches.length,
      upcoming: upcomingMatches.length,
      oldestFinishedDate
    },
    matches: matchesCache
  });
});

/**
 * POST /api/sync
 * iddaa.com üzerinden anlık tüm bülteni ve biten maçları çekip kalıcı arşive birleştirir
 */
app.post('/api/sync', async (req, res) => {
  try {
    const syncInfo = await performSync();
    res.json({
      success: true,
      ...syncInfo,
      matches: matchesCache
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/matches/:code/odds
 * Tek bir maçın iddaa.com'daki 78 marketlik tüm oran detaylarını canlı çeker
 */
app.get('/api/matches/:code/odds', async (req, res) => {
  try {
    const { code } = req.params;
    const fullOdds = await fetchSingleEventFullOdds(code);
    if (!fullOdds) {
      return res.status(404).json({ success: false, message: 'Maç detayı bulunamadı' });
    }
    const target = matchesCache.find((m) => String(m.code) === String(code));
    if (target) {
      target.odds = fullOdds;
      target.hasFullScoreMarkets = true;
      saveMatchesDatabase(matchesCache);
    }
    res.json({ success: true, code, odds: fullOdds });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/filters
 * Kayıtlı kullanıcı filtrelerini döndürür
 */
app.get('/api/filters', (req, res) => {
  savedFiltersCache = loadSavedFilters();
  res.json({
    success: true,
    filters: savedFiltersCache
  });
});

/**
 * POST /api/filters
 * Yeni bir çoklu filtre kaydeder veya mevcut filtreyi günceller
 */
app.post('/api/filters', (req, res) => {
  const { id, name, rules, columnFilters, statusFilter, selectedLeague } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, message: 'Filtre adı zorunludur.' });
  }

  const nowTR = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date());

  const newFilter = {
    id: id || `flt-${Date.now()}`,
    name: String(name).trim(),
    createdAt: nowTR,
    statusFilter: statusFilter || 'ALL',
    selectedLeague: selectedLeague || 'ALL',
    columnFilters: columnFilters || {},
    rules: Array.isArray(rules) ? rules : []
  };

  const existingIndex = savedFiltersCache.findIndex((f) => f.id === newFilter.id);
  if (existingIndex > -1) {
    savedFiltersCache[existingIndex] = newFilter;
  } else {
    savedFiltersCache.unshift(newFilter);
  }

  saveSavedFilters(savedFiltersCache);
  res.json({
    success: true,
    filter: newFilter,
    filters: savedFiltersCache
  });
});

/**
 * DELETE /api/filters/:id
 * Kayıtlı bir filtreyi siler
 */
app.delete('/api/filters/:id', (req, res) => {
  const { id } = req.params;
  savedFiltersCache = savedFiltersCache.filter((f) => String(f.id) !== String(id));
  saveSavedFilters(savedFiltersCache);
  res.json({
    success: true,
    filters: savedFiltersCache
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Frontend build (frontend/dist) klasörünü doğrudan http://localhost:5000 üzerinden sun
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(
    `[OranAnaliz Sunucu] http://localhost:${PORT} adresinde çalışıyor. Kalıcı Arşiv Maç Sayısı: ${matchesCache.length}`
  );
});
