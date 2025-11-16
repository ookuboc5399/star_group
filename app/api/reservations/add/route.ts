import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

// 予約状況スプレッドシートID（受付データ用）
const RESERVATION_SPREADSHEET_ID = '1PrX2gckGPAiI8QBxTC_802hOos_dp6VD9oZjuNjD1b0';
const RESERVATION_SHEET_GID = '779969245';

// サービスアカウント認証情報の読み込み
function getAuth() {
  const credentialsPath = join(process.cwd(), 'roadtoentrepreneur-045990358137.json');
  const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));

  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// 列名を数値に変換する関数（A=0, B=1, ..., Z=25, AA=26, ...）
function columnToIndex(column: string): number {
  let result = 0;
  for (let i = 0; i < column.length; i++) {
    result = result * 26 + (column.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return result - 1; // 0ベースのインデックスに変換
}

// 営業時間に基づいてシート名を決定（10時〜翌朝5時は同じシート）
function getSheetNameForBusinessHours(dateParam: string | null): string {
  const now = new Date();
  const currentHour = now.getHours();
  
  // パラメータがあればそれを使用
  if (dateParam) {
    return dateParam;
  }
  
  // 5時から10時未満の場合は、前日のシートを使用
  if (currentHour >= 5 && currentHour < 10) {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const month = yesterday.getMonth() + 1;
    const day = yesterday.getDate();
    return `${month}/${day}`;
  }
  
  // 10時以降は当日のシートを使用
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return `${month}/${day}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      date, // MM/DD形式
      brand, // D列
      phone, // F列
      customerName, // H列
      memberType, // I列（F=新規、J=指名、S=本指名）
      castName, // O列
      startTime, // P列
      courseTime, // Q列
      extension, // R列
      amount, // T列
      actualStartTime, // U列
      endTime, // V列
      hotelLocation, // X列
      roomNumber, // Y列
      option, // AA列
      transportationFee, // AB列
      discountName, // AC列
      note, // AE列
      staff, // E列（担当）
    } = body;

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // スプレッドシートの情報を取得してシートを特定
    const spreadsheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: RESERVATION_SPREADSHEET_ID,
    });
    
    // 営業時間に基づいてシート名を決定
    const targetSheetName = getSheetNameForBusinessHours(date);
    
    // シート名で検索
    let targetSheet = spreadsheetInfo.data.sheets?.find(
      (sheet) => sheet.properties?.title === targetSheetName
    );
    
    // 見つからない場合は、GIDでフォールバック
    if (!targetSheet) {
      const sheetGidNum = parseInt(RESERVATION_SHEET_GID, 10);
      targetSheet = spreadsheetInfo.data.sheets?.find(
        (sheet) => sheet.properties?.sheetId === sheetGidNum
      );
    }
    
    if (!targetSheet || !targetSheet.properties?.title) {
      throw new Error(`シートが見つかりません: ${targetSheetName}`);
    }
    
    const sheetName = targetSheet.properties.title;
    
    // 「新規受付」を探し、その下の完全に空いている行を見つける
    // 複数の列（D, H, O, P, Q列など）をチェックして、既存の値がない行を確実に見つける
    const searchRange = `'${sheetName}'!D1:Q50`; // D列からQ列まで取得（主要な列をチェック、範囲を50行に縮小）
    const searchResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: RESERVATION_SPREADSHEET_ID,
      range: searchRange,
    });
    
    let insertRow = 13; // デフォルトは13行目（既存の受付データの開始行）
    let foundNewReception = false;
    
    if (searchResponse.data.values) {
      // 「新規受付」を探す（H列で完全一致）
      for (let i = 0; i < searchResponse.data.values.length; i++) {
        const row = searchResponse.data.values[i];
        const hColumnValue = row && row[4] ? String(row[4]).trim() : ''; // H列はD列から数えて4番目（D=0, E=1, F=2, G=3, H=4）
        
        if (hColumnValue === '新規受付') {
          foundNewReception = true;
          console.log(`[予約追加] 「新規受付」を${i + 1}行目で発見`);
          
          // 「新規受付」の下の行から完全に空いている行を探す
          for (let j = i + 1; j < searchResponse.data.values.length; j++) {
            const checkRow = searchResponse.data.values[j];
            if (!checkRow) {
              // 行が存在しない場合は空行とみなす
              insertRow = j + 1;
              console.log(`[予約追加] 空行を${insertRow}行目で発見（行データなし）`);
              break;
            }
            
            // 主要な列（D, H, O, P, Q列）がすべて空かチェック
            const dColumn = checkRow[0] ? String(checkRow[0]).trim() : ''; // D列
            const hColumn = checkRow[4] ? String(checkRow[4]).trim() : ''; // H列
            const oColumn = checkRow[11] ? String(checkRow[11]).trim() : ''; // O列（D=0...O=11）
            let pColumn = checkRow[12] ? String(checkRow[12]).trim() : ''; // P列（12）
            const qColumn = checkRow[13] ? String(checkRow[13]).trim() : ''; // Q列（13）
            
            // P列に":"だけが入っている場合は空として扱う
            if (pColumn === ':') {
              pColumn = '';
            }
            
            // すべての主要な列が空の場合のみ、その行に追加
            if (!dColumn && !hColumn && !oColumn && !pColumn && !qColumn) {
              insertRow = j + 1; // 1ベースの行番号
              console.log(`[予約追加] 空行を${insertRow}行目で発見（すべての主要列が空）`);
              break;
            } else {
              console.log(`[予約追加] ${j + 1}行目は既存の値があるためスキップ: D="${dColumn}", H="${hColumn}", O="${oColumn}", P="${pColumn}", Q="${qColumn}"`);
            }
          }
          
          // 空行が見つからなかった場合は、最後の行の次の行に追加
          if (insertRow === 13) {
            insertRow = searchResponse.data.values.length + 1;
            console.log(`[予約追加] 空行が見つからないため、最後の行の次の行（${insertRow}行目）に追加`);
          }
          break;
        }
      }
    }
    
    if (!foundNewReception) {
      // 「新規受付」が見つからない場合、最後の行の次の行に追加
      if (searchResponse.data.values) {
        insertRow = searchResponse.data.values.length + 1;
      }
      console.log(`[予約追加] 「新規受付」が見つからないため、${insertRow}行目に追加`);
    }
    
    // データを準備（列のインデックスに合わせて）
    const rowData: any[] = [];
    
    // D列（インデックス3）
    rowData[3] = brand || '';
    // E列（インデックス4）
    rowData[4] = staff || '';
    // F列（インデックス5）
    rowData[5] = phone || '';
    // H列（インデックス7）
    rowData[7] = customerName || '';
    // I列（インデックス8）
    // memberTypeは既にF、J、Sのいずれかが設定されている
    rowData[8] = memberType || '';
    
    // デバッグ用ログ
    console.log('会員区分:', memberType);
    // O列（インデックス14）
    rowData[14] = castName || '';
    // P列（インデックス15）
    rowData[15] = startTime || '';
    // Q列（インデックス16）
    rowData[16] = courseTime || '';
    // R列（インデックス17）
    rowData[17] = extension || '';
    // T列（インデックス19）
    rowData[19] = amount || '';
    // U列（インデックス20）
    rowData[20] = actualStartTime || '';
    // V列（インデックス21）
    rowData[21] = endTime || '';
    // X列（インデックス23）
    rowData[23] = hotelLocation || '';
    // Y列（インデックス24）
    rowData[24] = roomNumber || '';
    // AA列（インデックス26）
    rowData[26] = option || '';
    // AB列（インデックス27）
    rowData[27] = transportationFee || '';
    // AC列（インデックス28）
    rowData[28] = discountName || '';
    // AE列（インデックス30）
    rowData[30] = note || '';
    
    // スプレッドシートに書き込む
    const range = `'${sheetName}'!${insertRow}:${insertRow}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: RESERVATION_SPREADSHEET_ID,
      range: range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowData],
      },
    });

    return NextResponse.json({
      success: true,
      message: '予約が追加されました',
      row: insertRow,
    });
  } catch (error: any) {
    console.error('Error adding reservation:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to add reservation',
      },
      { status: 500 }
    );
  }
}

