/**
 * n'in r'li kombinasyon sayısı C(n, r) = n! / (r! * (n - r)!)
 */
export function combinationCount(n, r) {
  if (r < 0 || r > n) return 0;
  if (r === 0 || r === n) return 1;
  const k = Math.min(r, n - r);
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = (result * (n - k + i)) / i;
  }
  return Math.round(result);
}

/**
 * Bir dizinin r elemanlı tüm alt kümelerini (kombinasyonlarını) üretir
 */
export function generateCombinations(items, r) {
  if (r === 0) return [[]];
  if (items.length === 0 || r > items.length) return [];

  const results = [];

  function helper(startIndex, currentCombo) {
    if (currentCombo.length === r) {
      results.push([...currentCombo]);
      return;
    }
    const remainingNeeded = r - currentCombo.length;
    for (let i = startIndex; i <= items.length - remainingNeeded; i++) {
      currentCombo.push(items[i]);
      helper(i + 1, currentCombo);
      currentCombo.pop();
    }
  }

  helper(0, []);
  return results;
}

/**
 * İddaa Sistem Kuponu Hesaplama Motoru
 * - Kupondaki maçlar (items), seçilen sistemler (selectedSystems: [2, 3, ...]),
 *   misli değeri (misli) ve kolon birim fiyatı (unitPrice) üzerinden:
 *   1. Dinamik olarak açılabilir sistem seçeneklerini (1..N) hesaplar.
 *   2. Banko işaretli maçlar varsa Bankolu Sistem matematiğini, yoksa standart C(n, r)
 *      kombinasyon matematiğini uygular.
 *   3. Oluşan her bir kolonu, kolon oranını ve maksimum kazancı ayrı ayrı hesaplar.
 */
export function calculateBetSlipSummary(slipItems, selectedSystems, misli = 1, unitPrice = 1) {
  const totalMatches = slipItems.length;
  if (totalMatches === 0) {
    return {
      totalMatches: 0,
      bankoCount: 0,
      regularCount: 0,
      availableSystems: [],
      activeSystems: [],
      totalColumns: 0,
      baseCouponCost: 0,
      totalCost: 0,
      combinedDirectOdd: 0,
      maxPayout: 0,
      generatedColumns: []
    };
  }

  const bankoItems = slipItems.filter((item) => item.isBanko);
  const regularItems = slipItems.filter((item) => !item.isBanko);

  const bankoCount = bankoItems.length;
  const regularCount = regularItems.length;

  // Seçilebilir sistem havuzu:
  // Eğer banko seçilmemişse 1'den N'e kadar tüm sistemler dinamik oluşur.
  // Eğer banko seçilmişse kalan (N - B) maç üzerinden 1..(N - B) arası sistemler oluşur.
  const poolSize = bankoCount > 0 ? regularCount : totalMatches;
  const availableSystems = [];
  for (let r = 1; r <= poolSize; r++) {
    availableSystems.push({
      r,
      label: `Sistem ${r}`,
      columns: combinationCount(poolSize, r)
    });
  }

  // Aktif seçili sistemleri filtrele; eğer hiçbiri seçili değilse standart kombine (Sistem N) baz alınır
  const validSelected = selectedSystems.filter((r) => r >= 1 && r <= poolSize).sort((a, b) => a - b);
  const effectiveSystems = validSelected.length > 0 ? validSelected : [poolSize];

  const bankoProductOdd = bankoItems.reduce((acc, item) => acc * parseFloat(item.odd || 1), 1);

  const generatedColumns = [];
  let colIndex = 1;

  for (const r of effectiveSystems) {
    const combos = generateCombinations(regularItems.length > 0 ? regularItems : bankoItems, r);
    for (const combo of combos) {
      const fullColumnMatches = bankoCount > 0 && regularItems.length > 0 ? [...bankoItems, ...combo] : combo;
      const columnOdd = fullColumnMatches.reduce((acc, item) => acc * parseFloat(item.odd || 1), 1);
      const roundedOdd = Math.round(columnOdd * 100) / 100;
      const columnPayout = roundedOdd * misli * unitPrice;

      generatedColumns.push({
        id: colIndex++,
        systemR: r,
        matches: fullColumnMatches,
        odd: roundedOdd,
        payout: columnPayout
      });
    }
  }

  const totalColumns = generatedColumns.length;
  const baseCouponCost = totalColumns * unitPrice;
  const totalCost = baseCouponCost * misli;

  const maxPayout = generatedColumns.reduce((sum, col) => sum + col.payout, 0);
  const combinedDirectOdd = slipItems.reduce((acc, item) => acc * parseFloat(item.odd || 1), 1);

  return {
    totalMatches,
    bankoCount,
    regularCount,
    availableSystems,
    activeSystems: effectiveSystems,
    isSystemActive: validSelected.length > 0,
    totalColumns,
    baseCouponCost,
    totalCost,
    combinedDirectOdd: Math.round(combinedDirectOdd * 100) / 100,
    maxPayout: Math.round(maxPayout * 100) / 100,
    generatedColumns
  };
}

