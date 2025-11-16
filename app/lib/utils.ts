// 共通のユーティリティ関数

// 時間を分に変換（10時を基準とした分）
export function timeToMinutes(hour: number, minute: number): number {
  // 24時を超える場合は翌日扱い
  const normalizedHour = hour >= 24 ? hour - 24 : hour;
  // 10時未満は翌日扱い（例：2時は26時として扱う）
  const baseHour = normalizedHour < 10 ? normalizedHour + 24 : normalizedHour;
  return (baseHour - 10) * 60 + minute;
}

// 分を時間表示に変換
export function minutesToTime(minutes: number): string {
  const hour = Math.floor(minutes / 60) + 10;
  const minute = minutes % 60;
  const displayHour = hour >= 24 ? hour - 24 : hour;
  return `${displayHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

// 日付をMM/DD形式に変換
export function formatDate(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}/${day}`;
}

// 営業時間に基づいて表示用の日付を取得（10時〜翌朝5時は同じ日として扱う）
export function getBusinessDate(date: Date): Date {
  const hour = date.getHours();
  // 5時未満の場合は、前日として扱う（11/13の4時は11/12の営業時間内）
  if (hour < 5) {
    const prevDate = new Date(date);
    prevDate.setDate(date.getDate() - 1);
    return prevDate;
  }
  // 5時から10時未満の場合は、前日として扱う
  if (hour >= 5 && hour < 10) {
    const prevDate = new Date(date);
    prevDate.setDate(date.getDate() - 1);
    return prevDate;
  }
  return date;
}

// 日付オプションを生成（今日、明日、明後日など）
export function getDateOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  
  // 営業時間を考慮した「今日」の日付を取得
  const businessDate = getBusinessDate(now);
  const businessDateStr = formatDate(businessDate);
  
  // 営業日を基準に7日分のオプションを生成
  for (let i = 0; i < 7; i++) {
    const date = new Date(businessDate);
    date.setDate(businessDate.getDate() + i);
    const dateStr = formatDate(date);
    let label = '';
    
    if (i === 0) {
      label = `今日 (${dateStr})`;
    } else if (i === 1) {
      label = `明日 (${dateStr})`;
    } else {
      const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
      const weekday = weekdays[date.getDay()];
      label = `${dateStr} (${weekday})`;
    }
    
    options.push({ value: dateStr, label });
  }
  
  return options;
}

// 現在時刻を分単位で取得（10時基準）
export function getCurrentTimeMinutes(): number {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  return timeToMinutes(hour, minute);
}

