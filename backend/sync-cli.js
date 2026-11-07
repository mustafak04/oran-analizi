/**
 * GitHub Actions ve Komut Satırı için Bağımsız Senkronizasyon Betiği
 * Her çalıştığında:
 * 1) Mevcut kalıcı arşiv veritabanını (backend/data/matches.json) okur.
 * 2) iddaa.com'dan güncel bülteni (kapanış oranlarını) ve biten maç skorlarını çeker.
 * 3) Hiçbir eski maçı silmeden kalıcı arşive birleştirip kaydeder.
 */
const {
  loadMatchesDatabase,
  saveMatchesDatabase,
  scrapeLiveIddaaMatches
} = require('./scraper');

async function runCliSync() {
  console.log('[Sync-CLI] Mevcut kalıcı arşiv okunuyor...');
  const existing = loadMatchesDatabase();
  console.log(`[Sync-CLI] Mevcut kayıt sayısı: ${existing.length}`);

  const result = await scrapeLiveIddaaMatches(existing);
  if (result.success && result.matches.length > 0) {
    saveMatchesDatabase(result.matches);
    console.log(
      `[Sync-CLI] Başarılı! Toplam: ${result.count} (Bülten: ${result.upcomingCount}, Biten Gerçek Maç: ${result.finishedCount})`
    );
    process.exit(0);
  } else {
    console.warn('[Sync-CLI] Yeni veri alınamadı, mevcut veritabanı korundu.');
    process.exit(0);
  }
}

runCliSync().catch((err) => {
  console.error('[Sync-CLI] Hata:', err.message);
  process.exit(1);
});

