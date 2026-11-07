const fs = require('fs');
const path = require('path');

/**
 * GitHub'dan gelen matches.json ile bilgisayardaki matches.json dosyasını
 * hiçbir maçı veya kapanış oranını kaybetmeden birleştirir.
 */
const [, , basePath, localPath, remotePath] = process.argv;

try {
  const localMatches = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
  const remoteMatches = JSON.parse(fs.readFileSync(remotePath, 'utf-8'));

  const map = new Map();

  for (const m of localMatches) {
    if (m && m.code) map.set(String(m.code), m);
  }

  for (const rm of remoteMatches) {
    if (!rm || !rm.code) continue;
    const key = String(rm.code);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, rm);
    } else {
      // Eğer uzak sunucuda maç FINISHED olmuşsa veya daha güncel bilgi varsa birleştir
      const isFinished = rm.status === 'FINISHED' || existing.status === 'FINISHED';
      map.set(key, {
        ...existing,
        ...rm,
        status: isFinished ? 'FINISHED' : rm.status || existing.status,
        htScore: rm.htScore && rm.htScore !== '-' ? rm.htScore : existing.htScore,
        ftScore: rm.ftScore && rm.ftScore !== '-' ? rm.ftScore : existing.ftScore,
        outcome: rm.outcome || existing.outcome,
        odds: {
          ...(existing.odds || {}),
          ...(rm.odds || {})
        }
      });
    }
  }

  const merged = Array.from(map.values());
  fs.writeFileSync(localPath, JSON.stringify(merged, null, 2), 'utf-8');
  process.exit(0);
} catch (err) {
  console.error('JSON birleştirme hatası:', err.message);
  process.exit(1);
}

