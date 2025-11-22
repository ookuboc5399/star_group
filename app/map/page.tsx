'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Girl, Reception, ReceptionData, ReservationData } from '@/app/lib/types';
import {
  formatDate,
  getBusinessDate,
  getDateOptions,
  getCurrentTimeMinutes,
  normalizeName,
  parseTimeStringToMinutes,
} from '@/app/lib/utils';

type BrandKey = 'gohobi' | 'gussuri' | 'chijo' | 'unknown';

const GOOGLE_MAPS_BROWSER_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAP_API_KEY || process.env.GOOGLE_MAP_API_KEY || '';

const OFFICE_ADDRESS = '東京都品川区東五反田1丁目16 五反田フェニックスビル';
const OFFICE_COORDS = { lat: 35.625996, lng: 139.723548 };

type MapLocation = {
  id: string;
  name: string;
  brandLabel: string;
  brandKey: BrandKey;
  address: string;
  isActive: boolean;
  isOffice: boolean;
  reception?: Reception;
  girl?: Girl;
  position?: { lat: number; lng: number };
};

declare global {
  interface Window {
    google: any;
  }
}

export default function MapPage() {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    return formatDate(getBusinessDate(now));
  });
  const [reservations, setReservations] = useState<ReservationData | null>(null);
  const [receptions, setReceptions] = useState<ReceptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [isMapsReady, setIsMapsReady] = useState(false);
  const [addressCoords, setAddressCoords] = useState<Record<string, { lat: number; lng: number }>>({
    [OFFICE_ADDRESS]: OFFICE_COORDS,
  });

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const loadGoogleMaps = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (window.google && window.google.maps) {
      setIsMapsReady(true);
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-maps="true"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => setIsMapsReady(true), { once: true });
      return;
    }

    if (!GOOGLE_MAPS_BROWSER_KEY) {
      console.warn('Google Maps APIキーが設定されていません');
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_BROWSER_KEY}&language=ja`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = 'true';
    script.addEventListener('load', () => setIsMapsReady(true));
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    loadGoogleMaps();
  }, [loadGoogleMaps]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const dateParam = encodeURIComponent(selectedDate);
        const [reservationRes, receptionRes] = await Promise.all([
          fetch(`/api/reservations?date=${dateParam}`),
          fetch(`/api/receptions?date=${dateParam}`),
        ]);

        const [reservationJson, receptionJson] = await Promise.all([
          reservationRes.json(),
          receptionRes.json(),
        ]);

        if (cancelled) return;

        if (!reservationRes.ok || !reservationJson.success) {
          throw new Error(reservationJson.error || '予約データの取得に失敗しました');
        }
        if (!receptionRes.ok || !receptionJson.success) {
          throw new Error(receptionJson.error || '受付データの取得に失敗しました');
        }

        setReservations(reservationJson);
        setReceptions(receptionJson);
      } catch (fetchError: any) {
        console.error('[MapPage] fetch error:', fetchError);
        if (!cancelled) {
          setError(fetchError.message || 'データの取得に失敗しました');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  useEffect(() => {
    if (!isMapsReady || mapInstanceRef.current || !mapContainerRef.current || !window.google) return;
    mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
      center: OFFICE_COORDS,
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });
  }, [isMapsReady]);

  const currentMinutes = useMemo(() => getCurrentTimeMinutes(), [now]);

  const activeReceptionMap = useMemo(() => {
    const map = new Map<string, Reception>();
    if (!receptions?.receptions) return map;

    receptions.receptions.forEach((reception) => {
      const normalizedName = normalizeName(reception.castName || '').replace(/\s+/g, '');
      if (!normalizedName) {
        return;
      }

      const startMinutes =
        reception.startMinutes ?? parseTimeStringToMinutes(reception.startTime);
      const endMinutes =
        reception.endMinutes ??
        (startMinutes !== null ? startMinutes + (reception.courseTime || 0) : null);

      if (startMinutes === null || endMinutes === null) return;

      if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
        map.set(normalizedName, {
          ...reception,
          startMinutes,
          endMinutes,
        });
      }
    });

    return map;
  }, [receptions, currentMinutes]);

  const detectBrandFromStrings = (
    receptionBrand?: string,
    girl?: Girl
  ): { key: BrandKey; label: string } => {
    const normalizedBrand = receptionBrand || '';
    const includes = (keyword: string) => normalizedBrand.includes(keyword);

    if (includes('ごほうび')) return { key: 'gohobi', label: 'ごほうびSPA' };
    if (includes('ぐっすり')) return { key: 'gussuri', label: 'ぐっすり山田' };
    if (includes('痴女')) return { key: 'chijo', label: '痴女性感' };

    if (girl) {
      if (girl.nameGohobi) return { key: 'gohobi', label: 'ごほうびSPA' };
      if (girl.nameGussuri) return { key: 'gussuri', label: 'ぐっすり山田' };
    }

    return { key: 'unknown', label: '所属不明' };
  };

  const getDisplayNameForBrand = (girl: Girl | undefined, brandKey: BrandKey) => {
    if (!girl) return '';
    if (brandKey === 'gohobi' && girl.nameGohobi) return girl.nameGohobi;
    if (brandKey === 'gussuri' && girl.nameGussuri) return girl.nameGussuri;
    return girl.name;
  };

  const getNormalizedKeys = (girl: Girl | undefined) => {
    const names = new Set<string>();
    if (!girl) return names;

    const collect = (value?: string) => {
      if (!value) return;
      const normalized = normalizeName(value).replace(/\s+/g, '');
      if (normalized) {
        names.add(normalized);
      }
      if (value.includes('/')) {
        value.split('/').forEach((part) => {
          const partNormalized = normalizeName(part).replace(/\s+/g, '');
          if (partNormalized) {
            names.add(partNormalized);
          }
        });
      }
    };

    collect(girl.name);
    collect(girl.nameGohobi);
    collect(girl.nameGussuri);
    return names;
  };

  const rawLocations = useMemo<MapLocation[]>(() => {
    const result: MapLocation[] = [];
    const usedReceptionKeys = new Set<string>();
    const girls = reservations?.girls ?? [];

    girls.forEach((girl) => {
      const normalizedKeys = getNormalizedKeys(girl);
      let matchedReception: Reception | undefined;

      for (const key of normalizedKeys) {
        const reception = activeReceptionMap.get(key);
        if (reception) {
          matchedReception = reception;
          normalizedKeys.forEach((k) => usedReceptionKeys.add(k));
          break;
        }
      }

      const brandInfo = detectBrandFromStrings(matchedReception?.brand || '', girl);
      const displayName =
        getDisplayNameForBrand(girl, brandInfo.key) || girl.name || matchedReception?.castName || '名前未設定';
      const address = matchedReception?.hotelLocation?.trim() || OFFICE_ADDRESS;
      const isActive = Boolean(matchedReception?.hotelLocation?.trim());

      result.push({
        id: `${displayName}-${brandInfo.label}`,
        name: displayName,
        brandLabel: brandInfo.label,
        brandKey: brandInfo.key,
        address,
        isActive,
        isOffice: !isActive,
        girl,
        reception: matchedReception,
      });
    });

    activeReceptionMap.forEach((reception, key) => {
      if (usedReceptionKeys.has(key)) return;
      const brandInfo = detectBrandFromStrings(reception.brand);
      const address = reception.hotelLocation?.trim() || OFFICE_ADDRESS;
      result.push({
        id: `${reception.castName || key}-${key}`,
        name: reception.castName || '名前未設定',
        brandLabel: brandInfo.label,
        brandKey: brandInfo.key,
        address,
        isActive: Boolean(reception.hotelLocation?.trim()),
        isOffice: !reception.hotelLocation?.trim(),
        reception,
        girl: undefined,
      });
    });

    return result;
  }, [reservations, activeReceptionMap]);

  useEffect(() => {
    const uniqueAddresses = Array.from(
      new Set(rawLocations.map((loc) => loc.address).filter(Boolean))
    ).filter((address) => !addressCoords[address]);

    if (!uniqueAddresses.length) return;
    let cancelled = false;

    const fetchCoordsSequentially = async () => {
      for (const address of uniqueAddresses) {
        if (cancelled) break;
        try {
          const response = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
          const data = await response.json();
          if (!cancelled && response.ok && data.success && data.location) {
            setAddressCoords((prev) => ({
              ...prev,
              [address]: data.location,
            }));
          }
        } catch (geoError) {
          console.error('[MapPage] geocode error:', address, geoError);
        }
      }
    };

    fetchCoordsSequentially();
    return () => {
      cancelled = true;
    };
  }, [rawLocations, addressCoords]);

  const enrichedLocations = useMemo<MapLocation[]>(() => {
    return rawLocations.map((location) => {
      const coords =
        addressCoords[location.address] ||
        (location.isOffice ? OFFICE_COORDS : undefined);
      return {
        ...location,
        position: coords,
      };
    });
  }, [rawLocations, addressCoords]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    const bounds = new window.google.maps.LatLngBounds();
    let hasValidMarker = false;

    enrichedLocations.forEach((location) => {
      if (!location.position) return;
      const marker = new window.google.maps.Marker({
        map: mapInstanceRef.current,
        position: location.position,
        label: {
          text: location.isActive ? '●' : '○',
          color: location.isActive ? '#d97706' : '#6b7280',
          fontSize: '16px',
        },
      });

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="font-size:14px; min-width: 180px;">
            <strong>${location.name}</strong><br/>
            ${location.brandLabel}<br/>
            ${location.address}<br/>
            ${location.isActive ? '受付中' : 'オフィス待機'}
          </div>
        `,
      });

      marker.addListener('click', () => {
        infoWindow.open({
          anchor: marker,
          map: mapInstanceRef.current,
        });
      });

      markersRef.current.push(marker);
      bounds.extend(location.position);
      hasValidMarker = true;
    });

    if (hasValidMarker) {
      mapInstanceRef.current.fitBounds(bounds, 80);
    } else {
      mapInstanceRef.current.setCenter(OFFICE_COORDS);
      mapInstanceRef.current.setZoom(13);
    }
  }, [enrichedLocations]);

  const dateOptions = useMemo(() => getDateOptions(), []);
  const activeCount = enrichedLocations.filter((loc) => loc.isActive && loc.position).length;
  const officeCount = enrichedLocations.length - activeCount;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex flex-wrap items-center gap-4">
          <h1 className="text-xl font-semibold text-gray-900">現在地マップ</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/reservations"
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              予約状況カンバンへ
            </Link>
            <Link
              href="/attendance"
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              出勤管理へ
            </Link>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <label className="text-sm text-gray-600">表示日付</label>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {dateOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {!GOOGLE_MAPS_BROWSER_KEY && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Google Maps APIキーが設定されていません。.env に <code>NEXT_PUBLIC_GOOGLE_MAP_API_KEY</code> を
            追加してください。
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="h-[70vh] rounded-2xl border border-gray-200 bg-white shadow">
              <div ref={mapContainerRef} className="h-full w-full rounded-2xl" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow">
              <h2 className="text-lg font-semibold text-gray-900">ステータス</h2>
              <p className="mt-1 text-sm text-gray-500">
                現在時刻（10時基準）と受付時間の重なりから判断しています。
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-center">
                <div className="rounded-xl bg-amber-50 px-3 py-4">
                  <dt className="text-sm text-amber-700">受付中</dt>
                  <dd className="text-2xl font-bold text-amber-800">{activeCount}</dd>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-4">
                  <dt className="text-sm text-gray-600">事務所待機</dt>
                  <dd className="text-2xl font-bold text-gray-800">{officeCount}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow">
              <h2 className="text-lg font-semibold text-gray-900">一覧</h2>
              <div className="mt-3 max-h-[50vh] overflow-y-auto divide-y divide-gray-100">
                {loading && (
                  <p className="py-6 text-center text-sm text-gray-500">読み込み中...</p>
                )}
                {!loading && enrichedLocations.length === 0 && (
                  <p className="py-6 text-center text-sm text-gray-500">表示する女の子がいません。</p>
                )}
                {enrichedLocations.map((location) => (
                  <div key={location.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-base font-medium text-gray-900">
                          {location.name}
                          <span
                            className={`ml-2 text-xs font-semibold ${
                              location.brandKey === 'gohobi'
                                ? 'text-yellow-700'
                                : location.brandKey === 'gussuri'
                                  ? 'text-blue-700'
                                  : location.brandKey === 'chijo'
                                    ? 'text-purple-700'
                                    : 'text-gray-500'
                            }`}
                          >
                            {location.brandLabel}
                          </span>
                        </p>
                        <p className="text-sm text-gray-500">{location.address}</p>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                          location.isActive
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {location.isActive ? '受付中' : '事務所'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}


