/**
 * Yasal İddaa Bültenindeki (iddaa.com) Tüm Bahis Marketleri ve Sütun Tanımları
 * Maç Skoru (st=86) altındaki 29 seçeneğin tamamı, İY Skoru (st=717), Toplam Gol (st=4),
 * MS, ÇŞ, İY, Alt/Üst (0.5, 1.5, 2.5, 3.5), KG ve İY/MS dahildir.
 */

const EXACT_SCORES_LIST = [
  '1-0', '2-0', '2-1', '3-0', '3-1', '3-2', '4-0', '4-1', '4-2', '5-0', '5-1', '6-0',
  '0-0', '1-1', '2-2', '3-3',
  '0-1', '0-2', '1-2', '0-3', '1-3', '2-3', '0-4', '1-4', '2-4', '0-5', '1-5', '0-6'
];

export const MARKET_GROUPS = [
  {
    id: 'ms',
    label: 'Maç Sonucu (MS)',
    shortLabel: 'MS',
    headerClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
    columns: [
      { key: 'ms1', label: 'MS 1', marketName: 'Maç Sonucu: 1', isWin: (o) => o?.msResult === '1' },
      { key: 'msX', label: 'MS X', marketName: 'Maç Sonucu: X', isWin: (o) => o?.msResult === 'X' },
      { key: 'ms2', label: 'MS 2', marketName: 'Maç Sonucu: 2', isWin: (o) => o?.msResult === '2' }
    ]
  },
  {
    id: 'cs',
    label: 'Çifte Şans (ÇŞ)',
    shortLabel: 'ÇŞ',
    headerClass: 'bg-teal-950/80 text-teal-300 border-teal-800/60',
    columns: [
      { key: 'cs1X', label: 'ÇŞ 1-X', marketName: 'Çifte Şans: 1-X', isWin: (o) => o?.msResult === '1' || o?.msResult === 'X' },
      { key: 'cs12', label: 'ÇŞ 1-2', marketName: 'Çifte Şans: 1-2', isWin: (o) => o?.msResult === '1' || o?.msResult === '2' },
      { key: 'csX2', label: 'ÇŞ X-2', marketName: 'Çifte Şans: X-2', isWin: (o) => o?.msResult === 'X' || o?.msResult === '2' }
    ]
  },
  {
    id: 'iy',
    label: 'İlk Yarı Sonucu (İY)',
    shortLabel: 'İY',
    headerClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60',
    columns: [
      { key: 'iy1', label: 'İY 1', marketName: 'İlk Yarı: 1', isWin: (o) => o?.iyResult === '1' },
      { key: 'iyX', label: 'İY X', marketName: 'İlk Yarı: X', isWin: (o) => o?.iyResult === 'X' },
      { key: 'iy2', label: 'İY 2', marketName: 'İlk Yarı: 2', isWin: (o) => o?.iyResult === '2' }
    ]
  },
  {
    id: 'au',
    label: 'Alt / Üst (1.5 - 2.5 - 3.5)',
    shortLabel: 'Alt/Üst',
    headerClass: 'bg-amber-950/80 text-amber-300 border-amber-800/60',
    columns: [
      { key: 'alt15', label: '1.5 Alt', marketName: '1.5 Alt', isWin: (o) => o && !o.over15 },
      { key: 'ust15', label: '1.5 Üst', marketName: '1.5 Üst', isWin: (o) => o?.over15 === true },
      { key: 'alt25', label: '2.5 Alt', marketName: '2.5 Alt', isWin: (o) => o && !o.over25 },
      { key: 'ust25', label: '2.5 Üst', marketName: '2.5 Üst', isWin: (o) => o?.over25 === true },
      { key: 'alt35', label: '3.5 Alt', marketName: '3.5 Alt', isWin: (o) => o && !o.over35 },
      { key: 'ust35', label: '3.5 Üst', marketName: '3.5 Üst', isWin: (o) => o?.over35 === true }
    ]
  },
  {
    id: 'kg',
    label: 'Karşılıklı Gol & Toplam Gol',
    shortLabel: 'KG & TG',
    headerClass: 'bg-purple-950/80 text-purple-300 border-purple-800/60',
    columns: [
      { key: 'kgVar', label: 'KG Var', marketName: 'KG Var', isWin: (o) => o?.kgVar === true },
      { key: 'kgYok', label: 'KG Yok', marketName: 'KG Yok', isWin: (o) => o && !o.kgVar },
      { key: 'tg01', label: '0-1 Gol', marketName: 'Toplam Gol: 0-1', isWin: (o) => o && o.totalGoals >= 0 && o.totalGoals <= 1 },
      { key: 'tg23', label: '2-3 Gol', marketName: 'Toplam Gol: 2-3', isWin: (o) => o && o.totalGoals >= 2 && o.totalGoals <= 3 },
      { key: 'tg45', label: '4-5 Gol', marketName: 'Toplam Gol: 4-5', isWin: (o) => o && o.totalGoals >= 4 && o.totalGoals <= 5 },
      { key: 'tg6p', label: '6+ Gol', marketName: 'Toplam Gol: 6+', isWin: (o) => o && o.totalGoals >= 6 }
    ]
  },
  {
    id: 'iyms',
    label: 'İlk Yarı / Maç Sonucu (İY/MS)',
    shortLabel: 'İY/MS',
    headerClass: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/60',
    columns: [
      { key: 'iyms11', label: '1/1', marketName: 'İY/MS: 1/1', isWin: (o) => o?.iymsResult === '1/1' },
      { key: 'iyms1X', label: '1/X', marketName: 'İY/MS: 1/X', isWin: (o) => o?.iymsResult === '1/X' },
      { key: 'iyms12', label: '1/2', marketName: 'İY/MS: 1/2', isWin: (o) => o?.iymsResult === '1/2' },
      { key: 'iymsX1', label: 'X/1', marketName: 'İY/MS: X/1', isWin: (o) => o?.iymsResult === 'X/1' },
      { key: 'iymsXX', label: 'X/X', marketName: 'İY/MS: X/X', isWin: (o) => o?.iymsResult === 'X/X' },
      { key: 'iymsX2', label: 'X/2', marketName: 'İY/MS: X/2', isWin: (o) => o?.iymsResult === 'X/2' },
      { key: 'iyms21', label: '2/1', marketName: 'İY/MS: 2/1', isWin: (o) => o?.iymsResult === '2/1' },
      { key: 'iyms2X', label: '2/X', marketName: 'İY/MS: 2/X', isWin: (o) => o?.iymsResult === '2/X' },
      { key: 'iyms22', label: '2/2', marketName: 'İY/MS: 2/2', isWin: (o) => o?.iymsResult === '2/2' }
    ]
  },
  {
    id: 'iyskor',
    label: 'İlk Yarı Skoru (İY Skor - 10 Seçenek)',
    shortLabel: 'İY Skor',
    headerClass: 'bg-sky-950/80 text-sky-300 border-sky-800/60',
    columns: [
      { key: 'iyskor00', label: 'İY 0-0', marketName: 'İY Skoru: 0-0', isWin: (o, m) => m?.htScore === '0-0' },
      { key: 'iyskor11', label: 'İY 1-1', marketName: 'İY Skoru: 1-1', isWin: (o, m) => m?.htScore === '1-1' },
      { key: 'iyskor22', label: 'İY 2-2', marketName: 'İY Skoru: 2-2', isWin: (o, m) => m?.htScore === '2-2' },
      { key: 'iyskor10', label: 'İY 1-0', marketName: 'İY Skoru: 1-0', isWin: (o, m) => m?.htScore === '1-0' },
      { key: 'iyskor20', label: 'İY 2-0', marketName: 'İY Skoru: 2-0', isWin: (o, m) => m?.htScore === '2-0' },
      { key: 'iyskor21', label: 'İY 2-1', marketName: 'İY Skoru: 2-1', isWin: (o, m) => m?.htScore === '2-1' },
      { key: 'iyskor01', label: 'İY 0-1', marketName: 'İY Skoru: 0-1', isWin: (o, m) => m?.htScore === '0-1' },
      { key: 'iyskor02', label: 'İY 0-2', marketName: 'İY Skoru: 0-2', isWin: (o, m) => m?.htScore === '0-2' },
      { key: 'iyskor12', label: 'İY 1-2', marketName: 'İY Skoru: 1-2', isWin: (o, m) => m?.htScore === '1-2' },
      {
        key: 'iyskorDiger',
        label: 'İY Diğer',
        marketName: 'İY Skoru: Diğer',
        isWin: (o, m) =>
          m?.htScore &&
          m.htScore !== '-' &&
          !['0-0', '1-1', '2-2', '1-0', '2-0', '2-1', '0-1', '0-2', '1-2'].includes(m.htScore)
      }
    ]
  },
  {
    id: 'skor',
    label: 'Maç Skoru (Tüm 29 Yasal İddaa Skor Seçeneği)',
    shortLabel: 'Maç Skoru (29)',
    headerClass: 'bg-rose-950/80 text-rose-300 border-rose-800/60',
    columns: [
      // Ev Sahibi Kazanır Skorları (12)
      { key: 'skor10', label: '1-0', marketName: 'Maç Skoru: 1-0', isWin: (o, m) => m?.ftScore === '1-0' },
      { key: 'skor20', label: '2-0', marketName: 'Maç Skoru: 2-0', isWin: (o, m) => m?.ftScore === '2-0' },
      { key: 'skor21', label: '2-1', marketName: 'Maç Skoru: 2-1', isWin: (o, m) => m?.ftScore === '2-1' },
      { key: 'skor30', label: '3-0', marketName: 'Maç Skoru: 3-0', isWin: (o, m) => m?.ftScore === '3-0' },
      { key: 'skor31', label: '3-1', marketName: 'Maç Skoru: 3-1', isWin: (o, m) => m?.ftScore === '3-1' },
      { key: 'skor32', label: '3-2', marketName: 'Maç Skoru: 3-2', isWin: (o, m) => m?.ftScore === '3-2' },
      { key: 'skor40', label: '4-0', marketName: 'Maç Skoru: 4-0', isWin: (o, m) => m?.ftScore === '4-0' },
      { key: 'skor41', label: '4-1', marketName: 'Maç Skoru: 4-1', isWin: (o, m) => m?.ftScore === '4-1' },
      { key: 'skor42', label: '4-2', marketName: 'Maç Skoru: 4-2', isWin: (o, m) => m?.ftScore === '4-2' },
      { key: 'skor50', label: '5-0', marketName: 'Maç Skoru: 5-0', isWin: (o, m) => m?.ftScore === '5-0' },
      { key: 'skor51', label: '5-1', marketName: 'Maç Skoru: 5-1', isWin: (o, m) => m?.ftScore === '5-1' },
      { key: 'skor60', label: '6-0', marketName: 'Maç Skoru: 6-0', isWin: (o, m) => m?.ftScore === '6-0' },
      // Beraberlik Skorları (4)
      { key: 'skor00', label: '0-0', marketName: 'Maç Skoru: 0-0', isWin: (o, m) => m?.ftScore === '0-0' },
      { key: 'skor11', label: '1-1', marketName: 'Maç Skoru: 1-1', isWin: (o, m) => m?.ftScore === '1-1' },
      { key: 'skor22', label: '2-2', marketName: 'Maç Skoru: 2-2', isWin: (o, m) => m?.ftScore === '2-2' },
      { key: 'skor33', label: '3-3', marketName: 'Maç Skoru: 3-3', isWin: (o, m) => m?.ftScore === '3-3' },
      // Deplasman Kazanır Skorları (12)
      { key: 'skor01', label: '0-1', marketName: 'Maç Skoru: 0-1', isWin: (o, m) => m?.ftScore === '0-1' },
      { key: 'skor02', label: '0-2', marketName: 'Maç Skoru: 0-2', isWin: (o, m) => m?.ftScore === '0-2' },
      { key: 'skor12', label: '1-2', marketName: 'Maç Skoru: 1-2', isWin: (o, m) => m?.ftScore === '1-2' },
      { key: 'skor03', label: '0-3', marketName: 'Maç Skoru: 0-3', isWin: (o, m) => m?.ftScore === '0-3' },
      { key: 'skor13', label: '1-3', marketName: 'Maç Skoru: 1-3', isWin: (o, m) => m?.ftScore === '1-3' },
      { key: 'skor23', label: '2-3', marketName: 'Maç Skoru: 2-3', isWin: (o, m) => m?.ftScore === '2-3' },
      { key: 'skor04', label: '0-4', marketName: 'Maç Skoru: 0-4', isWin: (o, m) => m?.ftScore === '0-4' },
      { key: 'skor14', label: '1-4', marketName: 'Maç Skoru: 1-4', isWin: (o, m) => m?.ftScore === '1-4' },
      { key: 'skor24', label: '2-4', marketName: 'Maç Skoru: 2-4', isWin: (o, m) => m?.ftScore === '2-4' },
      { key: 'skor05', label: '0-5', marketName: 'Maç Skoru: 0-5', isWin: (o, m) => m?.ftScore === '0-5' },
      { key: 'skor15', label: '1-5', marketName: 'Maç Skoru: 1-5', isWin: (o, m) => m?.ftScore === '1-5' },
      { key: 'skor06', label: '0-6', marketName: 'Maç Skoru: 0-6', isWin: (o, m) => m?.ftScore === '0-6' },
      // Diğer (1)
      {
        key: 'skorDiger',
        label: 'Diğer',
        marketName: 'Maç Skoru: Diğer',
        isWin: (o, m) =>
          m?.ftScore && m.ftScore !== '-' && !EXACT_SCORES_LIST.includes(m.ftScore)
      }
    ]
  }
];

export const ALL_ODD_COLUMNS = MARKET_GROUPS.flatMap((g) =>
  g.columns.map((c) => ({ ...c, groupId: g.id, groupLabel: g.shortLabel }))
);

export const RULE_FIELDS = [
  ...ALL_ODD_COLUMNS.map((c) => ({
    key: `odds.${c.key}`,
    label: `${c.groupLabel} - ${c.label}`,
    type: 'number'
  })),
  { key: 'league', label: 'Lig Adı', type: 'text' },
  { key: 'homeTeam', label: 'Ev Sahibi Takım', type: 'text' },
  { key: 'awayTeam', label: 'Deplasman Takımı', type: 'text' },
  { key: 'date', label: 'Tarih (GG.AA.YYYY)', type: 'text' },
  { key: 'htScore', label: 'İlk Yarı Skoru (Örn: 1-0)', type: 'text' },
  { key: 'ftScore', label: 'Maç Skoru (Örn: 2-1)', type: 'text' }
];
