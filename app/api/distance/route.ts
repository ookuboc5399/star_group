import { NextResponse } from 'next/server';

const MAPS_API_KEY = process.env.GOOGLE_MAP_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAP_API_KEY;

export async function POST(request: Request) {
  try {
    const { origin, destination } = await request.json();

    if (!origin || !destination) {
      return NextResponse.json(
        { success: false, error: 'originとdestinationは必須です' },
        { status: 400 }
      );
    }

    if (!MAPS_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Google Maps APIキーが設定されていません' },
        { status: 500 }
      );
    }

    const params = new URLSearchParams({
      origins: origin,
      destinations: destination,
      key: MAPS_API_KEY,
      language: 'ja',
      mode: 'driving',
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`,
      {
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { success: false, error: `Distance Matrix API error: ${text}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const element = data?.rows?.[0]?.elements?.[0];

    if (!element || element.status !== 'OK') {
      return NextResponse.json(
        { success: false, error: '移動時間を取得できませんでした' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      durationText: element.duration?.text,
      durationSeconds: element.duration?.value,
      distanceText: element.distance?.text,
      distanceMeters: element.distance?.value,
      origin: data.origin_addresses?.[0] || origin,
      destination: data.destination_addresses?.[0] || destination,
    });
  } catch (error: any) {
    console.error('[Distance API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '移動時間の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

