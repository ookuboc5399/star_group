import { NextResponse } from 'next/server';

const MAPS_API_KEY = process.env.GOOGLE_MAP_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAP_API_KEY;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { success: false, error: 'address クエリパラメータが必要です' },
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
      address,
      key: MAPS_API_KEY,
      language: 'ja',
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { success: false, error: `Geocode API error: ${text}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const result = data?.results?.[0];

    if (!result || !result.geometry?.location) {
      return NextResponse.json(
        { success: false, error: '指定された住所の位置情報を取得できませんでした' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      formattedAddress: result.formatted_address,
      location: result.geometry.location,
    });
  } catch (error: any) {
    console.error('[Geocode API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '位置情報の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}


