import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

// スプレッドシートID
const SPREADSHEET_ID = '11070jPIy5mwK9sGM4wCqjUKi1NRv-KTRV3vdKsGYP70';

// シート設定（GIDと日付開始列のマッピング）
const SHEET_CONFIGS: Record<string, { dateStartCol: string }> = {
  '578404798': { dateStartCol: 'AFI' }, // ごほうびSPA
  '732669611': { dateStartCol: 'BC' },  // ぐっすり山田
  '935931778': { dateStartCol: 'VR' },  // 痴女性感
};

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

// 列名を数値に変換する関数（A=1, B=2, ..., Z=26, AA=27, ...）
function columnToNumber(column: string): number {
  let result = 0;
  for (let i = 0; i < column.length; i++) {
    result = result * 26 + (column.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return result;
}

// 数値を列名に変換する関数（1=A, 2=B, ..., 26=Z, 27=AA, ...）
function numberToColumn(num: number): string {
  let result = '';
  while (num > 0) {
    num--;
    result = String.fromCharCode(65 + (num % 26)) + result;
    num = Math.floor(num / 26);
  }
  return result;
}

export async function GET(request: Request) {
  try {
    // クエリパラメータからGIDを取得
    const { searchParams } = new URL(request.url);
    const sheetGid = searchParams.get('gid') || '578404798'; // デフォルトはごほうびSPA
    
    // シート設定を取得
    const config = SHEET_CONFIGS[sheetGid];
    if (!config) {
      return NextResponse.json(
        {
          success: false,
          error: `不明なシートGID: ${sheetGid}`,
        },
        { status: 400 }
      );
    }
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // スプレッドシートの情報を取得してシートを特定
    const spreadsheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    
    // 指定されたGIDのシートを探す
    const sheetGidNum = parseInt(sheetGid, 10);
    let targetSheet = spreadsheetInfo.data.sheets?.find(
      (sheet) => sheet.properties?.sheetId === sheetGidNum
    );
    
    // GIDで見つからない場合は最初のシートを使用
    if (!targetSheet) {
      targetSheet = spreadsheetInfo.data.sheets?.[0];
    }
    
    if (!targetSheet || !targetSheet.properties?.title) {
      throw new Error('シートが見つかりません');
    }
    
    const sheetName = targetSheet.properties.title;
    
    // 設定に基づいて日付開始列を取得
    const dateStartCol = config.dateStartCol;
    const dateRow = 1; // 1行目
    
    // 11行目以降からキャスト名と出勤時間を取得
    const castNameCol = 'H'; // H列
    const startRow = 11; // 11行目
    
    // 十分な範囲を読み込む（最大100列、最大1000行）
    const maxCols = 100;
    const endCol = numberToColumn(columnToNumber(dateStartCol) + maxCols - 1);
    
    // 行1の日付範囲を取得
    const dateRange = `'${sheetName}'!${dateStartCol}${dateRow}:${endCol}${dateRow}`;
    const dateResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: dateRange,
    });
    
    // 日付を取得
    const dates: string[] = [];
    if (dateResponse.data.values && dateResponse.data.values[0]) {
      dateResponse.data.values[0].forEach((date: any) => {
        if (date) {
          dates.push(String(date));
        }
      });
    }
    
    // キャストデータの範囲を取得
    const maxRows = 1000;
    const dataRange = `'${sheetName}'!${castNameCol}${startRow}:${endCol}${startRow + maxRows}`;
    const dataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: dataRange,
    });
    
    const castData: Array<{
      name: string;
      schedule: Record<string, string>;
    }> = [];
    
    if (dataResponse.data.values) {
      // 各行を処理
      dataResponse.data.values.forEach((row: any[]) => {
        const castName = row[0] ? String(row[0]).trim() : '';
        
        // キャスト名が空の場合はスキップ
        if (!castName) {
          return;
        }
        
        const schedule: Record<string, string> = {};
        
        // H列は0番目、日付開始列は columnToNumber(dateStartCol) - columnToNumber('H') 番目から
        const dateStartIndex = columnToNumber(dateStartCol) - columnToNumber(castNameCol);
        
        // 各日付の出勤時間を取得
        dates.forEach((date, dateIndex) => {
          const colIndex = dateStartIndex + dateIndex;
          if (row[colIndex]) {
            const scheduleValue = String(row[colIndex]).trim();
            if (scheduleValue) {
              schedule[date] = scheduleValue;
            }
          }
        });
        
        castData.push({
          name: castName,
          schedule: schedule,
        });
      });
    }

        return NextResponse.json({
          success: true,
          sheetName: sheetName,
          dates: dates,
          casts: castData,
        });
      } catch (error: any) {
        console.error('Error fetching spreadsheet data:', error);
        
        // クォータエラーの場合は429ステータスを返す
        if (error.code === 429 || error.status === 429) {
          return NextResponse.json(
            {
              success: false,
              error: 'Google Sheets APIのクォータ制限に達しました。しばらく待ってから再度お試しください。',
              quotaExceeded: true,
            },
            { status: 429 }
          );
        }
        
        return NextResponse.json(
          {
            success: false,
            error: error.message || 'Failed to fetch spreadsheet data',
          },
          { status: 500 }
        );
      }
    }

