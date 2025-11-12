import { NextResponse } from 'next/server';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { readFileSync } from 'fs';
import { join } from 'path';

// スプレッドシートID
const SPREADSHEET_ID = '11070jPIy5mwK9sGM4wCqjUKi1NRv-KTRV3vdKsGYP70';
const SHEET_GID = '578404798';

// サービスアカウント認証情報の読み込み
function getAuth() {
  const credentialsPath = join(process.cwd(), 'roadtoentrepreneur-045990358137.json');
  const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));

  const jwt = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  return jwt;
}

export async function GET() {
  try {
    const auth = getAuth();
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth);
    
    await doc.loadInfo();
    
    // 指定されたGIDのシートを取得（GIDを数値に変換）
    const sheetGidNum = parseInt(SHEET_GID, 10);
    let sheet = doc.sheetsById[sheetGidNum];
    
    // GIDで見つからない場合は、すべてのシートを確認
    if (!sheet) {
      // すべてのシートを確認してGIDが一致するものを探す
      for (const sheetItem of doc.sheetsByIndex) {
        if (sheetItem.sheetId === sheetGidNum) {
          sheet = sheetItem;
          break;
        }
      }
    }
    
    // それでも見つからない場合は最初のシートを使用
    if (!sheet) {
      sheet = doc.sheetsByIndex[0];
    }
    
    await sheet.loadHeaderRow();
    
    const rows = await sheet.getRows();
    const data = rows.map(row => {
      const rowData: Record<string, any> = {};
      sheet.headerValues.forEach(header => {
        rowData[header] = row.get(header);
      });
      return rowData;
    });

    return NextResponse.json({
      success: true,
      headers: sheet.headerValues,
      data: data,
    });
  } catch (error: any) {
    console.error('Error fetching spreadsheet data:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch spreadsheet data',
      },
      { status: 500 }
    );
  }
}

