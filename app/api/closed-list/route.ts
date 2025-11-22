import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// 受付終了リスト取得用スプレッドシートID
const CLOSED_LIST_SPREADSHEET_ID = '1h6n771nzwqNxFp3O2L5yCROA5g36o0s3r7PMADyowLA';
const CLOSED_LIST_SHEET_GID = '430986631';

// サービスアカウント認証情報の読み込み
function getAuth() {
  let credentials;
  if (process.env.GOOGLE_CREDENTIALS) {
    credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  } else {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const credentialsPath = join(process.cwd(), 'roadtoentrepreneur-045990358137.json');
    credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
  }

  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

// 名前を正規化する関数
function normalizeName(name: string): string {
  if (!name) return '';
  let normalized = String(name).trim();
  // 「ご　」「ぐ　」「ご 」「ぐ 」「ご」「ぐ」などのプレフィックスを除去
  normalized = normalized.replace(/^[ごぐ][\s　]*/, '').trim();
  if (normalized.includes('/')) {
    normalized = normalized.split('/')[0].trim();
    normalized = normalized.replace(/^[ごぐ][\s　]*/, '').trim();
  }
  // 全角スペースや半角スペースを取り除く
  normalized = normalized.replace(/\s+/g, '');
  return normalized;
}

export async function GET(request: Request) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // スプレッドシートの情報を取得してシートを特定
    const spreadsheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: CLOSED_LIST_SPREADSHEET_ID,
    });

    // GIDでシートを検索
    const sheetGidNum = parseInt(CLOSED_LIST_SHEET_GID, 10);
    const targetSheet = spreadsheetInfo.data.sheets?.find(
      (sheet) => sheet.properties?.sheetId === sheetGidNum
    );

    if (!targetSheet || !targetSheet.properties?.title) {
      return NextResponse.json({
        success: false,
        error: `シートが見つかりません: GID ${CLOSED_LIST_SHEET_GID}`,
        closedNames: [],
      });
    }

    const sheetName = targetSheet.properties.title;

    // H列とI列を5行目から取得（最大1000行まで）
    const maxRows = 1000;
    const range = `'${sheetName}'!H5:I${5 + maxRows}`;

    const dataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CLOSED_LIST_SPREADSHEET_ID,
      range: range,
    });

    // 名前が記載されている女の子のセット（正規化済み）
    const activeNames = new Set<string>();

    if (dataResponse.data.values) {
      let foundClosedMarker = false;
      
      for (let rowIndex = 0; rowIndex < dataResponse.data.values.length; rowIndex++) {
        const row = dataResponse.data.values[rowIndex];
        const nameH = row[0] ? String(row[0]).trim() : ''; // H列：ごほうびSPA、痴女性感
        const nameI = row[1] ? String(row[1]).trim() : ''; // I列：ぐっすり山田

        // 「▼受付終了▼」マーカーを検出したら処理を終了
        if (
          nameH.includes('▼受付終了▼') ||
          nameH.includes('受付終了') ||
          nameI.includes('▼受付終了▼') ||
          nameI.includes('受付終了')
        ) {
          foundClosedMarker = true;
          break; // この行以降は処理しない
        }

        // H列に名前がある場合（ごほうびSPA、痴女性感）
        if (nameH) {
          const normalized = normalizeName(nameH);
          if (normalized) {
            activeNames.add(normalized);
          }
        }

        // I列に名前がある場合（ぐっすり山田）
        if (nameI) {
          const normalized = normalizeName(nameI);
          if (normalized) {
            activeNames.add(normalized);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      activeNames: Array.from(activeNames), // 受付可能な女の子の名前リスト（正規化済み）
    });
  } catch (error: any) {
    console.error('Error fetching closed list:', error);

    // クォータエラーの場合は429ステータスを返す
    if (error.code === 429 || error.status === 429) {
      return NextResponse.json(
        {
          success: false,
          error: 'Google Sheets APIのクォータ制限に達しました。しばらく待ってから再度お試しください。',
          quotaExceeded: true,
          closedNames: [],
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch closed list',
        closedNames: [],
      },
      { status: 500 }
    );
  }
}

