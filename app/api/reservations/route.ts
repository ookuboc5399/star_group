import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

// 予約状況スプレッドシートID（予約状況表示用）
const RESERVATION_SPREADSHEET_ID = '1h6n771nzwqNxFp3O2L5yCROA5g36o0s3r7PMADyowLA';
const RESERVATION_SHEET_GID = '131484979';

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

// 店舗コードのマッピング
const SHOP_CODES: Record<string, string> = {
  'G': 'ごほうびSPA',
  'Y': 'ぐっすり山田',
  'C': '痴女性感',
};

// 予約情報をパースする関数
// 例: "G20-60" → { shop: "ごほうびSPA", startHour: 20, startMinute: 0, duration: 60 }
// 例: "Y22.5-150" → { shop: "ぐっすり山田", startHour: 22, startMinute: 30, duration: 150 }
function parseReservation(text: string): Array<{
  shop: string;
  startHour: number;
  startMinute: number;
  duration: number;
  endHour: number;
  endMinute: number;
}> {
  const reservations: Array<{
    shop: string;
    startHour: number;
    startMinute: number;
    duration: number;
    endHour: number;
    endMinute: number;
  }> = [];

  // セル内に複数の予約が含まれる可能性がある（改行やスペース区切り）
  // カンマ区切りも考慮
  const parts = text.split(/[\n\s,]+/).filter(part => part.trim());
  
  parts.forEach(part => {
    const trimmed = part.trim();
    // 店舗コード（1文字）+ 時間（時.分）- 分数
    // 例: G20-60, Y22.5-150
    const match = trimmed.match(/^([A-Z])(\d+(?:\.\d+)?)-(\d+)$/);
    if (match) {
      const shopCode = match[1];
      const timeStr = match[2];
      const duration = parseInt(match[3], 10);
      
      const shop = SHOP_CODES[shopCode] || shopCode;
      const time = parseFloat(timeStr);
      const startHour = Math.floor(time);
      // 小数点部分を分に変換（0.5 = 30分）
      const startMinute = Math.round((time - startHour) * 60);
      
      // 終了時間を計算
      const startTotalMinutes = startHour * 60 + startMinute;
      const endTotalMinutes = startTotalMinutes + duration;
      const endHour = Math.floor(endTotalMinutes / 60);
      const endMinute = endTotalMinutes % 60;
      
      // 24時を超える場合は翌日扱い（表示用に24時間形式を維持）
      const displayEndHour = endHour >= 24 ? endHour : endHour;
      
      reservations.push({
        shop,
        startHour,
        startMinute,
        duration,
        endHour: displayEndHour,
        endMinute,
      });
    }
  });
  
  return reservations;
}

// 営業時間に基づいてシート名を決定（10時〜翌朝5時は同じシート）
function getSheetNameForBusinessHours(dateParam: string | null): string {
  const now = new Date();
  const currentHour = now.getHours();
  
  // パラメータがあれば、営業時間に基づいて調整
  if (dateParam) {
    // 日付文字列をパース（MM/DD形式）
    const [monthStr, dayStr] = dateParam.split('/');
    const paramMonth = parseInt(monthStr, 10);
    const paramDay = parseInt(dayStr, 10);
    
    // 選択された日付の0時を基準に作成
    const paramDate = new Date(now.getFullYear(), paramMonth - 1, paramDay, 0, 0, 0);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    
    // 選択された日付が今日の場合
    if (paramDate.getTime() === today.getTime()) {
      // 現在時刻が5時未満の場合は、前日のシートを使用（11/13の朝5時までは11/12のシート）
      if (currentHour < 5) {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const month = yesterday.getMonth() + 1;
        const day = yesterday.getDate();
        return `${month}/${day}`;
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
      return dateParam;
    }
    
    // 選択された日付が今日より後の場合
    if (paramDate > today) {
      // 選択された日付の前日のシートを使用（営業時間の関係で、11/13の朝5時までは11/12のシート）
      const prevDate = new Date(paramDate);
      prevDate.setDate(paramDate.getDate() - 1);
      const month = prevDate.getMonth() + 1;
      const day = prevDate.getDate();
      return `${month}/${day}`;
    }
    
    // 選択された日付が過去の場合
    return dateParam;
  }
  
  // パラメータがない場合
  // 5時未満の場合は、前日のシートを使用（11/13の朝5時までは11/12のシート）
  if (currentHour < 5) {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const month = yesterday.getMonth() + 1;
    const day = yesterday.getDate();
    return `${month}/${day}`;
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

export async function GET(request: Request) {
  try {
    // クエリパラメータから日付を取得（MM/DD形式、例: "11/12"）
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // "11/12" 形式
    
    console.log(`[Reservation API] 日付パラメータ: ${dateParam}`);
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // スプレッドシートの情報を取得してシートを特定
    const spreadsheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: RESERVATION_SPREADSHEET_ID,
    });
    
    // 「五GY」と「五C」のシートを取得
    const sheetGY = spreadsheetInfo.data.sheets?.find(
      (sheet) => sheet.properties?.title === '五GY'
    );
    const sheetC = spreadsheetInfo.data.sheets?.find(
      (sheet) => sheet.properties?.title === '五C'
    );
    
    if (!sheetGY || !sheetC) {
      throw new Error('シート「五GY」または「五C」が見つかりません');
    }
    
    const sheetNameGY = sheetGY.properties!.title;
    const sheetNameC = sheetC.properties!.title;
    
    // 「五GY」シートから取得（ごほうびSPAとぐっすり山田）
    // H5から下にごほうびSPAの名前、I列にぐっすり山田の名前、S列からW列に予約状況
    const maxRows = 100;
    const nameRangeGY = `'${sheetNameGY}'!H5:I${5 + maxRows}`; // H列とI列の両方を取得
    const reservationRangeGY = `'${sheetNameGY}'!S5:W${5 + maxRows}`;
    
    // 「五C」シートから取得（痴女性感）
    const nameRangeC = `'${sheetNameC}'!H5:H${5 + maxRows}`; // H列のみ（痴女性感は1列のみ）
    const reservationRangeC = `'${sheetNameC}'!S5:W${5 + maxRows}`;
    
    // 「五GY」シートのデータを取得
    const [nameResponseGY, reservationResponseGY] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: RESERVATION_SPREADSHEET_ID,
        range: nameRangeGY,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: RESERVATION_SPREADSHEET_ID,
        range: reservationRangeGY,
      }),
    ]);
    
    // 「五C」シートのデータを取得
    const [nameResponseC, reservationResponseC] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: RESERVATION_SPREADSHEET_ID,
        range: nameRangeC,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: RESERVATION_SPREADSHEET_ID,
        range: reservationRangeC,
      }),
    ]);
    
    const girls: Array<{
      name: string;
      nameGohobi?: string; // ごほうびSPAの名前
      nameGussuri?: string; // ぐっすり山田の名前
      reservations: Array<{
        shop: string;
        startHour: number;
        startMinute: number;
        duration: number;
        endHour: number;
        endMinute: number;
      }>;
      isClosed: boolean;
    }> = [];
    
    // 「五GY」シートのデータを処理
    if (nameResponseGY.data.values && reservationResponseGY.data.values) {
        nameResponseGY.data.values.forEach((nameRow, index) => {
          const nameGohobi = nameRow[0] ? String(nameRow[0]).trim() : ''; // H列：ごほうびSPA
          const nameGussuri = nameRow[1] ? String(nameRow[1]).trim() : ''; // I列：ぐっすり山田
          
          // デバッグ: 「ねね」を含む行をすべてログに出力
          if ((nameGohobi && nameGohobi.includes('ねね')) || (nameGussuri && nameGussuri.includes('ねね'))) {
            console.log(`[全行チェック] 行${index + 5}: ごほうび="${nameGohobi}", ぐっすり="${nameGussuri}"`);
          }
          
          // デバッグ: 「ななこ」や「まい」を含む予約データをログに出力
          if ((nameGohobi && (nameGohobi.includes('ななこ') || nameGohobi.includes('まい'))) ||
              (nameGussuri && (nameGussuri.includes('ななこ') || nameGussuri.includes('まい')))) {
            console.log(`[Reservation API] 予約データ: 行${index + 5}, ごほうび="${nameGohobi}", ぐっすり="${nameGussuri}"`);
          }
        
        // ▼受付終了▼マーカーを検出（この行が「受付終了」マーカーかどうか）
        const isClosedMarker = nameGohobi.includes('▼受付終了▼') || nameGohobi.includes('受付終了') ||
            nameGussuri.includes('▼受付終了▼') || nameGussuri.includes('受付終了');
        
        // 「受付終了」マーカーの行自体はスキップ
        if (isClosedMarker) {
          return;
        }
        
        // どちらかの名前が空の場合はスキップ
        if (!nameGohobi && !nameGussuri) {
          // デバッグ: 「ねね」を含む行がスキップされる場合をログに出力
          if ((nameGohobi && nameGohobi.includes('ねね')) || (nameGussuri && nameGussuri.includes('ねね'))) {
            console.log(`[全行チェック] 行${index + 5}: 名前が空のためスキップ: ごほうび="${nameGohobi}", ぐっすり="${nameGussuri}"`);
          }
          return;
        }
        
        // 名前を正規化する関数（重複チェック用）
        const normalizeName = (name: string): string => {
          if (!name) return '';
          let normalized = String(name).trim();
          // 「ご　」「ぐ　」「ご 」「ぐ 」「ご」「ぐ」などのプレフィックスを除去
          normalized = normalized.replace(/^[ごぐ][\s　]*/, '').trim();
          if (normalized.includes('/')) {
            normalized = normalized.split('/')[0].trim();
            normalized = normalized.replace(/^[ごぐ][\s　]*/, '').trim();
          }
          return normalized;
        };
        
        // 正規化した名前を取得
        const normalizedGohobi = normalizeName(nameGohobi);
        const normalizedGussuri = normalizeName(nameGussuri);
        
        // デバッグ: 「ねね」を含む行をログに出力
        if (normalizedGohobi === 'ねね' || normalizedGussuri === 'ねね') {
          console.log(`[重複チェック] 行${index + 5}: ごほうび="${nameGohobi}" (正規化: "${normalizedGohobi}"), ぐっすり="${nameGussuri}" (正規化: "${normalizedGussuri}")`);
          console.log(`[重複チェック] 現在のgirls配列: ${girls.length}件`);
          girls.forEach((g, i) => {
            const gNormGohobi = normalizeName(g.nameGohobi || '');
            const gNormGussuri = normalizeName(g.nameGussuri || '');
            if (gNormGohobi === 'ねね' || gNormGussuri === 'ねね') {
              console.log(`[重複チェック] 既存エントリ[${i}]: name="${g.name}", nameGohobi="${g.nameGohobi}" (正規化: "${gNormGohobi}"), nameGussuri="${g.nameGussuri}" (正規化: "${gNormGussuri}")`);
            }
          });
          // すべての既存エントリをログに出力（デバッグ用）
          console.log(`[重複チェック] すべての既存エントリ:`);
          girls.forEach((g, i) => {
            const gNormGohobi = normalizeName(g.nameGohobi || '');
            const gNormGussuri = normalizeName(g.nameGussuri || '');
            console.log(`  [${i}] name="${g.name}", nameGohobi="${g.nameGohobi}" (正規化: "${gNormGohobi}"), nameGussuri="${g.nameGussuri}" (正規化: "${gNormGussuri}")`);
          });
        }
        
        // 既存の女の子を探す（正規化した名前で比較）
        // より確実に重複を検出するため、以下の条件で検索：
        // 1. ごほうびの名前が一致する場合（最も重要：同じごほうびの名前を持つエントリは同じ人物）
        // 2. ぐっすりの名前が一致する場合
        // 3. 両方の名前が一致する場合
        let existingGirl = girls.find(g => {
          const existingNormalizedGohobi = normalizeName(g.nameGohobi || '');
          const existingNormalizedGussuri = normalizeName(g.nameGussuri || '');
          
          // ごほうびの名前が一致する場合（最も重要：同じごほうびの名前を持つエントリは同じ人物）
          if (normalizedGohobi && existingNormalizedGohobi && normalizedGohobi === existingNormalizedGohobi) {
            return true;
          }
          // ぐっすりの名前が一致する場合
          if (normalizedGussuri && existingNormalizedGussuri && normalizedGussuri === existingNormalizedGussuri) {
            return true;
          }
          // 両方の名前が一致する場合
          if (normalizedGohobi && normalizedGussuri && 
              existingNormalizedGohobi && existingNormalizedGussuri &&
              normalizedGohobi === existingNormalizedGohobi && 
              normalizedGussuri === existingNormalizedGussuri) {
            return true;
          }
          return false;
        });
        
        // デバッグ: 「ねね」を含む行で、既存エントリの検索結果を詳細にログ出力
        if (normalizedGohobi === 'ねね' || normalizedGussuri === 'ねね') {
          console.log(`[重複チェック] 行${index + 5}: 既存エントリ検索 - normalizedGohobi="${normalizedGohobi}", normalizedGussuri="${normalizedGussuri}"`);
          girls.forEach((g, i) => {
            const existingNormalizedGohobi = normalizeName(g.nameGohobi || '');
            const existingNormalizedGussuri = normalizeName(g.nameGussuri || '');
            const matchGohobi = normalizedGohobi && existingNormalizedGohobi && normalizedGohobi === existingNormalizedGohobi;
            const matchGussuri = normalizedGussuri && existingNormalizedGussuri && normalizedGussuri === existingNormalizedGussuri;
            if (matchGohobi || matchGussuri) {
              console.log(`[重複チェック] 行${index + 5}: 既存エントリ[${i}]と一致 - matchGohobi=${matchGohobi}, matchGussuri=${matchGussuri}`);
            }
          });
        }
        
        // デバッグ: 「ねね」を含む行をログに出力
        if (normalizedGohobi === 'ねね' || normalizedGussuri === 'ねね') {
          if (existingGirl) {
            console.log(`[重複チェック] 行${index + 5}: 既存エントリが見つかりました: name="${existingGirl.name}", nameGohobi="${existingGirl.nameGohobi}", nameGussuri="${existingGirl.nameGussuri}"`);
          } else {
            console.log(`[重複チェック] 行${index + 5}: 既存エントリが見つかりませんでした`);
          }
        }
        
        // 表示用の名前を決定（両方ある場合は両方表示、片方だけの場合はその名前）
        let displayName = '';
        if (nameGohobi && nameGussuri) {
          displayName = `${nameGohobi} / ${nameGussuri}`;
        } else {
          displayName = nameGohobi || nameGussuri;
        }
        
        const reservations: Array<{
          shop: string;
          startHour: number;
          startMinute: number;
          duration: number;
          endHour: number;
          endMinute: number;
        }> = [];
        
        // 対応する予約状況を取得（S-W列、5列分）
        if (reservationResponseGY.data.values && reservationResponseGY.data.values[index]) {
          reservationResponseGY.data.values[index].forEach((cell: any) => {
            if (cell) {
              const cellText = String(cell).trim();
              const parsed = parseReservation(cellText);
              reservations.push(...parsed);
            }
          });
        }
        
        // 日付と出勤時間に基づいて「受付終了」を判定
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        // 営業時間を考慮した「今日」の日付を取得
        const businessToday = currentHour < 5 
          ? (() => {
              const yesterday = new Date(now);
              yesterday.setDate(now.getDate() - 1);
              return new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
            })()
          : (currentHour >= 5 && currentHour < 10 
            ? (() => {
                const yesterday = new Date(now);
                yesterday.setDate(now.getDate() - 1);
                return new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
              })()
            : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0));
        
        // 選択された日付を取得
        let isPastDate = false;
        let selectedDateObj: Date | null = null;
        if (dateParam) {
          const [monthStr, dayStr] = dateParam.split('/');
          const paramMonth = parseInt(monthStr, 10);
          const paramDay = parseInt(dayStr, 10);
          selectedDateObj = new Date(now.getFullYear(), paramMonth - 1, paramDay, 0, 0, 0);
          isPastDate = selectedDateObj < businessToday;
        }
        
        // 未来の日付の場合は「受付終了」にしない
        const isFutureDate = selectedDateObj && selectedDateObj > businessToday;
        
        // 過去の日付の場合、出勤時間が現在時刻より前かどうかを判定
        let isClosed = false;
        if (isPastDate && dateParam) {
          // 出勤時間のデータを取得する必要があるが、ここでは簡易的に判定
          // 実際の出勤時間はフロントエンドで判定する方が正確
          // ここでは、過去の日付の場合は一旦falseにしておく（フロントエンドで判定）
          isClosed = false;
        } else if (isFutureDate) {
          isClosed = false;
        }
        
        // 既存の女の子が見つかり、かつ既に両方のブランド名がある場合、
        // 片方だけのブランド名の行はスキップする
        if (existingGirl && existingGirl.nameGohobi && existingGirl.nameGussuri) {
          // 既に両方のブランド名がある場合、片方だけの行は追加しない
          if ((normalizedGohobi && !normalizedGussuri) || (!normalizedGohobi && normalizedGussuri)) {
            // デバッグ: 「ねね」を含む行をログに出力
            if (normalizedGohobi === 'ねね' || normalizedGussuri === 'ねね') {
              console.log(`[重複チェック] 行${index + 5}: 既存エントリに両方のブランド名があるため、片方だけの行をスキップ`);
            }
            // ただし、予約情報がある場合は既存のエントリにマージする
            if (reservations.length > 0) {
              reservations.forEach(newRes => {
                const isDuplicate = existingGirl!.reservations.some(existingRes =>
                  existingRes.shop === newRes.shop &&
                  existingRes.startHour === newRes.startHour &&
                  existingRes.startMinute === newRes.startMinute &&
                  existingRes.duration === newRes.duration
                );
                if (!isDuplicate) {
                  existingGirl!.reservations.push(newRes);
                }
              });
              if (isClosed) {
                existingGirl.isClosed = true;
              }
            }
            return; // この行をスキップ
          }
        }
        
        // 既存の女の子が見つかり、名前が完全に一致する場合（重複行）はスキップ
        if (existingGirl) {
          const existingNormalizedGohobi = normalizeName(existingGirl.nameGohobi || '');
          const existingNormalizedGussuri = normalizeName(existingGirl.nameGussuri || '');
          
          // 両方の名前が完全に一致する場合（重複行）はスキップ
          if (normalizedGohobi && normalizedGussuri && 
              existingNormalizedGohobi && existingNormalizedGussuri &&
              normalizedGohobi === existingNormalizedGohobi && 
              normalizedGussuri === existingNormalizedGussuri) {
            // 予約情報がある場合は既存のエントリにマージする
            if (reservations.length > 0) {
              reservations.forEach(newRes => {
                const isDuplicate = existingGirl!.reservations.some(existingRes =>
                  existingRes.shop === newRes.shop &&
                  existingRes.startHour === newRes.startHour &&
                  existingRes.startMinute === newRes.startMinute &&
                  existingRes.duration === newRes.duration
                );
                if (!isDuplicate) {
                  existingGirl!.reservations.push(newRes);
                }
              });
              if (isClosed) {
                existingGirl.isClosed = true;
              }
            }
            return; // この行をスキップ（重複行）
          }
          
          // 片方の名前だけが一致し、かつ既存のエントリも片方の名前だけの場合
          // （例：「ご　ねね」と「ご　ねね」が重複している場合）
          if (normalizedGohobi && !normalizedGussuri && 
              existingNormalizedGohobi && !existingNormalizedGussuri &&
              normalizedGohobi === existingNormalizedGohobi) {
            // デバッグ: 「ねね」を含む行をログに出力
            if (normalizedGohobi === 'ねね') {
              console.log(`[重複チェック] 行${index + 5}: 既存エントリと片方の名前が一致するため、重複行をスキップ`);
            }
            // 予約情報がある場合は既存のエントリにマージする
            if (reservations.length > 0) {
              reservations.forEach(newRes => {
                const isDuplicate = existingGirl!.reservations.some(existingRes =>
                  existingRes.shop === newRes.shop &&
                  existingRes.startHour === newRes.startHour &&
                  existingRes.startMinute === newRes.startMinute &&
                  existingRes.duration === newRes.duration
                );
                if (!isDuplicate) {
                  existingGirl!.reservations.push(newRes);
                }
              });
              if (isClosed) {
                existingGirl.isClosed = true;
              }
            }
            return; // この行をスキップ（重複行）
          }
          
          if (normalizedGussuri && !normalizedGohobi && 
              existingNormalizedGussuri && !existingNormalizedGohobi &&
              normalizedGussuri === existingNormalizedGussuri) {
            // 予約情報がある場合は既存のエントリにマージする
            if (reservations.length > 0) {
              reservations.forEach(newRes => {
                const isDuplicate = existingGirl!.reservations.some(existingRes =>
                  existingRes.shop === newRes.shop &&
                  existingRes.startHour === newRes.startHour &&
                  existingRes.startMinute === newRes.startMinute &&
                  existingRes.duration === newRes.duration
                );
                if (!isDuplicate) {
                  existingGirl!.reservations.push(newRes);
                }
              });
              if (isClosed) {
                existingGirl.isClosed = true;
              }
            }
            return; // この行をスキップ（重複行）
          }
        }
        
        if (existingGirl) {
          // 既存の女の子が見つかった場合、情報をマージ
          // デバッグ: 「ねね」を含む行をログに出力
          if (normalizedGohobi === 'ねね' || normalizedGussuri === 'ねね') {
            console.log(`[重複チェック] 行${index + 5}: 既存エントリにマージ: 既存="${existingGirl.name}", 現在="${displayName}"`);
          }
          
          // nameGohobiとnameGussuriを更新（空でない場合は上書き）
          if (nameGohobi && !existingGirl.nameGohobi) {
            existingGirl.nameGohobi = nameGohobi;
          }
          if (nameGussuri && !existingGirl.nameGussuri) {
            existingGirl.nameGussuri = nameGussuri;
          }
          // 既存のエントリに両方の名前がある場合、現在の行の名前も更新（より完全な情報を優先）
          if (nameGohobi && nameGussuri) {
            existingGirl.nameGohobi = nameGohobi;
            existingGirl.nameGussuri = nameGussuri;
          }
          
          // 予約をマージ（重複を避ける）
          reservations.forEach(newRes => {
            const isDuplicate = existingGirl!.reservations.some(existingRes =>
              existingRes.shop === newRes.shop &&
              existingRes.startHour === newRes.startHour &&
              existingRes.startMinute === newRes.startMinute &&
              existingRes.duration === newRes.duration
            );
            if (!isDuplicate) {
              existingGirl!.reservations.push(newRes);
            }
          });
          // isClosedを更新（既にtrueの場合は維持、falseの場合は更新）
          if (isClosed) {
            existingGirl.isClosed = true;
          }
          // 表示名を更新（両方の名前がある場合は更新）
          if (existingGirl.nameGohobi && existingGirl.nameGussuri) {
            existingGirl.name = `${existingGirl.nameGohobi} / ${existingGirl.nameGussuri}`;
          } else if (nameGohobi && nameGussuri) {
            existingGirl.name = `${nameGohobi} / ${nameGussuri}`;
          } else if (nameGohobi && !existingGirl.nameGohobi) {
            existingGirl.name = displayName;
          } else if (nameGussuri && !existingGirl.nameGussuri) {
            existingGirl.name = displayName;
          }
          
          // マージしたので、この行はスキップ（新しいエントリとして追加しない）
          return;
        } else {
          // 新しい女の子を追加
          // デバッグ: 「ねね」を含む行をログに出力
          if (normalizedGohobi === 'ねね' || normalizedGussuri === 'ねね') {
            console.log(`[重複チェック] 行${index + 5}: 新しいエントリとして追加: name="${displayName}", nameGohobi="${nameGohobi}", nameGussuri="${nameGussuri}"`);
          }
          girls.push({
            name: displayName,
            nameGohobi: nameGohobi || undefined,
            nameGussuri: nameGussuri || undefined,
            reservations,
            isClosed: isClosed,
          });
        }
      });
    }
    
    // 「五C」シートのデータを処理（痴女性感）
    if (nameResponseC.data.values && reservationResponseC.data.values) {
      nameResponseC.data.values.forEach((nameRow, index) => {
        const nameChijo = nameRow[0] ? String(nameRow[0]).trim() : ''; // H列：痴女性感
        
        // 名前が空の場合はスキップ
        if (!nameChijo) {
          return;
        }
        
        const reservations: Array<{
          shop: string;
          startHour: number;
          startMinute: number;
          duration: number;
          endHour: number;
          endMinute: number;
        }> = [];
        
        // 対応する予約状況を取得（S-W列、5列分）
        if (reservationResponseC.data.values && reservationResponseC.data.values[index]) {
          reservationResponseC.data.values[index].forEach((cell: any) => {
            if (cell) {
              const cellText = String(cell).trim();
              const parsed = parseReservation(cellText);
              reservations.push(...parsed);
            }
          });
        }
        
        // 日付と出勤時間に基づいて「受付終了」を判定
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        // 営業時間を考慮した「今日」の日付を取得
        const businessToday = currentHour < 5 
          ? (() => {
              const yesterday = new Date(now);
              yesterday.setDate(now.getDate() - 1);
              return new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
            })()
          : (currentHour >= 5 && currentHour < 10 
            ? (() => {
                const yesterday = new Date(now);
                yesterday.setDate(now.getDate() - 1);
                return new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
              })()
            : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0));
        
        // 選択された日付を取得
        let isPastDate = false;
        let selectedDateObj: Date | null = null;
        if (dateParam) {
          const [monthStr, dayStr] = dateParam.split('/');
          const paramMonth = parseInt(monthStr, 10);
          const paramDay = parseInt(dayStr, 10);
          selectedDateObj = new Date(now.getFullYear(), paramMonth - 1, paramDay, 0, 0, 0);
          isPastDate = selectedDateObj < businessToday;
        }
        
        // 未来の日付の場合は「受付終了」にしない
        const isFutureDate = selectedDateObj && selectedDateObj > businessToday;
        
        // 過去の日付の場合、出勤時間が現在時刻より前かどうかを判定
        let isClosed = false;
        if (isPastDate && dateParam) {
          isClosed = false;
        } else if (isFutureDate) {
          isClosed = false;
        }
        
        girls.push({
          name: nameChijo,
          nameGohobi: undefined,
          nameGussuri: undefined,
          reservations,
          isClosed: isClosed,
        });
      });
    }

    // 最終的な重複チェックとマージ処理
    // 処理順序に関係なく、同じ人物のエントリをマージする
    const normalizeName = (name: string): string => {
      if (!name) return '';
      let normalized = String(name).trim();
      normalized = normalized.replace(/^[ごぐ][\s　]*/, '').trim();
      if (normalized.includes('/')) {
        normalized = normalized.split('/')[0].trim();
        normalized = normalized.replace(/^[ごぐ][\s　]*/, '').trim();
      }
      return normalized;
    };
    
    const mergedGirls: typeof girls = [];
    const processedIndices = new Set<number>();
    
    girls.forEach((girl, index) => {
      if (processedIndices.has(index)) {
        return; // 既にマージ済み
      }
      
      const normalizedGohobi = normalizeName(girl.nameGohobi || '');
      const normalizedGussuri = normalizeName(girl.nameGussuri || '');
      
      // 同じ人物のエントリを探す
      const duplicateIndices: number[] = [index];
      for (let i = index + 1; i < girls.length; i++) {
        if (processedIndices.has(i)) {
          continue;
        }
        
        const otherGirl = girls[i];
        const otherNormalizedGohobi = normalizeName(otherGirl.nameGohobi || '');
        const otherNormalizedGussuri = normalizeName(otherGirl.nameGussuri || '');
        
        // ごほうびの名前が一致する場合（最も重要：同じごほうびの名前を持つエントリは同じ人物）
        if (normalizedGohobi && otherNormalizedGohobi && normalizedGohobi === otherNormalizedGohobi) {
          duplicateIndices.push(i);
          processedIndices.add(i);
        }
        // ぐっすりの名前が一致する場合
        else if (normalizedGussuri && otherNormalizedGussuri && normalizedGussuri === otherNormalizedGussuri) {
          duplicateIndices.push(i);
          processedIndices.add(i);
        }
      }
      
      // 重複エントリをマージ
      if (duplicateIndices.length > 1) {
        // デバッグ: 「ねね」を含む重複をログに出力
        if (normalizedGohobi === 'ねね' || normalizedGussuri === 'ねね') {
          console.log(`[最終重複チェック] 重複エントリをマージ: ${duplicateIndices.length}件`);
          duplicateIndices.forEach(idx => {
            console.log(`  [${idx}] name="${girls[idx].name}", nameGohobi="${girls[idx].nameGohobi}", nameGussuri="${girls[idx].nameGussuri}"`);
          });
        }
        
        // マージされたエントリを作成
        const mergedGirl = { ...girl };
        duplicateIndices.slice(1).forEach(idx => {
          const duplicateGirl = girls[idx];
          // より完全な情報を優先
          if (duplicateGirl.nameGohobi && !mergedGirl.nameGohobi) {
            mergedGirl.nameGohobi = duplicateGirl.nameGohobi;
          }
          if (duplicateGirl.nameGussuri && !mergedGirl.nameGussuri) {
            mergedGirl.nameGussuri = duplicateGirl.nameGussuri;
          }
          if (duplicateGirl.nameGohobi && duplicateGirl.nameGussuri) {
            mergedGirl.nameGohobi = duplicateGirl.nameGohobi;
            mergedGirl.nameGussuri = duplicateGirl.nameGussuri;
          }
          // 予約をマージ
          duplicateGirl.reservations.forEach(newRes => {
            const isDuplicate = mergedGirl.reservations.some(existingRes =>
              existingRes.shop === newRes.shop &&
              existingRes.startHour === newRes.startHour &&
              existingRes.startMinute === newRes.startMinute &&
              existingRes.duration === newRes.duration
            );
            if (!isDuplicate) {
              mergedGirl.reservations.push(newRes);
            }
          });
          // isClosedを更新
          if (duplicateGirl.isClosed) {
            mergedGirl.isClosed = true;
          }
        });
        
        // 表示名を更新
        if (mergedGirl.nameGohobi && mergedGirl.nameGussuri) {
          mergedGirl.name = `${mergedGirl.nameGohobi} / ${mergedGirl.nameGussuri}`;
        } else if (mergedGirl.nameGohobi) {
          mergedGirl.name = mergedGirl.nameGohobi;
        } else if (mergedGirl.nameGussuri) {
          mergedGirl.name = mergedGirl.nameGussuri;
        }
        
        mergedGirls.push(mergedGirl);
        processedIndices.add(index);
      } else {
        mergedGirls.push(girl);
        processedIndices.add(index);
      }
    });
    
    // デバッグ: マージ前後の数をログに出力
    if (girls.length !== mergedGirls.length) {
      console.log(`[最終重複チェック] マージ前: ${girls.length}件, マージ後: ${mergedGirls.length}件`);
    }
    
    return NextResponse.json({
      success: true,
      girls: mergedGirls,
    });
  } catch (error: any) {
        console.error('Error fetching reservation data:', error);
        
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
            error: error.message || 'Failed to fetch reservation data',
          },
          { status: 500 }
        );
      }
    }

