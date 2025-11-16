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
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// 日付パラメータに基づいてシート名を決定
function getSheetNameForDate(dateParam: string | null): string {
  if (dateParam) {
    return dateParam;
  }
  
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return `${month}/${day}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      date, // MM/DD形式
      rowIndex, // 元の行番号（13行目から始まるので、実際の行番号は rowIndex + 13）
      brand, // D列
      phone, // F列
      customerName, // H列
      memberType, // I列（F=新規、J=指名、S=本指名）
      castName, // O列
      startTime, // P列
      courseTime, // Q列
      amount, // T列
      actualStartTime, // U列
      endTime, // V列
      hotelLocation, // X列
      roomNumber, // Y列
      option, // AA列
      transportationFee, // AB列
      discountName, // AC列
      note, // AE列
    } = body;

    if (!rowIndex) {
      return NextResponse.json(
        { error: '行番号が指定されていません' },
        { status: 400 }
      );
    }

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // スプレッドシートの情報を取得してシートを特定
    const spreadsheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: RECEPTION_SPREADSHEET_ID,
    });
    
    // 日付パラメータに基づいてシート名を決定
    const targetSheetName = getSheetNameForDate(date);
    
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
      return NextResponse.json(
        { error: `シートが見つかりません: ${targetSheetName}` },
        { status: 404 }
      );
    }
    
    const sheetName = targetSheet.properties.title;
    
    // 実際の行番号（13行目から始まるので、rowIndex + 13）
    const actualRow = rowIndex + 13;
    
    // 更新するデータを準備
    // D列から始まるので、各列のインデックスは：
    // D=0, E=1, F=2, G=3, H=4, I=5, J=6, K=7, L=8, M=9, N=10, O=11, P=12, Q=13
    // T=16, U=17, V=18, X=20, Y=21, AA=26, AB=27, AC=28, AE=30
    const rowData: any[] = [];
    
    // D列（ブランド名）
    rowData[0] = brand || '';
    // F列（電話番号）- D列から数えて2番目
    rowData[2] = phone || '';
    // H列（お客様名）- D列から数えて4番目
    rowData[4] = customerName || '';
    // I列（会員区分）- D列から数えて5番目
    rowData[5] = memberType || 'F';
    // O列（キャスト名）- D列から数えて11番目
    rowData[11] = castName || '';
    // P列（開始時間）- D列から数えて12番目
    rowData[12] = startTime || '';
    // Q列（コース時間）- D列から数えて13番目
    rowData[13] = courseTime || '';
    // T列（金額）- D列から数えて16番目
    rowData[16] = amount || '';
    // U列（実際に開始した時間）- D列から数えて17番目
    rowData[17] = actualStartTime || '';
    // V列（終了した時間）- D列から数えて18番目
    rowData[18] = endTime || '';
    // X列（ホテルの場所）- D列から数えて20番目
    rowData[20] = hotelLocation || '';
    // Y列（部屋番号）- D列から数えて21番目
    rowData[21] = roomNumber || '';
    // AA列（オプション）- D列から数えて26番目
    rowData[26] = option || '';
    // AB列（交通費）- D列から数えて27番目
    rowData[27] = transportationFee || '';
    // AC列（割引名）- D列から数えて28番目
    rowData[28] = discountName || '';
    // AE列（備考）- D列から数えて30番目
    rowData[30] = note || '';
    
    // スプレッドシートを更新
    await sheets.spreadsheets.values.update({
      spreadsheetId: RECEPTION_SPREADSHEET_ID,
      range: `'${sheetName}'!D${actualRow}:AE${actualRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowData],
      },
    });
    
    return NextResponse.json({
      success: true,
      message: '受付情報が更新されました',
    });
  } catch (error: any) {
    console.error('受付情報更新エラー:', error);
    
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
      { error: error.message || '受付情報の更新に失敗しました' },
      { status: 500 }
    );
  }
}

