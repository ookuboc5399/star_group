// 共通の型定義

export interface Reservation {
  shop: string;
  startHour: number;
  startMinute: number;
  duration: number;
  endHour: number;
  endMinute: number;
}

export interface Reception {
  brand: string;
  phone: string;
  customerName: string;
  memberType: string;
  castName: string;
  startTime: string;
  courseTime: number;
  amount: string;
  actualStartTime: string;
  endTime: string;
  hotelLocation: string;
  roomNumber: string;
  option: string;
  transportationFee: string;
  discountName: string;
  note: string;
  startMinutes: number | null;
  endMinutes: number | null;
  rowIndex?: number;
}

export interface ReceptionData {
  success: boolean;
  receptions?: Reception[];
  error?: string;
  debug?: {
    totalRows: number;
    validReceptions: number;
    skipped: number;
    skippedReasons: {
      noCastName: number;
      noStartTime: number;
      noCourseTime: number;
      multiple: number;
    };
    parseErrors: number;
  };
}

export interface Girl {
  name: string;
  nameGohobi?: string; // ごほうびSPAの名前
  nameGussuri?: string; // ぐっすり山田の名前
  reservations: Reservation[];
  isClosed: boolean;
}

export interface ReservationData {
  success: boolean;
  girls?: Girl[];
  error?: string;
}

export interface CastSchedule {
  name: string;
  schedule: Record<string, string>;
}

export interface SheetData {
  success: boolean;
  sheetName?: string;
  dates?: string[];
  casts?: CastSchedule[];
  error?: string;
}

// シート設定
export const SHEETS = [
  { gid: '578404798', name: 'ごほうびSPA' },
  { gid: '732669611', name: 'ぐっすり山田' },
  { gid: '935931778', name: '痴女性感' },
];

// 時間帯の設定（10時から翌5時まで）
export const HOURS = Array.from({ length: 20 }, (_, i) => 10 + i); // 10-29時（翌5時まで）
export const MINUTES_PER_HOUR = 60;
export const TOTAL_MINUTES = HOURS.length * MINUTES_PER_HOUR;

