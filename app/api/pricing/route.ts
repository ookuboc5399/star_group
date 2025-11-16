import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

// 料金マスターデータのスプレッドシートIDとGID
const PRICING_SPREADSHEET_ID = '1PrX2gckGPAiI8QBxTC_802hOos_dp6VD9oZjuNjD1b0';
const PRICING_SHEET_GID = '1121270057';

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
    console.log('[Pricing API] 料金マスターデータを取得開始');
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // スプレッドシートの情報を取得してシートを特定
    const spreadsheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: PRICING_SPREADSHEET_ID,
    });
    
    console.log('[Pricing API] 利用可能なシート:', spreadsheetInfo.data.sheets?.map(s => ({
      title: s.properties?.title,
      sheetId: s.properties?.sheetId,
    })));
    
    // GIDでシートを検索
    const sheetGidNum = parseInt(PRICING_SHEET_GID, 10);
    let targetSheet = spreadsheetInfo.data.sheets?.find(
      (sheet) => sheet.properties?.sheetId === sheetGidNum
    );
    
    // GIDで見つからない場合は、最初のシートを使用
    if (!targetSheet) {
      console.log('[Pricing API] GIDでシートが見つかりません。最初のシートを使用します');
      targetSheet = spreadsheetInfo.data.sheets?.[0];
    }
    
    if (!targetSheet || !targetSheet.properties?.title) {
      throw new Error(`シートが見つかりません: GID ${PRICING_SHEET_GID}`);
    }
    
    const actualSheetName = targetSheet.properties.title;
    console.log('[Pricing API] 使用するシート:', actualSheetName, 'GID:', targetSheet.properties.sheetId);
    
    // 料金マスターデータを取得
    // J列: ブランド名（特別指名料金）、K列: 女の子の名前、L列: 料金
    // M列: ブランド（コース料金）、N列: コース時間、O列: コース料金
    // P列: ブランド名（オプション）、Q列: オプション名、R列: オプション料金
    // S列: ブランド（割引）、T列: 割引名、U列: コース時間、V列: 料金
    const maxRows = 1000;
    
    // 特別指名料金（J, K, L列）
    const specialNameRange = `'${actualSheetName}'!J2:L${2 + maxRows}`;
    // コース料金（M, N, O列）
    const courseRange = `'${actualSheetName}'!M2:O${2 + maxRows}`;
    // オプション（P, Q, R列）
    const optionRange = `'${actualSheetName}'!P2:R${2 + maxRows}`;
    // 割引（S, T, U, V列）
    const discountRange = `'${actualSheetName}'!S2:V${2 + maxRows}`;
    
    const [specialNameResponse, courseResponse, optionResponse, discountResponse] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: PRICING_SPREADSHEET_ID,
        range: specialNameRange,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: PRICING_SPREADSHEET_ID,
        range: courseRange,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: PRICING_SPREADSHEET_ID,
        range: optionRange,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: PRICING_SPREADSHEET_ID,
        range: discountRange,
      }),
    ]);
    
    // 特別指名料金をパース
    const specialNames: Array<{
      brand: string;
      castName: string;
      price: number;
    }> = [];
    
    console.log('[Pricing API] 特別指名料金データの行数:', specialNameResponse.data.values?.length || 0);
    
    if (specialNameResponse.data.values) {
      specialNameResponse.data.values.forEach((row: any[], index) => {
        const brand = row[0] ? String(row[0]).trim() : '';
        const castName = row[1] ? String(row[1]).trim() : '';
        const priceStr = row[2] ? String(row[2]).trim() : '';
        
        if (brand && castName && priceStr) {
          const price = parseFloat(priceStr.replace(/[^\d.]/g, '')); // 数字以外を除去
          if (!isNaN(price)) {
            specialNames.push({ brand, castName, price });
          } else {
            console.log('[Pricing API] 特別指名料金のパースエラー (行', index + 2, '):', priceStr);
          }
        }
      });
    }
    
    console.log('[Pricing API] 特別指名料金の件数:', specialNames.length);
    
    // コース料金をパース
    const courses: Array<{
      brand: string;
      courseTime: number;
      price: number;
    }> = [];
    
    console.log('[Pricing API] コース料金データの行数:', courseResponse.data.values?.length || 0);
    
    if (courseResponse.data.values) {
      courseResponse.data.values.forEach((row: any[], index) => {
        const brand = row[0] ? String(row[0]).trim() : '';
        const courseTimeStr = row[1] ? String(row[1]).trim() : '';
        const priceStr = row[2] ? String(row[2]).trim() : '';
        
        if (brand && courseTimeStr && priceStr) {
          const courseTime = parseFloat(courseTimeStr.replace(/[^\d.]/g, ''));
          const price = parseFloat(priceStr.replace(/[^\d.]/g, ''));
          if (!isNaN(courseTime) && !isNaN(price)) {
            courses.push({ brand, courseTime, price });
          } else {
            console.log('[Pricing API] コース料金のパースエラー (行', index + 2, '):', {
              brand,
              courseTimeStr,
              priceStr,
              courseTime,
              price,
            });
          }
        }
      });
    }
    
    console.log('[Pricing API] コース料金の件数:', courses.length);
    if (courses.length > 0) {
      console.log('[Pricing API] コース料金のサンプル (最初の5件):', courses.slice(0, 5));
    }
    
    // オプションをパース
    const options: Array<{
      brand: string;
      optionName: string;
      price: number;
    }> = [];
    
    if (optionResponse.data.values) {
      optionResponse.data.values.forEach((row: any[]) => {
        const brand = row[0] ? String(row[0]).trim() : '';
        const optionName = row[1] ? String(row[1]).trim() : '';
        const priceStr = row[2] ? String(row[2]).trim() : '';
        
        if (brand && optionName && priceStr) {
          const price = parseFloat(priceStr.replace(/[^\d.]/g, ''));
          if (!isNaN(price)) {
            options.push({ brand, optionName, price });
          }
        }
      });
    }
    
    // 割引をパース
    const discounts: Array<{
      brand: string;
      discountName: string;
      courseTime: number;
      price: number;
    }> = [];
    
    if (discountResponse.data.values) {
      discountResponse.data.values.forEach((row: any[]) => {
        const brand = row[0] ? String(row[0]).trim() : '';
        const discountName = row[1] ? String(row[1]).trim() : '';
        const courseTimeStr = row[2] ? String(row[2]).trim() : '';
        const priceStr = row[3] ? String(row[3]).trim() : '';
        
        if (brand && discountName && courseTimeStr && priceStr) {
          const courseTime = parseFloat(courseTimeStr.replace(/[^\d.]/g, ''));
          const price = parseFloat(priceStr.replace(/[^\d.]/g, ''));
          if (!isNaN(courseTime) && !isNaN(price)) {
            discounts.push({ brand, discountName, courseTime, price });
          }
        }
      });
    }
    
    return NextResponse.json({
      success: true,
      specialNames,
      courses,
      options,
      discounts,
    });
  } catch (error: any) {
    console.error('Error fetching pricing data:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch pricing data',
      },
      { status: 500 }
    );
  }
}

