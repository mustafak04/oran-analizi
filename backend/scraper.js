const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'matches.json');
const FILTERS_FILE = path.join(DATA_DIR, 'saved_filters.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://www.iddaa.com',
  Referer: 'https://www.iddaa.com/program/futbol'
};

/**
 * Unix saniye cinsinden zaman damgasını Türkiye saatine göre
 * GG.AA.YYYY tarih ve SS:DD saat formatına dönüştürür.
 */
function formatUnixTimestampTR(unixSeconds) {
  const ms = unixSeconds > 1e11 ? unixSeconds : unixSeconds * 1000;
  const d = new Date(ms);

  const parts = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d);

  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  return {
    date: `${map.day}.${map.month}.${map.year}`,
    isoDate: `${map.year}-${map.month}-${map.day}`,
    time: `${map.hour}:${map.minute}`,
    timestamp: Math.floor(ms / 1000)
  };
}

/**
 * YYYY-MM-DD formatındaki tarihi GG.AA.YYYY formatına çevirir
 */
function normalizeDateToTR(dateStr) {
  if (!dateStr) return '';
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) return dateStr;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}.${m}.${y}`;
  }
  return dateStr;
}

/**
 * GG.AA.YYYY tarihini sıralama için YYYY-MM-DD'ye çevirir
 */
function trDateToIso(trDate) {
  if (!trDate) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trDate)) return trDate;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(trDate)) {
    const [d, m, y] = trDate.split('.');
    return `${y}-${m}-${d}`;
  }
  return trDate;
}

/**
 * İY ve MS skorlarından sonuç etiketlerini üretir
 */
function computeOutcomeTags(htScore, ftScore) {
  if (!htScore || !ftScore || !ftScore.includes('-')) {
    return null;
  }
  const [htH, htA] = htScore.split('-').map((n) => parseInt(n.trim(), 10));
  const [ftH, ftA] = ftScore.split('-').map((n) => parseInt(n.trim(), 10));
  if (Number.isNaN(htH) || Number.isNaN(htA) || Number.isNaN(ftH) || Number.isNaN(ftA)) {
    return null;
  }

  const iy = htH > htA ? '1' : htH < htA ? '2' : 'X';
  const ms = ftH > ftA ? '1' : ftH < ftA ? '2' : 'X';
  const totalGoals = ftH + ftA;

  return {
    htHome: htH,
    htAway: htA,
    ftHome: ftH,
    ftAway: ftA,
    iyResult: iy,
    msResult: ms,
    iymsResult: `${iy}/${ms}`,
    over15: totalGoals > 1.5,
    over25: totalGoals > 2.5,
    over35: totalGoals > 3.5,
    kgVar: ftH > 0 && ftA > 0,
    totalGoals
  };
}

/**
 * sportsbookv2.iddaa.com market dizisini (ev.m) uygulama oran şemasına (odds) dönüştürür.
 * SADECE iddaa.com'dan gelen gerçek oranları yazar; hiçbir tahmini/temsili oran üretmez!
 */
function parseIddaaMarketsArray(markets = []) {
  const odds = {};
  const fmt = (v) =>
    v !== undefined && v !== null && !Number.isNaN(Number(v)) ? Number(v).toFixed(2) : '-';

  for (const m of markets) {
    const st = Number(m.st);
    const sov = m.sov !== undefined ? String(m.sov) : '';
    const outcomes = m.o || [];

    if (st === 1) {
      for (const o of outcomes) {
        if (o.no === 1) odds.ms1 = fmt(o.odd);
        else if (o.no === 2) odds.msX = fmt(o.odd);
        else if (o.no === 3) odds.ms2 = fmt(o.odd);
      }
    } else if (st === 92) {
      for (const o of outcomes) {
        if (o.no === 1) odds.cs1X = fmt(o.odd);
        else if (o.no === 2) odds.cs12 = fmt(o.odd);
        else if (o.no === 3) odds.csX2 = fmt(o.odd);
      }
    } else if (st === 88) {
      for (const o of outcomes) {
        if (o.no === 1) odds.iy1 = fmt(o.odd);
        else if (o.no === 2) odds.iyX = fmt(o.odd);
        else if (o.no === 3) odds.iy2 = fmt(o.odd);
      }
    } else if (st === 101) {
      if (sov === '1.5') {
        for (const o of outcomes) {
          if (o.no === 1) odds.alt15 = fmt(o.odd);
          else if (o.no === 2) odds.ust15 = fmt(o.odd);
        }
      } else if (sov === '2.5') {
        for (const o of outcomes) {
          if (o.no === 1) odds.alt25 = fmt(o.odd);
          else if (o.no === 2) odds.ust25 = fmt(o.odd);
        }
      } else if (sov === '3.5') {
        for (const o of outcomes) {
          if (o.no === 1) odds.alt35 = fmt(o.odd);
          else if (o.no === 2) odds.ust35 = fmt(o.odd);
        }
      }
    } else if (st === 89) {
      for (const o of outcomes) {
        if (o.no === 1) odds.kgVar = fmt(o.odd);
        else if (o.no === 2) odds.kgYok = fmt(o.odd);
      }
    } else if (st === 4) {
      for (const o of outcomes) {
        if (o.no === 1) odds.tg01 = fmt(o.odd);
        else if (o.no === 2) odds.tg23 = fmt(o.odd);
        else if (o.no === 3) odds.tg45 = fmt(o.odd);
        else if (o.no === 4) odds.tg6p = fmt(o.odd);
      }
    } else if (st === 90) {
      const iymsMap = {
        1: 'iyms11', 2: 'iyms1X', 3: 'iyms12',
        4: 'iymsX1', 5: 'iymsXX', 6: 'iymsX2',
        7: 'iyms21', 8: 'iyms2X', 9: 'iyms22'
      };
      for (const o of outcomes) {
        const key = iymsMap[o.no];
        if (key) odds[key] = fmt(o.odd);
      }
    } else if (st === 717) {
      const iySkorMap = {
        1: 'iyskor00', 2: 'iyskor11', 3: 'iyskor22',
        4: 'iyskor10', 5: 'iyskor20', 6: 'iyskor21',
        7: 'iyskor01', 8: 'iyskor02', 9: 'iyskor12',
        10: 'iyskorDiger'
      };
      for (const o of outcomes) {
        const key = iySkorMap[o.no];
        if (key) odds[key] = fmt(o.odd);
      }
    } else if (st === 86) {
      const ftSkorMap = {
        1: 'skor10', 2: 'skor20', 3: 'skor21', 4: 'skor30',
        5: 'skor31', 6: 'skor32', 7: 'skor40', 8: 'skor41',
        9: 'skor42', 10: 'skor50', 11: 'skor51', 12: 'skor60',
        13: 'skor00', 14: 'skor11', 15: 'skor22', 16: 'skor33',
        17: 'skor01', 18: 'skor02', 19: 'skor12', 20: 'skor03',
        21: 'skor13', 22: 'skor23', 23: 'skor04', 24: 'skor14',
        25: 'skor24', 26: 'skor05', 27: 'skor15', 28: 'skor06',
        29: 'skorDiger'
      };
      for (const o of outcomes) {
        const key = ftSkorMap[o.no];
        if (key) odds[key] = fmt(o.odd);
      }
    }
  }

  return odds;
}

/**
 * iddaa.com Lig Listesini (Competitions) çeker
 */
async function fetchCompetitionsMap() {
  const compMap = new Map();
  try {
    const res = await fetch('https://sportsbookv2.iddaa.com/sportsbook/competitions', {
      signal: AbortSignal.timeout(10000),
      headers: HEADERS
    });
    if (res.ok) {
      const json = await res.json();
      const list = json?.data || [];
      if (Array.isArray(list)) {
        for (const c of list) {
          compMap.set(Number(c.i), c.n || c.sn || 'Futbol Ligi');
        }
      }
    }
  } catch (err) {
    console.warn('Lig listesi çekilemedi:', err.message);
  }
  return compMap;
}

/**
 * Bültendeki maçların 78 marketlik tam detayını (/sportsbook/event/{id})
 * paralel gruplar halinde çekerek gerçek st=86 (29 skor) ve st=717 (İY skor) oranlarını alır.
 */
async function enrichEventsWithDetailedScoreMarkets(eventsList, existingByCode, maxToEnrich = 350) {
  // Önce daha önce skor marketleri çekilmiş olanların mevcut gerçek skor oranlarını koru
  for (const m of eventsList) {
    const prev = existingByCode.get(String(m.code));
    if (prev && prev.hasFullScoreMarkets && prev.odds) {
      m.odds = { ...prev.odds, ...m.odds };
      m.hasFullScoreMarkets = true;
    }
  }

  // Henüz tam skor detayı çekilmemiş olanları paralel çek
  const targets = eventsList.filter((m) => !m.hasFullScoreMarkets).slice(0, maxToEnrich);
  const batchSize = 40;

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (matchObj) => {
        try {
          const r = await fetch(`https://sportsbookv2.iddaa.com/sportsbook/event/${matchObj.code}`, {
            signal: AbortSignal.timeout(6000),
            headers: HEADERS
          });
          if (r.ok) {
            const j = await r.json();
            if (j?.isSuccess && Array.isArray(j.data?.m)) {
              matchObj.odds = parseIddaaMarketsArray(j.data.m);
              matchObj.hasFullScoreMarkets = true;
            }
          }
        } catch (_) {}
      })
    );
  }
}

/**
 * Tek bir maçın tüm 78 marketini iddaa.com'dan canlı çeker
 */
async function fetchSingleEventFullOdds(eventId) {
  const r = await fetch(`https://sportsbookv2.iddaa.com/sportsbook/event/${eventId}`, {
    signal: AbortSignal.timeout(7000),
    headers: HEADERS
  });
  if (!r.ok) return null;
  const j = await r.json();
  if (!j?.isSuccess || !Array.isArray(j.data?.m)) return null;
  return parseIddaaMarketsArray(j.data.m);
}

/**
 * KALICI ARŞİV BİRLEŞTİRME MOTORU (%100 GERÇEK VERİ)
 * - Hiçbir maça temsili/tahmini oran ATANMAZ.
 * - Sadece bültendeyken gerçek İddaa oranları kaydedilmiş olan maçlar bittiğinde FINISHED olarak arşivde tutulur.
 */
function mergeMatchesIntoPermanentArchive(existingMatches = [], newUpcoming = [], newFinished = []) {
  const archiveByCode = new Map();

  // 1. Diskteki mevcut gerçek maçları yükle
  for (const oldMatch of existingMatches) {
    if (!oldMatch || !oldMatch.code) continue;
    const codeKey = String(oldMatch.code);
    archiveByCode.set(codeKey, {
      ...oldMatch,
      date: normalizeDateToTR(oldMatch.date),
      isoDate: oldMatch.isoDate || trDateToIso(oldMatch.date)
    });
  }

  // 2. Yeni çekilen güncel bülten maçlarını ekle veya maç başlamadıysa kapanış oranlarını güncelle
  const nowSec = Math.floor(Date.now() / 1000);
  const currentBulletinCodes = new Set();
  for (const upMatch of newUpcoming) {
    const codeKey = String(upMatch.code);
    currentBulletinCodes.add(codeKey);
    const prev = archiveByCode.get(codeKey);

    if (prev && prev.status === 'FINISHED') {
      continue;
    }

    const openingOdds = prev?.openingOdds || prev?.odds || upMatch.odds;

    const hasMatchStarted =
      upMatch.status === 'LIVE' || (upMatch.timestamp && nowSec >= upMatch.timestamp - 60);

    const effectiveClosingOdds =
      hasMatchStarted && prev?.odds && prev.odds.ms1 && prev.odds.ms1 !== '-'
        ? prev.odds
        : {
            ...(prev?.odds || {}),
            ...(upMatch.odds || {})
          };

    archiveByCode.set(codeKey, {
      ...(prev || {}),
      ...upMatch,
      openingOdds,
      odds: effectiveClosingOdds,
      hasFullScoreMarkets: Boolean(upMatch.hasFullScoreMarkets || prev?.hasFullScoreMarkets),
      oddsLockedAt: hasMatchStarted
        ? prev?.oddsLockedAt || new Date().toISOString()
        : prev?.oddsLockedAt || null
    });
  }

  // 3. Biten (FINISHED) maçları eşleştir:
  // SADECE daha önce bültendeyken gerçek oranları kaydedilmiş olan maçları sonuçlandır!
  for (const finMatch of newFinished) {
    const codeKey = String(finMatch.code);
    const prev = archiveByCode.get(codeKey);

    // Eğer bu maçın gerçek bülten oranı bizde kayıtlı değilse, temsili oran atama ve arşive alma!
    if (!prev || !prev.odds || !prev.odds.ms1 || prev.odds.ms1 === '-') {
      continue;
    }

    archiveByCode.set(codeKey, {
      ...prev,
      ...finMatch,
      id: `fin-${codeKey}`,
      status: 'FINISHED',
      openingOdds: prev.openingOdds || prev.odds,
      odds: prev.odds
    });
  }

  const finalArray = [];
  for (const [codeKey, m] of archiveByCode.entries()) {
    if (m.status === 'FINISHED') {
      finalArray.push(m);
    } else if (currentBulletinCodes.has(codeKey)) {
      finalArray.push(m);
    }
  }

  // Henüz başlamamış maçlar (gelecek maçlar) en üstte saat sırasıyla:
  const notStartedUpcoming = finalArray
    .filter((m) => m.status !== 'FINISHED' && m.status !== 'LIVE' && (!m.timestamp || m.timestamp > nowSec))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  // Şu an oynanmakta olan (LIVE) veya başlama saati geçmiş maçlar bültenin altında:
  const liveOrStartedPart = finalArray
    .filter((m) => m.status !== 'FINISHED' && (m.status === 'LIVE' || (m.timestamp && m.timestamp <= nowSec)))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  // Biten (FINISHED) maçlar en yeniden en eskiye:
  const finishedPart = finalArray
    .filter((m) => m.status === 'FINISHED')
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  return [...notStartedUpcoming, ...liveOrStartedPart, ...finishedPart];
}

/**
 * iddaa.com'dan güncel bülteni ve biten maç sonuçlarını çeker (%100 gerçek oranlar)
 */
async function scrapeLiveIddaaMatches(existingMatches = []) {
  const compMap = await fetchCompetitionsMap();

  const existingByCode = new Map();
  for (const m of existingMatches) {
    if (m && m.code) {
      existingByCode.set(String(m.code), m);
    }
  }

  const upcomingMatches = [];

  // ADIM 1: Güncel Bültendeki TÜM Futbol Maçlarını Çek
  try {
    const res = await fetch(
      'https://sportsbookv2.iddaa.com/sportsbook/events?st=1&type=0&version=0',
      {
        signal: AbortSignal.timeout(15000),
        headers: HEADERS
      }
    );

    if (res.ok) {
      const json = await res.json();
      const events = json?.data?.events || [];

      for (const ev of events) {
        if (!ev.hn || !ev.an) continue;
        // Canlıda (oynanmakta) olan maçları eğer daha önce kaydetmediysek maç önü oranı olmadığı için atla
        if (ev.il && !existingByCode.has(String(ev.i))) continue;

        const dt = formatUnixTimestampTR(ev.d);
        const leagueName = compMap.get(Number(ev.ci)) || `Lig #${ev.ci}`;
        const parsedOdds = parseIddaaMarketsArray(ev.m || []);

        upcomingMatches.push({
          id: `iddaa-${ev.i}`,
          code: String(ev.i),
          betradarId: ev.bri,
          date: dt.date,
          isoDate: dt.isoDate,
          time: dt.time,
          timestamp: dt.timestamp,
          league: leagueName,
          homeTeam: ev.hn,
          awayTeam: ev.an,
          status: ev.il ? 'LIVE' : 'UPCOMING',
          mbs: ev.mbc || 1,
          htScore: '-',
          ftScore: '-',
          outcome: null,
          odds: parsedOdds,
          source: 'iddaa-sportsbookv2'
        });
      }
    }
  } catch (err) {
    console.error('Güncel bülten çekilirken hata:', err.message);
  }

  upcomingMatches.sort((a, b) => a.timestamp - b.timestamp);
  if (upcomingMatches.length > 0) {
    await enrichEventsWithDetailedScoreMarkets(upcomingMatches, existingByCode, 350);
  }

  // ADIM 2: statisticsv2.iddaa.com/live-results üzerinden biten maçların gerçek skorlarını çek
  // Sadece veritabanımızda gerçek bülten oranı kayıtlı olan maçların skorlarını güncellemek için kullanılır!
  const datesToQuery = new Set();
  const nowTs = Math.floor(Date.now() / 1000);
  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    const ts = nowTs - daysBack * 86400;
    const { isoDate } = formatUnixTimestampTR(ts);
    datesToQuery.add(isoDate);
  }

  const finishedMatches = [];
  const seenFinishedIds = new Set();

  const dateArray = Array.from(datesToQuery);
  await Promise.all(
    dateArray.map(async (isoDate) => {
      try {
        const url = `https://statisticsv2.iddaa.com/live-results?sportId=1&date=${isoDate}`;
        const r = await fetch(url, {
          signal: AbortSignal.timeout(12000),
          headers: HEADERS
        });
        if (!r.ok) return;
        const j = await r.json();
        if (!j?.isSuccess || !j.data) return;

        const dayComps = j.data.competitions || {};
        const dayEvents = j.data.events || [];
        const dayScores = j.data.sc || {};

        for (const ev of dayEvents) {
          const evId = String(ev.eventId);
          if (seenFinishedIds.has(evId)) continue;

          // SADECE bizde gerçek bülten oranı kayıtlı olan maçları al!
          const existingMatch = existingByCode.get(evId);
          if (!existingMatch || !existingMatch.odds || !existingMatch.odds.ms1 || existingMatch.odds.ms1 === '-') {
            continue;
          }

          const scoreObj = dayScores[evId];
          if (!scoreObj || !scoreObj.ht || !scoreObj.at) continue;
          if (scoreObj.ht.r === undefined || scoreObj.at.r === undefined) continue;
          if (ev.phase !== 2 && scoreObj.s !== 6 && scoreObj.s !== 100) continue;

          seenFinishedIds.add(evId);

          const htHome = scoreObj.ht.ht ?? 0;
          const htAway = scoreObj.at.ht ?? 0;
          const ftHome = scoreObj.ht.r ?? scoreObj.ht.c ?? 0;
          const ftAway = scoreObj.at.r ?? scoreObj.at.c ?? 0;

          const htScore = `${htHome}-${htAway}`;
          const ftScore = `${ftHome}-${ftAway}`;
          const outcome = computeOutcomeTags(htScore, ftScore);

          const dt = formatUnixTimestampTR(ev.eventDate);
          const compInfo = dayComps[String(ev.ci)];
          const leagueName =
            compInfo?.n || compInfo?.sn || compMap.get(Number(ev.ci)) || existingMatch.league;

          finishedMatches.push({
            id: `fin-${evId}`,
            code: evId,
            betradarId: ev.betradarId,
            date: dt.date,
            isoDate: dt.isoDate,
            time: dt.time,
            timestamp: dt.timestamp,
            league: leagueName,
            homeTeam: ev.homeTeam,
            awayTeam: ev.awayTeam,
            status: 'FINISHED',
            mbs: existingMatch.mbs || 1,
            htScore,
            ftScore,
            outcome,
            odds: existingMatch.odds,
            source: 'iddaa-real-verified'
          });
        }
      } catch (_) {}
    })
  );

  const mergedArchive = mergeMatchesIntoPermanentArchive(
    existingMatches,
    upcomingMatches,
    finishedMatches
  );

  if (mergedArchive.length > 0) {
    return {
      success: true,
      method: 'iddaa-real-verified',
      upcomingCount: mergedArchive.filter((m) => m.status !== 'FINISHED').length,
      finishedCount: mergedArchive.filter((m) => m.status === 'FINISHED').length,
      count: mergedArchive.length,
      matches: mergedArchive
    };
  }

  return {
    success: false,
    method: 'cached-database',
    upcomingCount: 0,
    finishedCount: 0,
    count: existingMatches.length,
    matches: existingMatches
  };
}

/**
 * Veritabanını diskten okur
 */
function loadMatchesDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((m) => ({
          ...m,
          date: normalizeDateToTR(m.date),
          isoDate: m.isoDate || trDateToIso(m.date)
        }));
      }
    } catch (_) {}
  }
  return [];
}

/**
 * Veritabanını diske kaydeder
 */
function saveMatchesDatabase(matches) {
  fs.writeFileSync(DB_FILE, JSON.stringify(matches, null, 2), 'utf-8');
}

const DEFAULT_SAVED_FILTERS = [
  {
    id: 'preset-plus6-gol',
    name: '+6 Gol Filtresi',
    createdAt: '07.11.2026',
    statusFilter: 'ALL',
    selectedLeague: 'ALL',
    columnFilters: {},
    rules: [
      { id: 1001, group: 1, logic: 'AND', field: 'odds.skor33', operator: '<=', value: '29.00' },
      { id: 1002, group: 2, logic: 'OR', field: 'odds.skor51', operator: '<=', value: '40.00' },
      { id: 1003, group: 2, logic: 'OR', field: 'odds.skor42', operator: '<=', value: '40.00' },
      { id: 1004, group: 2, logic: 'OR', field: 'odds.skor24', operator: '<=', value: '40.00' },
      { id: 1005, group: 2, logic: 'OR', field: 'odds.skor15', operator: '<=', value: '40.00' }
    ]
  },
  {
    id: 'preset-5-gol-1',
    name: '5 Gol Filtresi(1)',
    createdAt: '07.11.2026',
    statusFilter: 'ALL',
    selectedLeague: 'ALL',
    columnFilters: {},
    rules: [
      { id: 2001, group: 1, logic: 'AND', field: 'odds.skor33', operator: '<=', value: '29.00' },
      { id: 2002, group: 1, logic: 'AND', field: 'odds.skor51', operator: '>', value: '40.00' },
      { id: 2003, group: 1, logic: 'AND', field: 'odds.skor42', operator: '>', value: '40.00' },
      { id: 2004, group: 1, logic: 'AND', field: 'odds.skor15', operator: '>', value: '40.00' },
      { id: 2005, group: 1, logic: 'AND', field: 'odds.skor24', operator: '>', value: '40.00' }
    ]
  },
  {
    id: 'preset-5-gol-2',
    name: '5 Gol Filtresi(2)',
    createdAt: '07.11.2026',
    statusFilter: 'ALL',
    selectedLeague: 'ALL',
    columnFilters: {},
    rules: [
      { id: 3001, group: 1, logic: 'AND', field: 'odds.skor33', operator: '>', value: '29.00' },
      { id: 3002, group: 2, logic: 'OR', field: 'odds.skor51', operator: '<=', value: '40.00' },
      { id: 3003, group: 2, logic: 'OR', field: 'odds.skor42', operator: '<=', value: '40.00' },
      { id: 3004, group: 2, logic: 'OR', field: 'odds.skor15', operator: '<=', value: '40.00' },
      { id: 3005, group: 2, logic: 'OR', field: 'odds.skor24', operator: '<=', value: '40.00' }
    ]
  }
];

function loadSavedFilters() {
  if (fs.existsSync(FILTERS_FILE)) {
    try {
      const raw = fs.readFileSync(FILTERS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  fs.writeFileSync(FILTERS_FILE, JSON.stringify(DEFAULT_SAVED_FILTERS, null, 2), 'utf-8');
  return DEFAULT_SAVED_FILTERS;
}

function saveSavedFilters(filters) {
  fs.writeFileSync(FILTERS_FILE, JSON.stringify(filters, null, 2), 'utf-8');
}

module.exports = {
  loadMatchesDatabase,
  saveMatchesDatabase,
  scrapeLiveIddaaMatches,
  fetchSingleEventFullOdds,
  computeOutcomeTags,
  normalizeDateToTR,
  loadSavedFilters,
  saveSavedFilters
};
