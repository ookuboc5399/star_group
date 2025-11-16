import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

const WEB_RESERVATION_SPREADSHEET_ID = '1PrX2gckGPAiI8QBxTC_802hOos_dp6VD9oZjuNjD1b0';
const WEB_RESERVATION_SHEET_GID = '2133490213';

// サービスアカウント認証情報の読み込み
function getAuth() {
  const credentialsPath = join(process.cwd(), 'roadtoentrepreneur-045990358137.json');
  const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));

  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // MM/DD形式

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // シート名を取得
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: WEB_RESERVATION_SPREADSHEET_ID,
    });

    let targetSheetId: string | null = null;
    let targetSheetName: string | null = null;

    // GIDでシートを検索
    for (const sheet of spreadsheet.data.sheets || []) {
      if (sheet.properties?.sheetId?.toString() === WEB_RESERVATION_SHEET_GID) {
        targetSheetId = sheet.properties.sheetId.toString();
        targetSheetName = sheet.properties.title || null;
        break;
      }
    }

    if (!targetSheetName) {
      return NextResponse.json(
        { error: `シートが見つかりません: GID ${WEB_RESERVATION_SHEET_GID}` },
        { status: 404 }
      );
    }

    // データを取得（D列、F列、H列、O列、P列、Q列、X列）
    // 各列を個別に取得する方が確実
    const rangeD = `${targetSheetName}!D:D`; // ブランド名
    const rangeF = `${targetSheetName}!F:F`; // 電話番号
    const rangeH = `${targetSheetName}!H:H`; // お客様名
    const rangeO = `${targetSheetName}!O:O`; // 女の子の名前
    const rangeP = `${targetSheetName}!P:P`; // 開始時間
    const rangeQ = `${targetSheetName}!Q:Q`; // コース時間
    const rangeX = `${targetSheetName}!X:X`; // ホテル名

    const [responseD, responseF, responseH, responseO, responseP, responseQ, responseX] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: WEB_RESERVATION_SPREADSHEET_ID, range: rangeD }),
      sheets.spreadsheets.values.get({ spreadsheetId: WEB_RESERVATION_SPREADSHEET_ID, range: rangeF }),
      sheets.spreadsheets.values.get({ spreadsheetId: WEB_RESERVATION_SPREADSHEET_ID, range: rangeH }),
      sheets.spreadsheets.values.get({ spreadsheetId: WEB_RESERVATION_SPREADSHEET_ID, range: rangeO }),
      sheets.spreadsheets.values.get({ spreadsheetId: WEB_RESERVATION_SPREADSHEET_ID, range: rangeP }),
      sheets.spreadsheets.values.get({ spreadsheetId: WEB_RESERVATION_SPREADSHEET_ID, range: rangeQ }),
      sheets.spreadsheets.values.get({ spreadsheetId: WEB_RESERVATION_SPREADSHEET_ID, range: rangeX }),
    ]);

    const rowsD = responseD.data.values || [];
    const rowsF = responseF.data.values || [];
    const rowsH = responseH.data.values || [];
    const rowsO = responseO.data.values || [];
    const rowsP = responseP.data.values || [];
    const rowsQ = responseQ.data.values || [];
    const rowsX = responseX.data.values || [];

    const reservations: Array<{
      brand: string; // D列
      phone: string; // F列
      customerName: string; // H列
      castName: string; // O列
      startTime: string; // P列
      courseTime: string; // Q列
      hotelName: string; // X列
      rowIndex: number;
    }> = [];

    // 最大行数を取得
    const maxRows = Math.max(
      rowsD.length,
      rowsF.length,
      rowsH.length,
      rowsO.length,
      rowsP.length,
      rowsQ.length,
      rowsX.length
    );

    // ヘッダー行をスキップ（1行目は0ベースなので2行目から）
    for (let i = 1; i < maxRows; i++) {
      const brand = rowsD[i]?.[0] ? String(rowsD[i][0]).trim() : '';
      const phone = rowsF[i]?.[0] ? String(rowsF[i][0]).trim() : '';
      const customerName = rowsH[i]?.[0] ? String(rowsH[i][0]).trim() : '';
      const castName = rowsO[i]?.[0] ? String(rowsO[i][0]).trim() : '';
      const startTime = rowsP[i]?.[0] ? String(rowsP[i][0]).trim() : '';
      const courseTime = rowsQ[i]?.[0] ? String(rowsQ[i][0]).trim() : '';
      const hotelName = rowsX[i]?.[0] ? String(rowsX[i][0]).trim() : '';

      // 必須項目が空の場合はスキップ
      if (!brand || !customerName || !castName || !startTime || !courseTime) {
        continue;
      }

      reservations.push({
        brand,
        phone,
        customerName,
        castName,
        startTime,
        courseTime,
        hotelName,
        rowIndex: i + 1, // 1ベースの行番号
      });
    }

    return NextResponse.json({
      success: true,
      reservations,
      sheetName: targetSheetName,
    });
  } catch (error: any) {
    console.error('Web予約データ取得エラー:', error);
    
    // クォータ制限エラーの場合
    if (error.code === 429 || error.response?.status === 429) {
      return NextResponse.json(
        { 
          error: 'Google Sheets APIのクォータ制限に達しました。しばらく待ってから再度お試しください。',
          quotaExceeded: true 
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'データの取得に失敗しました' },
      { status: 500 }
    );
  }
}

