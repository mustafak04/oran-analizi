import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Calculator,
  TrendingUp,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  X,
  SlidersHorizontal,
  Trophy,
  Target,
  Bookmark,
  BookmarkCheck,
  Save,
  Database,
  Eye,
  PanelRightClose,
  PanelRightOpen,
  Filter
} from 'lucide-react';
import { MARKET_GROUPS, ALL_ODD_COLUMNS, RULE_FIELDS } from './constants/marketColumns';
import { calculateBetSlipSummary } from './utils/systemMath';

/**
 * Görünüm Modu Ön Ayarları (Ergonomik kullanım için tek tıkla sütun seti seçimi)
 */
const VIEW_PRESETS = [
  {
    id: 'essential',
    label: '⚡ Ana Bülten (Tek Ekran)',
    desc: 'MS, ÇŞ, İY, Alt/Üst ve KG (Yatay kaydırma gerekmez)',
    groups: ['ms', 'cs', 'iy', 'au', 'kg']
  },
  {
    id: 'iyms_focus',
    label: '🔄 İY/MS Analiz',
    desc: 'MS, İY ve tüm İY/MS (1/1..2/2) oranları',
    groups: ['ms', 'iy', 'iyms']
  },
  {
    id: 'score_focus',
    label: '🎯 Skor Analiz (39 Sütun)',
    desc: 'MS, 2.5 Alt/Üst, İY Skoru (10) ve Maç Skoru (29)',
    groups: ['ms', 'iyskor', 'skor']
  },
  {
    id: 'all',
    label: `🌐 Tüm Marketler (${ALL_ODD_COLUMNS.length} Oran)`,
    desc: 'Bültendeki tüm 68 bahis seçeneği bir arada',
    groups: MARKET_GROUPS.map((g) => g.id)
  }
];

/**
 * Excel tipi sütun filtresi değerlendirici:
 * - ">1.50", ">=1.50", "<1.70", "<=1.80", "!=2.00"
 * - "1.40-1.70" (aralık)
 * - "1.50" (birebir veya başlangıç eşleşmesi)
 */
function matchesExcelColumnFilter(rawValue, filterExpr, isNumericOdd = false) {
  if (!filterExpr || !filterExpr.trim()) return true;
  const expr = filterExpr.trim();
  const strVal = String(rawValue ?? '').trim();
  if (!strVal || strVal === '-') return false;

  if (isNumericOdd) {
    const numVal = parseFloat(strVal.replace(',', '.'));
    if (Number.isNaN(numVal)) return false;

    if (expr.startsWith('>=')) {
      const target = parseFloat(expr.slice(2).replace(',', '.'));
      return !Number.isNaN(target) ? numVal >= target : true;
    }
    if (expr.startsWith('<=')) {
      const target = parseFloat(expr.slice(2).replace(',', '.'));
      return !Number.isNaN(target) ? numVal <= target : true;
    }
    if (expr.startsWith('!=')) {
      const target = parseFloat(expr.slice(2).replace(',', '.'));
      return !Number.isNaN(target) ? Math.abs(numVal - target) >= 0.001 : true;
    }
    if (expr.startsWith('>')) {
      const target = parseFloat(expr.slice(1).replace(',', '.'));
      return !Number.isNaN(target) ? numVal > target : true;
    }
    if (expr.startsWith('<')) {
      const target = parseFloat(expr.slice(1).replace(',', '.'));
      return !Number.isNaN(target) ? numVal < target : true;
    }
    if (expr.startsWith('=')) {
      const target = parseFloat(expr.slice(1).replace(',', '.'));
      return !Number.isNaN(target) ? Math.abs(numVal - target) < 0.001 : true;
    }
    if (expr.includes('-') && !expr.startsWith('-')) {
      const [minStr, maxStr] = expr.split('-');
      const min = parseFloat(minStr.replace(',', '.'));
      const max = parseFloat(maxStr.replace(',', '.'));
      if (!Number.isNaN(min) && !Number.isNaN(max)) {
        return numVal >= min && numVal <= max;
      }
    }

    const normalizedExpr = expr.replace(',', '.');
    if (normalizedExpr.length === 4 && !Number.isNaN(parseFloat(normalizedExpr))) {
      return Math.abs(numVal - parseFloat(normalizedExpr)) < 0.001;
    }
    return strVal.toLowerCase().startsWith(normalizedExpr.toLowerCase());
  }

  return strVal.toLowerCase().includes(expr.toLowerCase());
}

/**
 * Özel Kural Motoru tekil kural değerlendirici
 */
function evaluateSingleRule(match, rule) {
  if (!rule.value || !String(rule.value).trim()) return true;

  const rawTarget = String(rule.value).trim().replace(',', '.');
  let fieldVal;
  if (rule.field.startsWith('odds.')) {
    const oddKey = rule.field.replace('odds.', '');
    fieldVal = match.odds?.[oddKey];
  } else {
    fieldVal = match[rule.field];
  }

  if (fieldVal === undefined || fieldVal === null || fieldVal === '-') return false;

  const isOddField = rule.field.startsWith('odds.');
  if (isOddField) {
    const numActual = parseFloat(String(fieldVal).replace(',', '.'));
    const numTarget = parseFloat(rawTarget);
    if (Number.isNaN(numActual) || Number.isNaN(numTarget)) return false;

    switch (rule.operator) {
      case '=':
        return Math.abs(numActual - numTarget) < 0.001;
      case '!=':
        return Math.abs(numActual - numTarget) >= 0.001;
      case '>':
        return numActual > numTarget;
      case '>=':
        return numActual >= numTarget;
      case '<':
        return numActual < numTarget;
      case '<=':
        return numActual <= numTarget;
      case 'near':
        return Math.abs(numActual - numTarget) <= 0.051;
      default:
        return Math.abs(numActual - numTarget) < 0.001;
    }
  } else {
    const strActual = String(fieldVal).toLowerCase();
    const strTarget = rawTarget.toLowerCase();
    switch (rule.operator) {
      case '=':
        return strActual === strTarget;
      case '!=':
        return strActual !== strTarget;
      case 'contains':
      default:
        return strActual.includes(strTarget);
    }
  }
}

/**
 * Çoklu Kural Motoru değerlendirici (Grup & VE / VEYA bağlaçları ile)
 * Aynı grup (group) içindeki kurallar kendi içlerinde VE/VEYA ile hesaplanır,
 * farklı gruplar ise birbirine VE (AND) paranteziyle bağlanır.
 * Örneğin: Grup 1: (3-3 <= 29) VE Grup 2: (5-1 <= 40 VEYA 4-2 <= 40 VEYA 2-4 <= 40 VEYA 1-5 <= 40)
 */
function evaluateAllRules(match, rules) {
  const activeRules = rules.filter((r) => String(r.value || '').trim() !== '');
  if (activeRules.length === 0) return true;

  // Kurallarda grup (group) tanımlıysa gruplara ayırıp her grubu parantez gibi değerlendir, grupları VE ile birleştir
  const hasExplicitGroups = activeRules.some((r) => r.group !== undefined && r.group !== null);
  if (hasExplicitGroups) {
    const groupsMap = new Map();
    for (const r of activeRules) {
      const gKey = r.group || 1;
      if (!groupsMap.has(gKey)) groupsMap.set(gKey, []);
      groupsMap.get(gKey).push(r);
    }

    for (const [, groupRules] of groupsMap.entries()) {
      let groupResult = evaluateSingleRule(match, groupRules[0]);
      for (let i = 1; i < groupRules.length; i++) {
        const rule = groupRules[i];
        const currentEval = evaluateSingleRule(match, rule);
        if (rule.logic === 'OR') {
          groupResult = groupResult || currentEval;
        } else {
          groupResult = groupResult && currentEval;
        }
      }
      if (!groupResult) return false;
    }
    return true;
  }

  let result = evaluateSingleRule(match, activeRules[0]);
  for (let i = 1; i < activeRules.length; i++) {
    const rule = activeRules[i];
    const currentEval = evaluateSingleRule(match, rule);
    if (rule.logic === 'OR') {
      result = result || currentEval;
    } else {
      result = result && currentEval;
    }
  }
  return result;
}

/**
 * Bir kuralın okunabilir kısa özetini üretir (Örn: "MS 1 < 1.70")
 */
function formatRuleBadge(rule) {
  const fieldObj = RULE_FIELDS.find((f) => f.key === rule.field);
  const label = fieldObj ? fieldObj.label.replace(/^.*-\s*/, '') : rule.field;
  const op = rule.operator === 'near' ? '±0.05' : rule.operator;
  return `${label} ${op} ${rule.value}`;
}

export default function App() {
  const [matches, setMatches] = useState([]);
  const [oldestArchiveDate, setOldestArchiveDate] = useState('04.11.2026');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Görünüm ve Arama Filtreleri
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | UPCOMING | FINISHED
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedLeague, setSelectedLeague] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState('ALL');

  // Varsayılan olarak yatay kaydırma gerektirmeyen "Ana Bülten" görünümü seçili
  const [activePresetId, setActivePresetId] = useState('essential');
  const [visibleGroupIds, setVisibleGroupIds] = useState(['ms', 'cs', 'iy', 'au', 'kg']);

  // Sayfalama
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Excel Tipi Dinamik Sütun Filtreleri
  const [columnFilters, setColumnFilters] = useState({});

  // Özel Kural Motoru & Kayıtlı Filtreler (Saved Filters)
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [rules, setRules] = useState([]);
  const [savedFilters, setSavedFilters] = useState([]);
  const [activeSavedFilterId, setActiveSavedFilterId] = useState(null);
  const [newFilterName, setNewFilterName] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  // Maç Detay Modalı (Tek ekranda 68 oranı ve geçmiş benzer maçları görmek için)
  const [detailMatch, setDetailMatch] = useState(null);

  // Gelişmiş Sanal Kupon (Bet Slip) State'leri
  const [isSlipOpen, setIsSlipOpen] = useState(true);
  const [slipItems, setSlipItems] = useState([]);
  const [selectedSystems, setSelectedSystems] = useState([]);
  const [misli, setMisli] = useState(10);
  const [unitPrice, setUnitPrice] = useState(1);
  const [showColumnsDrawer, setShowColumnsDrawer] = useState(false);

  // Verileri ve Kayıtlı Filtreleri Backend'den Çek
  const fetchMatches = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/matches');
      const data = await res.json();
      if (data.success) {
        setMatches(data.matches || []);
        setLastSyncTime(data.lastSyncTime);
        if (data.stats?.oldestFinishedDate) {
          setOldestArchiveDate(data.stats.oldestFinishedDate);
        }
      }
    } catch (err) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSavedFilters = async () => {
    try {
      const res = await fetch('/api/filters');
      const data = await res.json();
      if (data.success && Array.isArray(data.filters)) {
        setSavedFilters(data.filters);
        localStorage.setItem('orananaliz_saved_filters', JSON.stringify(data.filters));
      }
    } catch (_) {
      const local = localStorage.getItem('orananaliz_saved_filters');
      if (local) {
        try {
          setSavedFilters(JSON.parse(local));
        } catch (_) {}
      }
    }
  };

  const handleLiveSync = async () => {
    try {
      setSyncing(true);
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMatches(data.matches || []);
        setLastSyncTime(data.lastSyncTime);
      }
    } catch (err) {
      console.error('Canlı senkronizasyon hatası:', err);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchMatches();
    fetchSavedFilters();
    const timer = setInterval(fetchMatches, 180000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, selectedLeague, selectedDate, teamSearch, columnFilters, rules, pageSize]);

  // Mevcut tarihler ve ligler
  const availableDates = useMemo(() => {
    const map = new Map();
    for (const m of matches) {
      if (m.date) {
        map.set(m.date, (map.get(m.date) || 0) + 1);
      }
    }
    return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
  }, [matches]);

  const leagues = useMemo(() => {
    const set = new Set(matches.map((m) => m.league).filter(Boolean));
    return ['ALL', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'))];
  }, [matches]);

  const activeMarketGroups = useMemo(() => {
    return MARKET_GROUPS.filter((g) => visibleGroupIds.includes(g.id));
  }, [visibleGroupIds]);

  // Görünüm modu seçimi
  const selectViewPreset = (preset) => {
    setActivePresetId(preset.id);
    setVisibleGroupIds(preset.groups);
  };

  const toggleMarketGroup = (groupId) => {
    setActivePresetId('custom');
    setVisibleGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.length > 1
          ? prev.filter((id) => id !== groupId)
          : prev
        : [...prev, groupId]
    );
  };

  // Tüm filtreleri uygula ve başlamamış güncel bülten maçlarını her zaman en üstte sırala
  const filteredMatches = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    const list = matches.filter((m) => {
      if (statusFilter === 'UPCOMING' && m.status === 'FINISHED') return false;
      if (statusFilter === 'FINISHED' && m.status !== 'FINISHED') return false;

      if (selectedLeague !== 'ALL' && m.league !== selectedLeague) return false;
      if (selectedDate !== 'ALL' && m.date !== selectedDate) return false;

      if (teamSearch.trim() !== '') {
        const q = teamSearch.trim().toLowerCase();
        const inHome = m.homeTeam.toLowerCase().includes(q);
        const inAway = m.awayTeam.toLowerCase().includes(q);
        const inCode = String(m.code).toLowerCase().includes(q);
        const inLeague = String(m.league || '').toLowerCase().includes(q);
        const inDate = String(m.date || '').toLowerCase().includes(q);
        const inTime = String(m.time || '').toLowerCase().includes(q);
        if (!inHome && !inAway && !inCode && !inLeague && !inDate && !inTime) return false;
      }

      for (const [colKey, filterVal] of Object.entries(columnFilters)) {
        if (!filterVal || !filterVal.trim()) continue;
        if (colKey.startsWith('odds.')) {
          const oddName = colKey.replace('odds.', '');
          if (!matchesExcelColumnFilter(m.odds?.[oddName], filterVal, true)) {
            return false;
          }
        } else {
          if (!matchesExcelColumnFilter(m[colKey], filterVal, false)) {
            return false;
          }
        }
      }

      if (!evaluateAllRules(m, rules)) {
        return false;
      }

      return true;
    });

    const getBucket = (m) => {
      if (m.status === 'FINISHED') return 2;
      const isStartedOrLive = m.status === 'LIVE' || (m.timestamp && m.timestamp <= nowSec);
      return isStartedOrLive ? 1 : 0;
    };

    return list.sort((a, b) => {
      const bA = getBucket(a);
      const bB = getBucket(b);
      if (bA !== bB) return bA - bB;
      if (bA === 2) return (b.timestamp || 0) - (a.timestamp || 0);
      return (a.timestamp || 0) - (b.timestamp || 0);
    });
  }, [matches, statusFilter, selectedLeague, selectedDate, teamSearch, columnFilters, rules]);

  const totalPages = Math.max(1, Math.ceil(filteredMatches.length / pageSize));
  const paginatedMatches = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredMatches.slice(start, start + pageSize);
  }, [filteredMatches, page, pageSize]);

  // Geçmiş Veri Eşleşmesi İstatistikleri
  const historicalAnalytics = useMemo(() => {
    const finished = filteredMatches.filter((m) => m.status === 'FINISHED' && m.outcome);
    const total = finished.length;
    if (total === 0) {
      return {
        total: 0,
        ms1Pct: 0,
        msXPct: 0,
        ms2Pct: 0,
        over25Pct: 0,
        under25Pct: 0,
        kgVarPct: 0,
        kgYokPct: 0,
        topScores: [],
        topIyms: []
      };
    }

    let ms1 = 0;
    let msX = 0;
    let ms2 = 0;
    let over25 = 0;
    let kgVar = 0;
    const scoreCounts = {};
    const iymsCounts = {};

    for (const m of finished) {
      const o = m.outcome;
      if (o.msResult === '1') ms1++;
      else if (o.msResult === 'X') msX++;
      else if (o.msResult === '2') ms2++;

      if (o.over25) over25++;
      if (o.kgVar) kgVar++;

      if (m.ftScore && m.ftScore !== '-') {
        scoreCounts[m.ftScore] = (scoreCounts[m.ftScore] || 0) + 1;
      }
      if (o.iymsResult) {
        iymsCounts[o.iymsResult] = (iymsCounts[o.iymsResult] || 0) + 1;
      }
    }

    const topScores = Object.entries(scoreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([score, count]) => ({
        score,
        count,
        pct: Math.round((count / total) * 100)
      }));

    const topIyms = Object.entries(iymsCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([iyms, count]) => ({
        iyms,
        count,
        pct: Math.round((count / total) * 100)
      }));

    return {
      total,
      ms1Count: ms1,
      msXCount: msX,
      ms2Count: ms2,
      ms1Pct: Math.round((ms1 / total) * 100),
      msXPct: Math.round((msX / total) * 100),
      ms2Pct: Math.round((ms2 / total) * 100),
      over25Pct: Math.round((over25 / total) * 100),
      under25Pct: Math.round(((total - over25) / total) * 100),
      kgVarPct: Math.round((kgVar / total) * 100),
      kgYokPct: Math.round(((total - kgVar) / total) * 100),
      topScores,
      topIyms
    };
  }, [filteredMatches]);

  // Excel sütun filtresi güncelleme
  const updateColumnFilter = (key, value) => {
    setActiveSavedFilterId(null);
    setColumnFilters((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  // Tüm filtreleri sıfırla
  const clearAllFilters = () => {
    setColumnFilters({});
    setRules([]);
    setTeamSearch('');
    setSelectedLeague('ALL');
    setSelectedDate('ALL');
    setStatusFilter('ALL');
    setActiveSavedFilterId(null);
  };

  // Bir maçın oranlarını tek tıkla analiz filtresine aktar
  const analyzeMatchOddsPattern = (match) => {
    setStatusFilter('ALL');
    setActiveSavedFilterId(null);
    const nextFilters = {};
    if (match.odds?.ms1 && match.odds.ms1 !== '-') {
      nextFilters['odds.ms1'] = match.odds.ms1;
    }
    if (match.odds?.ust25 && match.odds.ust25 !== '-') {
      nextFilters['odds.ust25'] = match.odds.ust25;
    }
    setColumnFilters(nextFilters);
  };

  // Kural Motoru işlemleri
  const addRule = () => {
    setShowFilterBuilder(true);
    setActiveSavedFilterId(null);
    setRules((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        group: 1,
        logic: 'AND',
        field: 'odds.ms1',
        operator: '<',
        value: '1.70'
      }
    ]);
  };

  const updateRule = (id, patch) => {
    setActiveSavedFilterId(null);
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRule = (id) => {
    setActiveSavedFilterId(null);
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  // Kayıtlı Filtre (Saved Filter) Uygulama
  const applySavedFilter = (flt) => {
    if (activeSavedFilterId === flt.id) {
      clearAllFilters();
      return;
    }
    setActiveSavedFilterId(flt.id);
    setStatusFilter(flt.statusFilter || 'ALL');
    setSelectedLeague(flt.selectedLeague || 'ALL');
    setColumnFilters(flt.columnFilters || {});
    const nextRules = Array.isArray(flt.rules)
      ? flt.rules.map((r) => ({ ...r, group: r.group || 1, id: r.id || Date.now() + Math.random() }))
      : [];
    setRules(nextRules);
    setNewFilterName(flt.name);

    // Eğer seçilen filtrede Maç Skoru (odds.skor...) veya İY Skoru (odds.iyskor...) varsa ilgili sütun grubunu otomatik görünür yap
    if (nextRules.some((r) => String(r.field).startsWith('odds.skor'))) {
      setVisibleGroupIds((prev) => (prev.includes('skor') ? prev : [...prev, 'skor']));
      setActivePresetId('custom');
    }
    if (nextRules.some((r) => String(r.field).startsWith('odds.iyskor'))) {
      setVisibleGroupIds((prev) => (prev.includes('iyskor') ? prev : [...prev, 'iyskor']));
      setActivePresetId('custom');
    }
  };

  // Mevcut Filtreyi (Kurallar + Excel Sütun Filtreleri) Kaydetme
  const handleSaveCurrentFilter = async () => {
    const cleanColFilters = {};
    for (const [k, v] of Object.entries(columnFilters)) {
      if (v && v.trim() !== '') cleanColFilters[k] = v.trim();
    }
    const cleanRules = rules.filter((r) => String(r.value || '').trim() !== '');

    if (Object.keys(cleanColFilters).length === 0 && cleanRules.length === 0) {
      setSaveMessage('Lütfen kaydetmeden önce en az 1 kural veya sütun filtresi girin.');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    const defaultGeneratedName =
      newFilterName.trim() ||
      [
        ...cleanRules.map(formatRuleBadge),
        ...Object.entries(cleanColFilters).map(([k, v]) => `${k.replace('odds.', '').toUpperCase()}: ${v}`)
      ].join(' & ');

    const payload = {
      name: defaultGeneratedName,
      statusFilter,
      selectedLeague,
      columnFilters: cleanColFilters,
      rules: cleanRules
    };

    try {
      const res = await fetch('/api/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setSavedFilters(data.filters);
        setActiveSavedFilterId(data.filter.id);
        localStorage.setItem('orananaliz_saved_filters', JSON.stringify(data.filters));
        setSaveMessage(`"${data.filter.name}" başarıyla kaydedildi!`);
        setNewFilterName('');
        setTimeout(() => setSaveMessage(''), 3000);
      }
    } catch (_) {
      const fallbackFilter = {
        ...payload,
        id: `local-${Date.now()}`,
        createdAt: new Date().toLocaleDateString('tr-TR')
      };
      const next = [fallbackFilter, ...savedFilters];
      setSavedFilters(next);
      setActiveSavedFilterId(fallbackFilter.id);
      localStorage.setItem('orananaliz_saved_filters', JSON.stringify(next));
      setSaveMessage(`"${fallbackFilter.name}" kaydedildi!`);
      setNewFilterName('');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  // Kayıtlı Filtreyi Silme
  const handleDeleteSavedFilter = async (e, id) => {
    e.stopPropagation();
    if (activeSavedFilterId === id) {
      setActiveSavedFilterId(null);
    }
    try {
      const res = await fetch(`/api/filters/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSavedFilters(data.filters);
        localStorage.setItem('orananaliz_saved_filters', JSON.stringify(data.filters));
      }
    } catch (_) {
      const next = savedFilters.filter((f) => f.id !== id);
      setSavedFilters(next);
      localStorage.setItem('orananaliz_saved_filters', JSON.stringify(next));
    }
  };

  // Sanal Kupon işlemleri
  const toggleBetSelection = (match, col) => {
    const oddValue = match.odds?.[col.key];
    if (!oddValue || oddValue === '-') return;

    setIsSlipOpen(true);
    setSlipItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.matchId === match.id);
      if (existingIndex > -1) {
        const existing = prev[existingIndex];
        if (existing.marketKey === col.key) {
          return prev.filter((item) => item.matchId !== match.id);
        }
        const updated = [...prev];
        updated[existingIndex] = {
          ...existing,
          marketKey: col.key,
          marketLabel: col.marketName,
          shortLabel: col.label,
          odd: parseFloat(oddValue)
        };
        return updated;
      }

      return [
        ...prev,
        {
          matchId: match.id,
          code: match.code,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          date: match.date,
          time: match.time,
          status: match.status,
          ftScore: match.ftScore,
          marketKey: col.key,
          marketLabel: col.marketName,
          shortLabel: col.label,
          odd: parseFloat(oddValue),
          isBanko: false
        }
      ];
    });
  };

  const toggleBanko = (matchId) => {
    setSlipItems((prev) =>
      prev.map((item) =>
        item.matchId === matchId ? { ...item, isBanko: !item.isBanko } : item
      )
    );
  };

  const removeSlipItem = (matchId) => {
    setSlipItems((prev) => prev.filter((item) => item.matchId !== matchId));
  };

  const toggleSystemCheckbox = (r) => {
    setSelectedSystems((prev) =>
      prev.includes(r) ? prev.filter((item) => item !== r) : [...prev, r].sort((a, b) => a - b)
    );
  };

  const slipSummary = useMemo(() => {
    return calculateBetSlipSummary(slipItems, selectedSystems, misli, unitPrice);
  }, [slipItems, selectedSystems, misli, unitPrice]);

  const activeColFilterEntries = Object.entries(columnFilters).filter(
    ([, v]) => v && v.trim() !== ''
  );
  const activeRulesList = rules.filter((r) => String(r.value || '').trim() !== '');
  const activeFilterCount =
    activeColFilterEntries.length +
    activeRulesList.length +
    (teamSearch.trim() ? 1 : 0) +
    (selectedLeague !== 'ALL' ? 1 : 0) +
    (selectedDate !== 'ALL' ? 1 : 0);

  const upcomingTotal = useMemo(
    () => matches.filter((m) => m.status !== 'FINISHED').length,
    [matches]
  );
  const finishedTotal = useMemo(
    () => matches.filter((m) => m.status === 'FINISHED').length,
    [matches]
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* ÜST HEADER */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-900/40">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight text-white">
                  ORAN<span className="text-emerald-400">ANALİZ</span> PRO
                </h1>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  Kalıcı Arşiv ({oldestArchiveDate} — Bugün: {finishedTotal} Biten + {upcomingTotal} Bülten)
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lastSyncTime && (
              <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/70 px-2.5 py-1.5 rounded-lg border border-slate-700/60">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  Son Senkronizasyon:{' '}
                  <strong className="text-slate-200">
                    {new Date(lastSyncTime).toLocaleTimeString('tr-TR')}
                  </strong>
                </span>
              </div>
            )}

            <button
              onClick={handleLiveSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Güncelleniyor...' : 'Canlı Bülteni Güncelle'}
            </button>

            <button
              onClick={() => setIsSlipOpen(!isSlipOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                slipItems.length > 0
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
              }`}
              title="Sanal Kupon Panelini Aç / Kapat"
            >
              {isSlipOpen ? (
                <PanelRightClose className="w-4 h-4" />
              ) : (
                <PanelRightOpen className="w-4 h-4" />
              )}
              <span>Kupon ({slipItems.length})</span>
            </button>
          </div>
        </div>
      </header>

      {/* ANA İÇERİK */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden">
        {/* SOL ANA BÖLÜM */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden p-3 gap-2.5">
          {/* 1. KAYITLI FİLTRELERİM & HIZLI STRATEJİ ÇUBUĞU */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1 mr-1">
                <Bookmark className="w-3.5 h-3.5" />
                Kayıtlı Filtrelerim:
              </span>

              {savedFilters.map((flt) => {
                const isActive = activeSavedFilterId === flt.id;
                return (
                  <div
                    key={flt.id}
                    onClick={() => applySavedFilter(flt)}
                    className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm font-bold'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-amber-500/50 hover:text-white'
                    }`}
                  >
                    <BookmarkCheck
                      className={`w-3.5 h-3.5 ${isActive ? 'text-slate-950' : 'text-amber-400'}`}
                    />
                    <span>{flt.name}</span>
                    <button
                      onClick={(e) => handleDeleteSavedFilter(e, flt.id)}
                      title="Bu kayıtlı filtreyi sil"
                      className={`ml-0.5 p-0.5 rounded hover:bg-rose-500 hover:text-white transition ${
                        isActive ? 'text-slate-800' : 'text-slate-500 opacity-60 group-hover:opacity-100'
                      }`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowFilterBuilder(!showFilterBuilder);
                  if (rules.length === 0 && !showFilterBuilder) {
                    setRules([
                      { id: Date.now(), logic: 'AND', field: 'odds.ms1', operator: '<', value: '1.70' },
                      { id: Date.now() + 1, logic: 'AND', field: 'odds.kgVar', operator: '>', value: '1.50' }
                    ]);
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                  showFilterBuilder
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/25'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {showFilterBuilder ? 'Filtre Oluşturucuyu Gizle' : '+ Çoklu Filtre Oluştur / Kaydet'}
              </button>
            </div>
          </div>

          {/* 2. ÇOKLU FİLTRE OLUŞTURMA VE KAYDETME PANELİ */}
          {showFilterBuilder && (
            <div className="bg-slate-900 border-2 border-indigo-500/40 rounded-xl p-3 space-y-2.5 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-indigo-400" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                    Çoklu Oran Kural Motoru & Filtre Kaydetme
                  </h2>
                  <span className="text-[11px] text-slate-400">
                    (İstediğiniz kadar koşulu VE / VEYA ile birleştirip kalıcı olarak kaydedebilirsiniz)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={addRule}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Koşul Ekle
                  </button>
                  <button
                    onClick={() => setShowFilterBuilder(false)}
                    className="p-1 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Kural Satırları */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {rules.map((rule, idx) => (
                  <div
                    key={rule.id}
                    className="flex items-center gap-1.5 bg-slate-950 p-2 rounded-lg border border-slate-800"
                  >
                    <select
                      value={rule.group || 1}
                      onChange={(e) => updateRule(rule.id, { group: Number(e.target.value) })}
                      title="Parantez Grubu: Farklı gruplar birbirine VE ile bağlanır. Örn: Grup 1 (Zorunlu) VE Grup 2 (En az biri VEYA)"
                      className="bg-amber-950/60 text-amber-300 border border-amber-700/60 rounded px-1.5 py-1 text-[11px] font-bold outline-none shrink-0"
                    >
                      <option value={1}>Grup 1</option>
                      <option value={2}>Grup 2</option>
                      <option value={3}>Grup 3</option>
                    </select>

                    {idx === 0 || (idx > 0 && (rules[idx - 1]?.group || 1) !== (rule.group || 1)) ? (
                      <span className="text-[11px] font-bold px-2 py-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                        BAŞLANGIÇ
                      </span>
                    ) : (
                      <select
                        value={rule.logic}
                        onChange={(e) => updateRule(rule.id, { logic: e.target.value })}
                        className="bg-indigo-950 text-indigo-200 border border-indigo-700 rounded px-2 py-1 text-xs font-bold outline-none shrink-0"
                      >
                        <option value="AND">VE</option>
                        <option value="OR">VEYA</option>
                      </select>
                    )}

                    <select
                      value={rule.field}
                      onChange={(e) => updateRule(rule.id, { field: e.target.value })}
                      className="bg-slate-900 text-slate-100 border border-slate-700 rounded px-2 py-1 text-xs outline-none flex-1 min-w-[120px]"
                    >
                      {RULE_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>

                    <select
                      value={rule.operator}
                      onChange={(e) => updateRule(rule.id, { operator: e.target.value })}
                      className="bg-slate-900 text-emerald-300 border border-slate-700 rounded px-2 py-1 text-xs font-bold outline-none"
                    >
                      <option value="=">= (Eşit)</option>
                      <option value="<">&lt; (Küçük)</option>
                      <option value="<=">&lt;= (Küçük Eşit)</option>
                      <option value=">">&gt; (Büyük)</option>
                      <option value=">=">&gt;= (Büyük Eşit)</option>
                      <option value="near">±0.05 (Yakın)</option>
                      <option value="!=">!= (Farklı)</option>
                    </select>

                    <input
                      type="text"
                      value={rule.value}
                      onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                      placeholder="1.70"
                      className="bg-slate-900 text-white border border-slate-700 focus:border-indigo-500 rounded px-2.5 py-1 text-xs w-20 text-center font-mono font-bold outline-none"
                    />

                    <button
                      onClick={() => removeRule(rule.id)}
                      className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded cursor-pointer"
                      title="Koşulu Kaldır"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Filtre İsimlendirme ve Kaydetme Çubuğu */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={newFilterName}
                    onChange={(e) => setNewFilterName(e.target.value)}
                    placeholder="Filtre adı (Örn: MS1 < 1.70 ve KG Var > 1.50 Stratejim)..."
                    className="bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-lg px-3 py-1.5 text-xs text-white flex-1 min-w-[240px] outline-none"
                  />
                  <button
                    onClick={handleSaveCurrentFilter}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow transition cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Bu Filtreyi Kaydet
                  </button>
                  {saveMessage && (
                    <span className="text-xs font-semibold text-emerald-400">{saveMessage}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 3. ARAMA, DURUM, TARİH, LİG VE GÖRÜNÜM MODU ÇUBUĞU */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Durum Sekmeleri */}
              <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                    statusFilter === 'ALL'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Tümü ({matches.length})
                </button>
                <button
                  onClick={() => setStatusFilter('UPCOMING')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                    statusFilter === 'UPCOMING'
                      ? 'bg-sky-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Bülten ({upcomingTotal})
                </button>
                <button
                  onClick={() => setStatusFilter('FINISHED')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                    statusFilter === 'FINISHED'
                      ? 'bg-amber-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Geçmiş Arşiv ({finishedTotal})
                </button>
              </div>

              {/* Arama, Tarih ve Lig Seçiciler */}
              <div className="flex flex-wrap items-center gap-2 flex-1 max-w-3xl">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={teamSearch}
                    onChange={(e) => setTeamSearch(e.target.value)}
                    placeholder="Takım, lig, tarih (04.11.2026) veya kod yazın..."
                    className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 rounded-lg pl-8 pr-7 py-1 text-xs text-slate-100 placeholder:text-slate-500 outline-none"
                  />
                  {teamSearch && (
                    <button
                      onClick={() => setTeamSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Tarih Seçici */}
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-emerald-500"
                >
                  <option value="ALL">Tüm Tarihler ({availableDates.length} Gün)</option>
                  {availableDates.map((d) => (
                    <option key={d.date} value={d.date}>
                      📅 {d.date} ({d.count} Maç)
                    </option>
                  ))}
                </select>

                {/* Lig Seçici */}
                <select
                  value={selectedLeague}
                  onChange={(e) => setSelectedLeague(e.target.value)}
                  className="bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-emerald-500 max-w-[190px]"
                >
                  <option value="ALL">Tüm Ligler ({leagues.length - 1})</option>
                  {leagues
                    .filter((l) => l !== 'ALL')
                    .map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                </select>

                {activeFilterCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Temizle ({activeFilterCount})
                  </button>
                )}
              </div>
            </div>

            {/* Görünüm Modları & Market Grupları */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/80">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-400 mr-1">Görünüm Modu:</span>
                {VIEW_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => selectViewPreset(preset)}
                    title={preset.desc}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      activePresetId === preset.id
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Tekil Market Grubu Butonları */}
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-slate-500 mr-1">Sütunlar:</span>
                {MARKET_GROUPS.map((g) => {
                  const active = visibleGroupIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      onClick={() => toggleMarketGroup(g.id)}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition cursor-pointer ${
                        active
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                      }`}
                    >
                      {g.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 4. GEÇMİŞ MAÇ SONUÇ ANALİZİ & AKTİF FİLTRE ÖZETİ */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/30 border border-slate-800 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Target className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-200">
                  Eşleşen: <strong className="text-white">{filteredMatches.length}</strong> Maç
                </span>
                <span className="text-xs text-slate-400">
                  (<strong className="text-amber-400">{historicalAnalytics.total}</strong> Geçmiş +{' '}
                  <strong className="text-sky-400">
                    {filteredMatches.length - historicalAnalytics.total}
                  </strong>{' '}
                  Bülten)
                </span>
              </div>

              {/* Aktif Kural / Sütun Filtresi Etiketleri */}
              {(activeRulesList.length > 0 || activeColFilterEntries.length > 0) && (
                <div className="flex flex-wrap items-center gap-1 ml-2">
                  {activeRulesList.map((r, i) => (
                    <span
                      key={r.id}
                      className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/40 text-[11px] font-bold"
                    >
                      {i > 0 ? `${r.logic === 'OR' ? 'VEYA' : 'VE'} ` : ''}
                      {formatRuleBadge(r)}
                    </span>
                  ))}
                  {activeColFilterEntries.map(([k, v]) => (
                    <span
                      key={k}
                      className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 text-[11px] font-bold"
                    >
                      {k.replace('odds.', '').toUpperCase()}: {v}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {historicalAnalytics.total > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                  <span className="text-emerald-400 font-bold">MS1 %{historicalAnalytics.ms1Pct}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-amber-300 font-bold">X %{historicalAnalytics.msXPct}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-sky-400 font-bold">MS2 %{historicalAnalytics.ms2Pct}</span>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                  <span className="text-amber-400 font-bold">2.5 Üst %{historicalAnalytics.over25Pct}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-purple-400 font-bold">KG Var %{historicalAnalytics.kgVarPct}</span>
                </div>

                {historicalAnalytics.topScores.length > 0 && (
                  <div className="flex items-center gap-1 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[11px]">Skorlar:</span>
                    {historicalAnalytics.topScores.map((s) => (
                      <button
                        key={s.score}
                        onClick={() => updateColumnFilter('ftScore', s.score)}
                        title={`Tabloyu ${s.score} biten maçlara göre filtrele`}
                        className="px-1.5 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-bold text-[11px] cursor-pointer"
                      >
                        {s.score} ({s.count})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. ERGONOMİK VERİ TABLOSU (SOLDAKİ MAÇ SÜTUNU SABİTLENMİŞ - STICKY) */}
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-[440px]">
            <div className="overflow-auto flex-1">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-20 bg-slate-900 shadow-md">
                  {/* 1. ÜST GRUP BAŞLIK SATIRI */}
                  <tr className="border-b border-slate-800">
                    <th
                      colSpan={4}
                      className="bg-slate-950 text-slate-200 font-bold text-left px-3 py-1.5 border-r-2 border-slate-700 sticky left-0 z-30"
                    >
                      MAÇ BİLGİSİ & SKOR (Sol Sütun Sabit)
                    </th>
                    {activeMarketGroups.map((group) => (
                      <th
                        key={group.id}
                        colSpan={group.columns.length}
                        className={`text-center font-bold px-2 py-1.5 border-r border-slate-800 text-[11px] uppercase tracking-wider ${group.headerClass}`}
                      >
                        {group.label}
                      </th>
                    ))}
                  </tr>

                  {/* 2. SÜTUN İSİMLERİ SATIRI */}
                  <tr className="bg-slate-900 text-slate-300 border-b border-slate-800">
                    <th className="sticky left-0 z-30 bg-slate-900 px-2.5 py-1.5 text-left font-semibold border-r border-slate-800 min-w-[240px] max-w-[260px]">
                      Takımlar / Lig / Tarih
                    </th>
                    <th className="px-1.5 py-1.5 text-center font-semibold border-r border-slate-800 min-w-[52px] bg-slate-950/80 text-amber-300">
                      İY
                    </th>
                    <th className="px-1.5 py-1.5 text-center font-semibold border-r border-slate-800 min-w-[58px] bg-slate-950/80 text-emerald-300">
                      MS
                    </th>
                    <th className="px-1.5 py-1.5 text-center font-semibold border-r-2 border-slate-700 min-w-[74px] bg-slate-950/80">
                      İşlem
                    </th>

                    {activeMarketGroups.flatMap((group) =>
                      group.columns.map((col) => (
                        <th
                          key={col.key}
                          className="px-1.5 py-1.5 text-center font-semibold border-r border-slate-800/80 min-w-[56px] whitespace-nowrap"
                        >
                          {col.label}
                        </th>
                      ))
                    )}
                  </tr>

                  {/* 3. EXCEL TİPİ SÜTUN FİLTRE KUTULARI SATIRI */}
                  <tr className="bg-slate-950 border-b border-slate-700/80">
                    <th className="sticky left-0 z-30 bg-slate-950 p-1.5 border-r border-slate-800">
                      <div className="grid grid-cols-2 gap-1">
                        <input
                          type="text"
                          value={columnFilters.homeTeam || ''}
                          onChange={(e) => updateColumnFilter('homeTeam', e.target.value)}
                          placeholder="Ev sahibi..."
                          className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded px-1.5 py-1 text-[11px] text-white outline-none"
                        />
                        <input
                          type="text"
                          value={columnFilters.awayTeam || ''}
                          onChange={(e) => updateColumnFilter('awayTeam', e.target.value)}
                          placeholder="Deplasman..."
                          className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded px-1.5 py-1 text-[11px] text-white outline-none"
                        />
                        <input
                          type="text"
                          value={columnFilters.league || ''}
                          onChange={(e) => updateColumnFilter('league', e.target.value)}
                          placeholder="Lig yazın..."
                          className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded px-1.5 py-1 text-[11px] text-sky-200 outline-none"
                        />
                        <input
                          type="text"
                          value={columnFilters.date || ''}
                          onChange={(e) => updateColumnFilter('date', e.target.value)}
                          placeholder="Tarih (04.11)..."
                          className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded px-1.5 py-1 text-[11px] text-amber-200 outline-none"
                        />
                      </div>
                    </th>
                    <th className="p-1 border-r border-slate-800">
                      <input
                        type="text"
                        value={columnFilters.htScore || ''}
                        onChange={(e) => updateColumnFilter('htScore', e.target.value)}
                        placeholder="1-0"
                        className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded px-1 py-1 text-[11px] text-center text-amber-200 outline-none"
                      />
                    </th>
                    <th className="p-1 border-r border-slate-800">
                      <input
                        type="text"
                        value={columnFilters.ftScore || ''}
                        onChange={(e) => updateColumnFilter('ftScore', e.target.value)}
                        placeholder="2-1"
                        className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded px-1 py-1 text-[11px] text-center text-emerald-200 outline-none"
                      />
                    </th>
                    <th className="p-1 border-r-2 border-slate-700 text-center text-[10px] text-slate-400">
                      Analiz / Detay
                    </th>

                    {activeMarketGroups.flatMap((group) =>
                      group.columns.map((col) => {
                        const filterKey = `odds.${col.key}`;
                        const hasVal = Boolean(columnFilters[filterKey]);
                        return (
                          <th key={col.key} className="p-1 border-r border-slate-800/80">
                            <input
                              type="text"
                              value={columnFilters[filterKey] || ''}
                              onChange={(e) => updateColumnFilter(filterKey, e.target.value)}
                              placeholder="Oran"
                              title={`${col.label} Filtresi: 1.50, <1.70, >1.50 veya 1.40-1.70 yazabilirsiniz`}
                              className={`w-full rounded px-1 py-1 text-[11px] text-center outline-none transition ${
                                hasVal
                                  ? 'bg-emerald-950 border-2 border-emerald-400 text-emerald-200 font-bold'
                                  : 'bg-slate-900 border border-slate-700/80 text-white focus:border-emerald-500'
                              }`}
                            />
                          </th>
                        );
                      })
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800/70">
                  {loading ? (
                    <tr>
                      <td colSpan={80} className="py-12 text-center text-slate-400">
                        İddaa bülteni ve kalıcı arşiv veritabanı yükleniyor...
                      </td>
                    </tr>
                  ) : paginatedMatches.length === 0 ? (
                    <tr>
                      <td colSpan={80} className="py-12 text-center text-slate-400">
                        Seçilen filtrelere uygun maç bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    paginatedMatches.map((match) => {
                      const isFinished = match.status === 'FINISHED';
                      const selectedInSlip = slipItems.find((i) => i.matchId === match.id);

                      return (
                        <tr
                          key={match.id}
                          className={`group transition hover:bg-slate-800/70 ${
                            isFinished ? 'bg-slate-900/50' : 'bg-slate-950/70'
                          }`}
                        >
                          {/* SABİTLENMİŞ (STICKY) MAÇ BİLGİ HÜCRESİ */}
                          <td className="sticky left-0 z-10 bg-slate-900 group-hover:bg-slate-800 px-2.5 py-1.5 border-r border-slate-800 min-w-[240px] max-w-[260px]">
                            <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400">
                              <span className="truncate font-medium text-slate-300" title={match.league}>
                                {match.league}
                              </span>
                              <span className="font-mono shrink-0 text-slate-400">
                                {match.date} {match.time}
                              </span>
                            </div>
                            <div
                              onClick={() => setDetailMatch(match)}
                              className="font-bold text-xs text-white hover:text-emerald-400 truncate cursor-pointer mt-0.5"
                              title={`${match.homeTeam} - ${match.awayTeam} (Tüm 68 oranı görmek için tıklayın)`}
                            >
                              {match.homeTeam} <span className="text-slate-500 font-normal">vs</span>{' '}
                              {match.awayTeam}
                            </div>
                          </td>

                          {/* İY Skoru */}
                          <td className="px-1.5 py-1.5 text-center font-mono font-semibold border-r border-slate-800/80 bg-slate-950/40">
                            {isFinished ? (
                              <span className="text-amber-300">{match.htScore}</span>
                            ) : match.status === 'LIVE' || (match.timestamp && match.timestamp <= Math.floor(Date.now() / 1000)) ? (
                              <span className="text-rose-400 text-[10px] font-sans font-bold animate-pulse">
                                Canlı
                              </span>
                            ) : (
                              <span className="text-sky-400 text-[10px] font-sans font-semibold">
                                Bülten
                              </span>
                            )}
                          </td>

                          {/* MS Skoru */}
                          <td className="px-1.5 py-1.5 text-center font-mono font-bold border-r border-slate-800/80 bg-slate-950/40">
                            {isFinished ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                {match.ftScore}
                              </span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>

                          {/* Hızlı Analiz & 68 Oran Detay Butonları */}
                          <td className="px-1.5 py-1.5 text-center border-r-2 border-slate-700 bg-slate-950/40">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => analyzeMatchOddsPattern(match)}
                                title="Bu maçın MS1 ve 2.5 Üst oranlarıyla açılmış geçmiş maçları filtrele"
                                className="px-1.5 py-1 rounded bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white text-[10px] font-bold transition cursor-pointer"
                              >
                                Eşleş
                              </button>
                              <button
                                onClick={() => setDetailMatch(match)}
                                title="Maçın tüm 68 bahis oranını tek pencerede aç"
                                className="p-1 rounded bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white transition cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>

                          {/* Bahis Oran Sütunları */}
                          {activeMarketGroups.flatMap((group) =>
                            group.columns.map((col) => {
                              const oddVal = match.odds?.[col.key] || '-';
                              const isSelectedInCoupon = selectedInSlip?.marketKey === col.key;
                              const isWinningOutcome =
                                isFinished && col.isWin && col.isWin(match.outcome, match);
                              const isFilteredOdd =
                                columnFilters[`odds.${col.key}`] &&
                                columnFilters[`odds.${col.key}`].trim() !== '';

                              return (
                                <td
                                  key={col.key}
                                  onClick={() => toggleBetSelection(match, col)}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    if (oddVal !== '-') {
                                      updateColumnFilter(`odds.${col.key}`, oddVal);
                                    }
                                  }}
                                  title={`Sol Tık: Kupona Ekle (${col.marketName} @ ${oddVal}) | Sağ Tık: Bu Oranı Filtrele`}
                                  className={`px-1.5 py-1.5 text-center font-mono text-[11px] border-r border-slate-800/60 select-none cursor-pointer transition ${
                                    isSelectedInCoupon
                                      ? 'bg-emerald-500 text-slate-950 font-extrabold ring-2 ring-emerald-300'
                                      : isWinningOutcome
                                      ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                                      : isFilteredOdd
                                      ? 'bg-amber-500/20 text-amber-200 font-bold'
                                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                  }`}
                                >
                                  {oddVal}
                                </td>
                              );
                            })
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Tablo Alt Bilgi ve Sayfalama Çubuğu */}
            <div className="bg-slate-950 px-3 py-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/30 border border-emerald-400 inline-block"></span>
                  Yeşil: Biten maçta kazanan oran
                </span>
                <span>
                  Sütun kutularına doğrudan <code className="text-emerald-300">&lt;1.70</code>,{' '}
                  <code className="text-emerald-300">&gt;1.50</code> veya{' '}
                  <code className="text-emerald-300">1.50</code> yazabilirsiniz.
                </span>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-[11px] text-slate-200 outline-none"
                >
                  <option value={50}>50 Satır</option>
                  <option value={100}>100 Satır</option>
                  <option value={250}>250 Satır</option>
                  <option value={500}>500 Satır</option>
                  <option value={2500}>Tümü</option>
                </select>

                <span>
                  <strong>
                    {filteredMatches.length === 0 ? 0 : (page - 1) * pageSize + 1}-
                    {Math.min(page * pageSize, filteredMatches.length)}
                  </strong>{' '}
                  / {filteredMatches.length}
                </span>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono font-bold text-slate-200">
                  {page}/{totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SAĞ PANEL: DARALTILABİLİR SANAL KUPON (BET SLIP) */}
        {isSlipOpen && (
          <aside className="w-full xl:w-96 bg-slate-900 border-t xl:border-t-0 xl:border-l border-slate-800 flex flex-col shrink-0">
            <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-emerald-400" />
                <div>
                  <h2 className="text-sm font-bold text-white">Sanal İddaa Kuponu</h2>
                  <p className="text-[11px] text-slate-400">
                    Dinamik Sistem & C(n,r) Kombinasyon Hesaplayıcı
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {slipItems.length} Maç
                </span>
                {slipItems.length > 0 && (
                  <button
                    onClick={() => {
                      setSlipItems([]);
                      setSelectedSystems([]);
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 cursor-pointer"
                    title="Kuponu Temizle"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setIsSlipOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                  title="Kupon Panelini Gizle (Tam Ekran Tablo)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[360px] xl:max-h-none">
              {slipItems.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center px-4 border border-dashed border-slate-800 rounded-xl">
                  <Trophy className="w-7 h-7 text-slate-600 mb-2" />
                  <p className="text-xs font-semibold text-slate-300">Kuponunuzda henüz maç yok</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Tablodaki herhangi bir orana tıklayarak kupona ekleyebilirsiniz. Tam ekran tablo için sağ üstten kuponu gizleyebilirsiniz.
                  </p>
                </div>
              ) : (
                slipItems.map((item) => (
                  <div
                    key={item.matchId}
                    className={`p-2.5 rounded-xl border transition ${
                      item.isBanko
                        ? 'bg-amber-950/25 border-amber-500/50'
                        : 'bg-slate-950/90 border-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <span className="font-mono">#{item.code}</span>
                          <span>•</span>
                          <span>
                            {item.date} {item.time}
                          </span>
                          {item.status === 'FINISHED' && (
                            <span className="text-emerald-400 font-bold">
                              (Skor: {item.ftScore})
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-bold text-white truncate mt-0.5">
                          {item.homeTeam} - {item.awayTeam}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => toggleBanko(item.matchId)}
                          title="Banko (B) Maç Olarak İşaretle"
                          className={`w-6 h-6 rounded text-[11px] font-extrabold transition cursor-pointer ${
                            item.isBanko
                              ? 'bg-amber-500 text-slate-950 shadow'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          B
                        </button>
                        <button
                          onClick={() => removeSlipItem(item.matchId)}
                          className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-medium">{item.marketLabel}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono font-bold">
                        {item.odd.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {slipItems.length > 0 && (
              <div className="p-3 bg-slate-950 border-t border-slate-800 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                      Dinamik Sistem ({slipSummary.availableSystems.length} Seçenek)
                    </span>
                    {selectedSystems.length > 0 && (
                      <button
                        onClick={() => setSelectedSystems([])}
                        className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                      >
                        Sistemi Sıfırla
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {slipSummary.availableSystems.map((sys) => {
                      const checked = selectedSystems.includes(sys.r);
                      return (
                        <button
                          key={sys.r}
                          onClick={() => toggleSystemCheckbox(sys.r)}
                          className={`px-2 py-1.5 rounded-lg border text-left transition cursor-pointer ${
                            checked
                              ? 'bg-emerald-600/25 border-emerald-400 text-white'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold">{sys.label}</span>
                            {checked && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                          </div>
                          <div className="text-[10px] text-slate-400">{sys.columns} Kolon</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                      Misli Seçimi
                    </label>
                    <select
                      value={misli}
                      onChange={(e) => setMisli(Math.max(1, Number(e.target.value)))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-bold text-white outline-none focus:border-emerald-500"
                    >
                      {[1, 2, 3, 5, 10, 20, 30, 50, 100, 250, 500].map((m) => (
                        <option key={m} value={m}>
                          {m} Misli
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                      Kolon Bedeli (TL)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Aktif Sistem:</span>
                    <span className="font-semibold text-slate-200">
                      {slipSummary.activeSystems.map((r) => `Sistem ${r}`).join(', ')}
                      {slipSummary.bankoCount > 0 ? ` (+${slipSummary.bankoCount} Banko)` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Toplam Kolon Sayısı:</span>
                    <span className="font-mono font-bold text-white">
                      {slipSummary.totalColumns} Kolon
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800">
                    <span className="font-semibold">Ödenecek Tutar:</span>
                    <span className="font-mono font-bold text-amber-400">
                      {slipSummary.totalCost.toLocaleString('tr-TR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}{' '}
                      TL
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1.5 border-t border-slate-800">
                    <span className="font-bold text-emerald-400">Maksimum Kazanç:</span>
                    <span className="text-base font-mono font-extrabold text-emerald-400">
                      {slipSummary.maxPayout.toLocaleString('tr-TR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}{' '}
                      TL
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setShowColumnsDrawer(!showColumnsDrawer)}
                  className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  {showColumnsDrawer
                    ? 'Üretilen Kombinasyon Kolonlarını Gizle'
                    : `Üretilen ${slipSummary.totalColumns} Kombinasyon Kolonunu İncele`}
                </button>

                {showColumnsDrawer && (
                  <div className="max-h-48 overflow-y-auto bg-slate-900/90 border border-slate-800 rounded-lg p-2 space-y-1.5 text-[11px]">
                    {slipSummary.generatedColumns.map((col) => (
                      <div
                        key={col.id}
                        className="flex items-center justify-between bg-slate-950 px-2 py-1.5 rounded border border-slate-800/80"
                      >
                        <div>
                          <span className="font-bold text-emerald-400 mr-1.5">
                            Kolon #{col.id} (S{col.systemR}):
                          </span>
                          <span className="text-slate-300 font-mono">
                            {col.matches.map((m) => `${m.code}(${m.odd.toFixed(2)})`).join(' x ')}
                          </span>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <div className="font-mono font-bold text-amber-300">
                            Oran: {col.odd.toFixed(2)}
                          </div>
                          <div className="font-mono text-[10px] text-emerald-300">
                            {col.payout.toFixed(2)} TL
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* MAÇ DETAY & TÜM 68 ORAN KARTI MODALI (Yatay kaydırma olmadan tüm oranlar) */}
      {detailMatch && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDetailMatch(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="font-mono text-emerald-400">#{detailMatch.code}</span>
                  <span>•</span>
                  <span>{detailMatch.league}</span>
                  <span>•</span>
                  <span>
                    {detailMatch.date} {detailMatch.time}
                  </span>
                </div>
                <h3 className="text-base font-extrabold text-white mt-0.5">
                  {detailMatch.homeTeam} vs {detailMatch.awayTeam}
                  {detailMatch.status === 'FINISHED' && (
                    <span className="ml-3 px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-mono">
                      İY: {detailMatch.htScore} | MS: {detailMatch.ftScore}
                    </span>
                  )}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    analyzeMatchOddsPattern(detailMatch);
                    setDetailMatch(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                >
                  Bu Maçın Oranlarıyla Geçmiş Eşleşmeleri Bul
                </button>
                <button
                  onClick={() => setDetailMatch(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto space-y-4">
              {MARKET_GROUPS.map((group) => (
                <div
                  key={group.id}
                  className="bg-slate-950/80 border border-slate-800 rounded-xl p-3"
                >
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
                    {group.label}
                  </h4>
                  <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-9 gap-2">
                    {group.columns.map((col) => {
                      const val = detailMatch.odds?.[col.key] || '-';
                      const isSel =
                        slipItems.find((i) => i.matchId === detailMatch.id)?.marketKey === col.key;
                      const isWin =
                        detailMatch.status === 'FINISHED' &&
                        col.isWin &&
                        col.isWin(detailMatch.outcome, detailMatch);

                      return (
                        <button
                          key={col.key}
                          onClick={() => toggleBetSelection(detailMatch, col)}
                          className={`p-2 rounded-lg border text-center transition cursor-pointer ${
                            isSel
                              ? 'bg-emerald-500 text-slate-950 border-emerald-300 font-extrabold'
                              : isWin
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                              : 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-600'
                          }`}
                        >
                          <div className="text-[10px] opacity-75">{col.label}</div>
                          <div className="font-mono text-xs font-bold mt-0.5">{val}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
