export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function googleMapsUrl(store) {
  return `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`;
}

export function findStation(stations, query) {
  if (!query) return null;
  const q = String(query).trim().toLowerCase();
  return (
    stations.find((s) => s.id === q || s.name.zh === query || s.name.ja === query || s.name.en.toLowerCase() === q) ??
    stations.find((s) => s.name.zh.includes(query) || s.name.ja?.includes(query) || s.name.en.toLowerCase().includes(q) || s.id.includes(q)) ??
    null
  );
}

/** 按距离返回最近门店。origin = {lat,lng}；category 可选（仅筛 categories 包含该品类的店）。 */
export function nearestStores(stores, origin, { limit = 10, category, chain } = {}) {
  return stores
    .filter((s) => !category || !s.categories || s.categories.includes(category))
    .filter((s) => !chain || s.chain === chain)
    .map((s) => ({ ...s, distanceKm: Math.round(haversineKm(origin, s) * 100) / 100, mapUrl: googleMapsUrl(s) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}
