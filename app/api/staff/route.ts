import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

// 担当リストのスプレッドシートIDとGID
const STAFF_SPREADSHEET_ID = '1PrX2gckGPAiI8QBxTC_802hOos_dp6VD9oZjuNjD1b0';
const STAFF_SHEET_GID = '1121270057';

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
    console.log('[Staff API] 担当リストを取得開始');
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // スプレッドシートの情報を取得してシートを特定
    const spreadsheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: STAFF_SPREADSHEET_ID,
    });
    
    // GIDでシートを検索
    const sheetGidNum = parseInt(STAFF_SHEET_GID, 10);
    let targetSheet = spreadsheetInfo.data.sheets?.find(
      (sheet) => sheet.properties?.sheetId === sheetGidNum
    );
    
    // GIDで見つからない場合は、最初のシートを使用
    if (!targetSheet) {
      console.log('[Staff API] GIDでシートが見つかりません。最初のシートを使用します');
      targetSheet = spreadsheetInfo.data.sheets?.[0];
    }
    
    if (!targetSheet || !targetSheet.properties?.title) {
      throw new Error(`シートが見つかりません: GID ${STAFF_SHEET_GID}`);
    }
    
    const actualSheetName = targetSheet.properties.title;
    console.log('[Staff API] 使用するシート:', actualSheetName, 'GID:', targetSheet.properties.sheetId);
    
    // B列2行目以下から担当リストを取得
    const maxRows = 1000;
    const staffRange = `'${actualSheetName}'!B2:B${2 + maxRows}`;
    
    const staffResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: STAFF_SPREADSHEET_ID,
      range: staffRange,
    });
    
    // 担当リストをパース
    const staffList: string[] = [];
    
    if (staffResponse.data.values) {
      staffResponse.data.values.forEach((row: any[]) => {
        const staffName = row[0] ? String(row[0]).trim() : '';
        if (staffName) {
          staffList.push(staffName);
        }
      });
    }
    
    // 重複を除去してソート
    const uniqueStaffList = Array.from(new Set(staffList)).sort();
    
    console.log('[Staff API] 担当リストの件数:', uniqueStaffList.length);
    
    return NextResponse.json({
      success: true,
      staffList: uniqueStaffList,
    });
  } catch (error: any) {
    console.error('Error fetching staff data:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch staff data',
      },
      { status: 500 }
    );
  }
}

