import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

// 受付内容スプレッドシートID
const RECEPTION_SPREADSHEET_ID = '1PrX2gckGPAiI8QBxTC_802hOos_dp6VD9oZjuNjD1b0';
const RECEPTION_SHEET_GID = '779969245';

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

// 会員区分のマッピング
const MEMBER_TYPE: Record<string, string> = {
  'F': '新規',
  'J': '指名',
  'S': '本指名',
};

// 時間文字列を分に変換（例: "20:30" → 1230分（10時基準））
function timeStringToMinutes(timeStr: string): number | null {
  if (!timeStr) return null;
  
  // "20:30" や "20.5" などの形式に対応
  const timeStrClean = String(timeStr).trim();
  
  // "時:分" 形式
  const match1 = timeStrClean.match(/^(\d+):(\d+)$/);
  if (match1) {
    const hour = parseInt(match1[1], 10);
    const minute = parseInt(match1[2], 10);
    return timeToMinutes(hour, minute);
  }
  
  // "時.分" 形式（例: "20.5" = 20時30分）
  const match2 = timeStrClean.match(/^(\d+)\.(\d+)$/);
  if (match2) {
    const hour = parseInt(match2[1], 10);
    const minute = parseInt(match2[2], 10) * 6; // 0.5 = 30分
    return timeToMinutes(hour, minute);
  }
  
  // 数値のみ（例: "20" = 20時0分）
  const match3 = timeStrClean.match(/^(\d+)$/);
  if (match3) {
    const hour = parseInt(match3[1], 10);
    return timeToMinutes(hour, 0);
  }
  
  return null;
}

// 時間を分に変換（10時を基準とした分）
function timeToMinutes(hour: number, minute: number): number {
  const normalizedHour = hour >= 24 ? hour - 24 : hour;
  const baseHour = normalizedHour < 10 ? normalizedHour + 24 : normalizedHour;
  return (baseHour - 10) * 60 + minute;
}

// 日付パラメータに基づいてシート名を決定
// 日付パラメータが提供されている場合は、そのまま使用（例: 11/15 → "11/15"シート）
function getSheetNameForDate(dateParam: string | null): string {
  // パラメータがあれば、そのまま使用
  if (dateParam) {
    return dateParam;
  }
  
  // パラメータがない場合は、現在の日付を使用
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return `${month}/${day}`;
}

export async function GET(request: Request) {
  try {
    // クエリパラメータから日付を取得（MM/DD形式、例: "11/12"）
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // "11/12" 形式
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // スプレッドシートの情報を取得してシートを特定
    const spreadsheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: RECEPTION_SPREADSHEET_ID,
    });
    
    // 日付パラメータに基づいてシート名を決定
    const targetSheetName = getSheetNameForDate(dateParam);
    
    console.log(`[Reception API] 日付パラメータ: ${dateParam}, 対象シート名: ${targetSheetName}`);
    
    // シート名で検索
    let targetSheet = spreadsheetInfo.data.sheets?.find(
      (sheet) => sheet.properties?.title === targetSheetName
    );
    
    // 見つからない場合は、GIDでフォールバック
    if (!targetSheet) {
      const sheetGidNum = parseInt(RECEPTION_SHEET_GID, 10);
      targetSheet = spreadsheetInfo.data.sheets?.find(
        (sheet) => sheet.properties?.sheetId === sheetGidNum
      );
    }
    
    if (!targetSheet || !targetSheet.properties?.title) {
      throw new Error(`シートが見つかりません: ${targetSheetName}`);
    }
    
    const sheetName = targetSheet.properties.title;
    
    // 13行目以下からデータを取得
    // D列: ブランド名, F列: 電話番号, H列: お客様名, I列: 会員区分
    // O列: キャスト名, P列: 開始時間, Q列: コース時間
    // T列: 金額, U列: 実際に開始した時間, V列: 終了した時間
    // X列: ホテルの場所, Y列: 部屋番号
    // AA列: オプション, AB列: 交通費, AC列: 割引名, AE列: 備考
    const maxRows = 1000;
    const dataRange = `'${sheetName}'!D13:AE${13 + maxRows}`;
    
    const dataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: RECEPTION_SPREADSHEET_ID,
      range: dataRange,
    });
    
    const receptions: Array<{
      brand: string; // D列
      phone: string; // F列
      customerName: string; // H列
      memberType: string; // I列
      castName: string; // O列
      startTime: string; // P列
      courseTime: number; // Q列（分）
      amount: string; // T列
      actualStartTime: string; // U列
      endTime: string; // V列
      hotelLocation: string; // X列
      roomNumber: string; // Y列
      option: string; // AA列
      transportationFee: string; // AB列
      discountName: string; // AC列
      note: string; // AE列
      startMinutes: number | null; // 開始時間を分に変換
      endMinutes: number | null; // 終了時間を分に変換
    }> = [];
    
    let skippedCount = 0;
    let parseErrorCount = 0;
    const skippedReasons: { [key: string]: number } = {
      noCastName: 0,
      noStartTime: 0,
      noCourseTime: 0,
      multiple: 0,
    };
    
    if (dataResponse.data.values) {
      dataResponse.data.values.forEach((row: any[], rowIndex: number) => {
        // 必須項目（キャスト名、開始時間、コース時間）が空の場合はスキップ
        // D列から始まるので、O列は11番目（D=0, E=1, F=2, G=3, H=4, I=5, J=6, K=7, L=8, M=9, N=10, O=11）
        const castName = row[11] ? String(row[11]).trim() : ''; // O列
        const startTime = row[12] ? String(row[12]).trim() : ''; // P列
        const courseTime = row[13] ? String(row[13]).trim() : ''; // Q列
        
        // デバッグ: 「ななこ」や「まい」を含む受付データをログに出力
        if (castName && (castName.includes('ななこ') || castName.includes('まい'))) {
          console.log(`[Reception API] 受付データ: 行${rowIndex + 13}, キャスト名="${castName}", 開始時間="${startTime}", コース時間="${courseTime}"`);
        }
        
        if (!castName || !startTime || !courseTime) {
          skippedCount++;
          
          // スキップ理由を記録
          const missingFields: string[] = [];
          if (!castName) missingFields.push('キャスト名');
          if (!startTime) missingFields.push('開始時間');
          if (!courseTime) missingFields.push('コース時間');
          
          if (missingFields.length === 1) {
            if (missingFields[0] === 'キャスト名') skippedReasons.noCastName++;
            else if (missingFields[0] === '開始時間') skippedReasons.noStartTime++;
            else if (missingFields[0] === 'コース時間') skippedReasons.noCourseTime++;
          } else {
            skippedReasons.multiple++;
          }
          
          // 最初の10件だけ詳細ログを出力
          if (skippedCount <= 10) {
            console.log(`[Reception API] スキップ: 行${rowIndex + 13}, 不足項目=[${missingFields.join(', ')}], キャスト名="${castName}", 開始時間="${startTime}", コース時間="${courseTime}"`);
          }
          return;
        }
        
        const startMinutes = timeStringToMinutes(startTime);
        const courseTimeNum = parseInt(courseTime, 10);
        
        if (startMinutes === null || isNaN(courseTimeNum)) {
          parseErrorCount++;
          console.log(`[Reception API] パースエラー: 行${rowIndex + 13}, キャスト名=${castName}, 開始時間=${startTime}, コース時間=${courseTime}`);
          return;
        }
        
        const endMinutes = startMinutes + courseTimeNum;
        
        receptions.push({
          brand: row[0] ? String(row[0]).trim() : '', // D列
          phone: row[2] ? String(row[2]).trim() : '', // F列（D=0, E=1, F=2）
          customerName: row[4] ? String(row[4]).trim() : '', // H列（D=0, E=1, F=2, G=3, H=4）
          memberType: row[5] ? MEMBER_TYPE[String(row[5]).trim()] || String(row[5]).trim() : '', // I列（5）
          castName: castName,
          startTime: startTime,
          courseTime: courseTimeNum,
          amount: row[16] ? String(row[16]).trim() : '', // T列（D=0...T=16）
          actualStartTime: row[17] ? String(row[17]).trim() : '', // U列（17）
          endTime: row[18] ? String(row[18]).trim() : '', // V列（18）
          hotelLocation: row[20] ? String(row[20]).trim() : '', // X列（D=0...X=20）
          roomNumber: row[21] ? String(row[21]).trim() : '', // Y列（21）
          option: row[23] ? String(row[23]).trim() : '', // AA列（D=0...Z=22, AA=23）
          transportationFee: row[24] ? String(row[24]).trim() : '', // AB列（24）
          discountName: row[25] ? String(row[25]).trim() : '', // AC列（25）
          note: row[27] ? String(row[27]).trim() : '', // AE列（D=0...AD=26, AE=27）
          startMinutes: startMinutes,
          endMinutes: endMinutes,
          rowIndex: rowIndex, // 行番号（13行目から始まるので、実際の行番号は rowIndex + 13）
        });
      });
    }

    console.log(`[Reception API] 取得した受付データ: ${receptions.length}件, スキップ: ${skippedCount}件, パースエラー: ${parseErrorCount}件`);
    console.log(`[Reception API] スキップ理由の内訳:`, {
      キャスト名なし: skippedReasons.noCastName,
      開始時間なし: skippedReasons.noStartTime,
      コース時間なし: skippedReasons.noCourseTime,
      複数項目不足: skippedReasons.multiple,
    });
    
    return NextResponse.json({
      success: true,
      receptions: receptions,
      debug: {
        totalRows: dataResponse.data.values?.length || 0,
        validReceptions: receptions.length,
        skipped: skippedCount,
        skippedReasons: skippedReasons,
        parseErrors: parseErrorCount,
      },
    });
  } catch (error: any) {
    console.error('Error fetching reception data:', error);
    
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
        error: error.message || 'Failed to fetch reception data',
      },
      { status: 500 }
    );
  }
}

