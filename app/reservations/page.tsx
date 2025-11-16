'use client';

import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import Link from 'next/link';
import {
  Reservation,
  Reception,
  ReceptionData,
  Girl,
  ReservationData,
  SheetData,
  HOURS,
  TOTAL_MINUTES,
} from '@/app/lib/types';
import {
  timeToMinutes,
  minutesToTime,
  formatDate,
  getBusinessDate,
  getDateOptions,
  getCurrentTimeMinutes,
} from '@/app/lib/utils';

export default function ReservationsPage() {
  // 予約状況用の状態（営業時間を考慮した日付を初期値とする）
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    const businessDate = getBusinessDate(now);
    return formatDate(businessDate);
  });
  const [data, setData] = useState<ReservationData | null>(null);
  const [receptionData, setReceptionData] = useState<ReceptionData | null>(null);
  const [attendanceData, setAttendanceData] = useState<Map<string, { start: number; end: number }>>(new Map());
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  // 出勤データ用の状態（予約表示で使用）
  const [sheetDataGohobi, setSheetDataGohobi] = useState<SheetData | null>(null);
  const [sheetDataGussuri, setSheetDataGussuri] = useState<SheetData | null>(null);
  const [sheetDataChijo, setSheetDataChijo] = useState<SheetData | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 手動で「受付終了」に設定した女の子を管理（キー: 女の子の名前, 値: true/false）
  const [manualClosedStatus, setManualClosedStatus] = useState<Map<string, boolean>>(new Map());
  const [hoveredSlot, setHoveredSlot] = useState<{
    type: 'reservation' | 'reception' | 'buffer' | 'attendance';
    data: any;
    x: number;
    y: number;
  } | null>(null);
  
  // hoveredSlotの状態変化をログに出力（デバッグ用）
  useEffect(() => {
    console.log('[ポップアップ表示] hoveredSlotの状態変化:', {
      hasHoveredSlot: !!hoveredSlot,
      type: hoveredSlot?.type,
      x: hoveredSlot?.x,
      y: hoveredSlot?.y,
      hasData: !!hoveredSlot?.data,
    });
  }, [hoveredSlot]);
  const [showAddReservationModal, setShowAddReservationModal] = useState(false);
  const [showEditReceptionModal, setShowEditReceptionModal] = useState(false);
  const [selectedReception, setSelectedReception] = useState<any | null>(null);
  const [selectedGirl, setSelectedGirl] = useState<Girl | null>(null);
  const [formData, setFormData] = useState({
    brand: '',
    phone: '',
    customerName: '',
    memberType: 'F', // F=新規、J=指名、S=本指名
    castName: '',
    startTime: '',
    startHour: '',
    startMinute: '',
    courseTime: '',
    extension: '', // 延長（R列）
    amount: '',
    actualStartTime: '',
    endTime: '',
    hotelLocation: '',
    roomNumber: '',
    option: '',
    transportationFee: '',
    discountName: '',
    note: '',
    staff: '', // 担当（E列）
  });
  
  // 料金マスターデータ
  const [pricingData, setPricingData] = useState<{
    specialNames: Array<{ brand: string; castName: string; price: number }>;
    courses: Array<{ brand: string; courseTime: number; price: number }>;
    options: Array<{ brand: string; optionName: string; price: number }>;
    discounts: Array<{ brand: string; discountName: string; courseTime: number; price: number }>;
  } | null>(null);
  
  // 担当リスト
  const [staffList, setStaffList] = useState<string[]>([]);

  // ブランド名に基づいてオプション名の候補を取得（金額も含む）
  const getOptionSuggestions = (): Array<{ name: string; price: number }> => {
    if (!pricingData || !formData.brand) return [];
    const normalizedBrand = normalizeBrand(formData.brand);
    
    const options = pricingData.options
      .filter((opt) => {
        const brandMatch = opt.brand.includes(normalizedBrand) || normalizedBrand.includes(opt.brand);
        return brandMatch;
      })
      .map((opt) => ({ name: opt.optionName, price: opt.price }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    // 重複を除去（同じオプション名は1つだけ、最初に見つかったもの）
    const uniqueOptions = Array.from(
      new Map(options.map(opt => [opt.name, opt])).values()
    );
    
    return uniqueOptions;
  };

  // ブランド名に基づいてコース時間の候補を取得
  const getCourseTimeSuggestions = (): Array<{ time: number; price: number }> => {
    if (!pricingData || !formData.brand) return [];
    const normalizedBrand = normalizeBrand(formData.brand);
    
    const courses = pricingData.courses
      .filter((c) => {
        const brandMatch = c.brand.includes(normalizedBrand) || normalizedBrand.includes(c.brand);
        return brandMatch;
      })
      .map((c) => ({ time: c.courseTime, price: c.price }))
      .sort((a, b) => a.time - b.time);
    
    // 重複を除去（同じコース時間は1つだけ）
    const uniqueCourses = Array.from(
      new Map(courses.map(c => [c.time, c])).values()
    );
    
    return uniqueCourses;
  };

  // ブランド名とコース時間に基づいて割引名の候補を取得
  const getDiscountSuggestions = (): string[] => {
    if (!pricingData || !formData.brand || !formData.courseTime) return [];
    const normalizedBrand = normalizeBrand(formData.brand);
    const courseTime = parseFloat(formData.courseTime);
    if (isNaN(courseTime)) return [];
    
    return Array.from(
      new Set(
        pricingData.discounts
          .filter((disc) => {
            const brandMatch = disc.brand.includes(normalizedBrand) || normalizedBrand.includes(disc.brand);
            const timeMatch = Math.abs(disc.courseTime - courseTime) < 0.01;
            return brandMatch && timeMatch;
          })
          .map((disc) => disc.discountName)
      )
    ).sort();
  };

  // 出勤時間をパースする関数（例：「10-15」→ { start: 10, end: 15 }、「21.5-27.5」→ { start: 21.5, end: 27.5 }）
  const parseAttendanceTime = (timeStr: string): { start: number; end: number } | null => {
    console.log('[出勤時間パース] 入力:', timeStr);
    // 小数点を含む形式にも対応（例：21.5-27.5）
    const match = timeStr.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
    if (match) {
      const start = parseFloat(match[1]);
      const end = parseFloat(match[2]);
      console.log('[出勤時間パース] 成功:', { start, end });
      return { start, end };
    }
    console.log('[出勤時間パース] 失敗: パターンに一致しませんでした');
    return null;
  };

  const fetchReservations = useCallback(async (date?: string) => {
    try {
      setLoading(true);
      const dateParam = date || selectedDate;
      const [reservationResponse, receptionResponse] = await Promise.all([
        fetch(`/api/reservations?date=${encodeURIComponent(dateParam)}`),
        fetch(`/api/receptions?date=${encodeURIComponent(dateParam)}`),
      ]);
      
      const reservationData: ReservationData = await reservationResponse.json();
      const receptionDataResult: ReceptionData = await receptionResponse.json();
      
      // クォータエラーのチェック
      if (reservationResponse.status === 429 || (reservationData as any).quotaExceeded) {
        setError('Google Sheets APIのクォータ制限に達しました。しばらく待ってから再度お試しください。');
        return;
      }
      
      if (receptionResponse.status === 429 || (receptionDataResult as any).quotaExceeded) {
        setError('Google Sheets APIのクォータ制限に達しました。しばらく待ってから再度お試しください。');
        return;
      }
      
      if (reservationData.success) {
        setData(reservationData);
        setError(null);
      } else {
        // 予約データの取得に失敗しても、出勤時間の表示は続行する
        console.warn('[予約データ取得] 失敗:', reservationData.error);
        // エラーは設定しない（出勤時間の表示を妨げないため）
      }
      
      if (receptionDataResult.success) {
        setReceptionData(receptionDataResult);
        // デバッグ情報を表示
        if (receptionDataResult.debug) {
          console.log('[受付データ取得]', receptionDataResult.debug);
        }
        const receptionCount = receptionDataResult.receptions?.length || 0;
        console.log(`[受付データ] 取得件数: ${receptionCount}件`);
        
        // 「ななこ」や「まい」を含む受付データをログに出力
        if (receptionDataResult.receptions) {
          const nanakoReceptions = receptionDataResult.receptions.filter(r => 
            r.castName && (r.castName.includes('ななこ') || r.castName.includes('まい'))
          );
          if (nanakoReceptions.length > 0) {
            console.log(`[受付データ] 「ななこ」/「まい」を含む受付: ${nanakoReceptions.length}件`, 
              nanakoReceptions.map(r => ({
                キャスト名: r.castName,
                開始時間: r.startTime,
                コース時間: r.courseTime,
                ブランド: r.brand
              }))
            );
          }
        }
      } else {
        console.error('[受付データ] 取得失敗:', receptionDataResult.error);
      }
    } catch (err: any) {
      setError(err.message || 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // 日付を正規化する関数（MM/DD形式に統一）
  const normalizeDate = (dateStr: string): string => {
    if (!dateStr) return '';
    // MM/DD形式の場合はそのまま返す
    if (/^\d{1,2}\/\d{1,2}$/.test(dateStr)) {
      return dateStr;
    }
    // その他の形式（例: "2024/11/14", "11/14/2024"など）をMM/DDに変換
    const parts = dateStr.split(/[\/\-]/);
    if (parts.length >= 2) {
      const month = parseInt(parts[0], 10);
      const day = parseInt(parts[1], 10);
      // 年が含まれている場合（例: "2024/11/14"）
      if (parts.length === 3 && parts[0].length === 4) {
        const month2 = parseInt(parts[1], 10);
        const day2 = parseInt(parts[2], 10);
        if (!isNaN(month2) && !isNaN(day2)) {
          return `${month2}/${day2}`;
        }
      }
      // 月/日の形式
      if (!isNaN(month) && !isNaN(day)) {
        return `${month}/${day}`;
      }
    }
    return dateStr;
  };

  // 既に取得しているsheetDataから出勤時間を抽出する関数
  const extractAttendanceFromSheetData = useCallback((gohobiData: SheetData | null, gussuriData: SheetData | null, chijoData: SheetData | null): Map<string, { start: number; end: number }> => {
    const attendanceMap = new Map<string, { start: number; end: number }>();
    
    // 出勤時間抽出ログを削除
    // console.log('[出勤時間抽出] 開始, 選択日付:', selectedDate);
    // console.log('[出勤時間抽出] データの状態:', {
    //   gohobi: { hasData: !!gohobiData, success: gohobiData?.success, castsCount: gohobiData?.casts?.length || 0, datesCount: gohobiData?.dates?.length || 0 },
    //   gussuri: { hasData: !!gussuriData, success: gussuriData?.success, castsCount: gussuriData?.casts?.length || 0, datesCount: gussuriData?.dates?.length || 0 },
    //   chijo: { hasData: !!chijoData, success: chijoData?.success, castsCount: chijoData?.casts?.length || 0, datesCount: chijoData?.dates?.length || 0 },
    // });
    
    // 営業時間を考慮した日付を決定
    const now = new Date();
    const currentHour = now.getHours();
    const [monthStr, dayStr] = selectedDate.split('/');
    const paramMonth = parseInt(monthStr, 10);
    const paramDay = parseInt(dayStr, 10);
    const selectedDateObj = new Date(now.getFullYear(), paramMonth - 1, paramDay, 0, 0, 0);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    
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
    
    // 選択された日付が「今日」で10時前の場合、前日のシートから出勤時間を取得
    let targetDate = selectedDate;
    if (selectedDateObj.getTime() === businessToday.getTime() && currentHour < 10) {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const month = yesterday.getMonth() + 1;
      const day = yesterday.getDate();
      targetDate = `${month}/${day}`;
      // console.log('[出勤時間抽出] 営業時間を考慮: 選択日付は「今日」で10時前のため、前日のシートから取得:', targetDate);
    }
    // 注意: 未来の日付の場合、その日付のシートから出勤時間を取得する（前日ではない）
    
    const normalizedSelectedDate = normalizeDate(targetDate);
    // console.log('[出勤時間抽出] 正規化後の選択日付:', normalizedSelectedDate, '(元の選択日付:', selectedDate, ')');
    
    [gohobiData, gussuriData, chijoData].forEach((sheetData, index) => {
      const sheetNames = ['ごほうびSPA', 'ぐっすり山田', '痴女性感'];
      
      if (sheetData?.success && sheetData.casts && sheetData.dates) {
        // console.log(`[出勤時間抽出] ${sheetNames[index]}, 対象日付: ${normalizedSelectedDate}, 利用可能な日付:`, sheetData.dates.slice(0, 10));
        // console.log(`[出勤時間抽出] ${sheetNames[index]}, キャスト数: ${sheetData.casts.length}`);
        
        sheetData.casts.forEach(cast => {
          // 日付の正規化を試みる（複数の形式に対応）
          let scheduleValue = cast.schedule[normalizedSelectedDate];
          if (!scheduleValue) {
            // 正規化した日付で見つからない場合、元の日付で試す
            scheduleValue = cast.schedule[selectedDate];
          }
          if (!scheduleValue) {
            // スプレッドシートの日付を正規化して比較
            const scheduleKeys = Object.keys(cast.schedule);
            for (const key of scheduleKeys) {
              const normalizedKey = normalizeDate(key);
              if (normalizedKey === normalizedSelectedDate) {
                scheduleValue = cast.schedule[key];
                // console.log(`[出勤時間抽出] ${sheetNames[index]}, キャスト名: ${cast.name}, 日付キーを正規化してマッチ: ${key} -> ${normalizedKey}`);
                break;
              }
            }
          }
          
          // console.log(`[出勤時間抽出] ${sheetNames[index]}, キャスト名: ${cast.name}, スケジュール値: ${scheduleValue || '(なし)'}, 利用可能な日付キー:`, Object.keys(cast.schedule).slice(0, 10));
          
          if (scheduleValue) {
            const parsed = parseAttendanceTime(scheduleValue);
            if (parsed) {
              // 既存のデータがある場合は、より長い時間帯を使用
              const existing = attendanceMap.get(cast.name);
              if (!existing || (parsed.end - parsed.start) > (existing.end - existing.start)) {
                attendanceMap.set(cast.name, parsed);
                // console.log(`[出勤時間抽出] ${sheetNames[index]}, キャスト名: ${cast.name}, 出勤時間を設定:`, parsed);
              } else {
                // console.log(`[出勤時間抽出] ${sheetNames[index]}, キャスト名: ${cast.name}, 既存のデータの方が長いためスキップ`);
              }
            } else {
              // console.log(`[出勤時間抽出] ${sheetNames[index]}, キャスト名: ${cast.name}, パースに失敗: ${scheduleValue}`);
            }
          }
        });
      } else {
        // console.log(`[出勤時間抽出] ${sheetNames[index]}, データが取得できませんでした:`, {
        //   success: sheetData?.success,
        //   hasCasts: !!sheetData?.casts,
        //   hasDates: !!sheetData?.dates,
        // });
      }
    });
    
    // console.log('[出勤時間抽出] 最終的な出勤マップ:', Array.from(attendanceMap.entries()).map(([name, time]) => ({
    //   name,
    //   start: time.start,
    //   end: time.end,
    // })));
    // console.log('[出勤時間抽出] 取得件数:', attendanceMap.size);
    
    return attendanceMap;
  }, [selectedDate]);

  // generateChatMessage関数は削除（/chat-messagesページに移動）

  // 出勤データを取得（各シートから）
  const fetchAttendanceData = useCallback(async () => {
    try {
      console.log('[出勤データ取得] 開始, 選択日付:', selectedDate);
      
      // 既に取得済みのデータがある場合はそれを使用
      if (sheetDataGohobi && sheetDataGussuri && sheetDataChijo) {
        console.log('[出勤データ取得] 既存のデータを使用');
        return extractAttendanceFromSheetData(sheetDataGohobi, sheetDataGussuri, sheetDataChijo);
      }
      
      const [gohobiResponse, gussuriResponse, chijoResponse] = await Promise.all([
        fetch('/api/sheets?gid=578404798'), // ごほうびSPA
        fetch('/api/sheets?gid=732669611'), // ぐっすり山田
        fetch('/api/sheets?gid=935931778'), // 痴女性感
      ]);
      
      const gohobiData: SheetData = await gohobiResponse.json();
      const gussuriData: SheetData = await gussuriResponse.json();
      const chijoData: SheetData = await chijoResponse.json();
      
      // クォータエラーのチェック
      if (gohobiResponse.status === 429 || gussuriResponse.status === 429 || chijoResponse.status === 429 ||
          (gohobiData as any).quotaExceeded || (gussuriData as any).quotaExceeded || (chijoData as any).quotaExceeded) {
        console.warn('[出勤データ取得] クォータ制限に達しました');
        // クォータエラーの場合は既存のデータを保持
        return attendanceData;
      }
      
      // データを保存
      setSheetDataGohobi(gohobiData);
      setSheetDataGussuri(gussuriData);
      setSheetDataChijo(chijoData);
      
      // 出勤データを抽出
      return extractAttendanceFromSheetData(gohobiData, gussuriData, chijoData);
    } catch (err) {
      console.error('[出勤データ取得] エラー:', err);
      // エラーの場合は既存のデータを保持
      return attendanceData;
    }
  }, [selectedDate, attendanceData, sheetDataGohobi, sheetDataGussuri, sheetDataChijo, extractAttendanceFromSheetData]);

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setData(null);
    setReceptionData(null);
  };

  // 3つのシートの出勤データを取得（予約表示で使用）
  const fetchAllSheetData = useCallback(async () => {
    try {
      console.log('[出勤データ取得] fetchAllSheetData 開始');
      const [gohobiResponse, gussuriResponse, chijoResponse] = await Promise.all([
        fetch('/api/sheets?gid=578404798'), // ごほうびSPA
        fetch('/api/sheets?gid=732669611'), // ぐっすり山田
        fetch('/api/sheets?gid=935931778'), // 痴女性感
      ]);
      
      const gohobiData: SheetData = await gohobiResponse.json();
      const gussuriData: SheetData = await gussuriResponse.json();
      const chijoData: SheetData = await chijoResponse.json();
      
      console.log('[出勤データ取得] APIレスポンス:', {
        gohobi: { success: gohobiData.success, castsCount: gohobiData.casts?.length || 0, datesCount: gohobiData.dates?.length || 0 },
        gussuri: { success: gussuriData.success, castsCount: gussuriData.casts?.length || 0, datesCount: gussuriData.dates?.length || 0 },
        chijo: { success: chijoData.success, castsCount: chijoData.casts?.length || 0, datesCount: chijoData.dates?.length || 0 },
      });
      
      // クォータエラーのチェック
      if (gohobiResponse.status === 429 || gussuriResponse.status === 429 || chijoResponse.status === 429 ||
          (gohobiData as any).quotaExceeded || (gussuriData as any).quotaExceeded || (chijoData as any).quotaExceeded) {
        console.warn('[出勤データ取得] クォータ制限に達しました');
        return;
      }
      
      // データを保存
      setSheetDataGohobi(gohobiData);
      setSheetDataGussuri(gussuriData);
      setSheetDataChijo(chijoData);
      
      // 出勤データを抽出
      console.log('[出勤データ取得] 出勤データを抽出');
      const attendanceMap = extractAttendanceFromSheetData(gohobiData, gussuriData, chijoData);
      console.log('[出勤データ取得] 抽出した出勤データを設定, 件数:', attendanceMap.size);
      setAttendanceData(attendanceMap);
    } catch (err) {
      console.error('[出勤データ取得] エラー:', err);
    }
  }, [extractAttendanceFromSheetData]);

  useEffect(() => {
    fetchReservations();
    fetchAllSheetData(); // 3つのシートのデータを取得
    // クォータエラーを避けるため、更新間隔を120秒に変更
    const interval = setInterval(() => {
      fetchReservations();
      fetchAllSheetData();
    }, 120000); // 120秒
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // 現在時刻を更新（1秒ごと）
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // 1秒ごとに更新
    return () => clearInterval(interval);
  }, []);

  // 料金マスターデータを取得
  const fetchPricingData = useCallback(async () => {
    try {
      console.log('[料金算出] 料金マスターデータを取得中...');
      const response = await fetch('/api/pricing');
      const data = await response.json();
      console.log('[料金算出] 料金マスターデータ取得結果:', {
        success: data.success,
        specialNamesCount: data.specialNames?.length || 0,
        coursesCount: data.courses?.length || 0,
        optionsCount: data.options?.length || 0,
        discountsCount: data.discounts?.length || 0,
      });
      if (data.success) {
        setPricingData(data);
        console.log('[料金算出] 料金マスターデータを設定しました');
      } else {
        console.error('[料金算出] 料金マスターデータの取得に失敗:', data.error);
      }
    } catch (err) {
      console.error('[料金算出] 料金マスターデータの取得に失敗:', err);
    }
  }, []);

  // 担当リストを取得
  const fetchStaffList = useCallback(async () => {
    try {
      console.log('[担当リスト] 取得中...');
      const response = await fetch('/api/staff');
      const data = await response.json();
      console.log('[担当リスト] 取得結果:', {
        success: data.success,
        staffCount: data.staffList?.length || 0,
      });
      if (data.success) {
        setStaffList(data.staffList || []);
        console.log('[担当リスト] 担当リストを設定しました');
      } else {
        console.error('[担当リスト] 担当リストの取得に失敗:', data.error);
      }
    } catch (err) {
      console.error('[担当リスト] 担当リストの取得に失敗:', err);
    }
  }, []);

  // モーダルが開かれたときに料金マスターデータと担当リストを取得
  useEffect(() => {
    if (showAddReservationModal) {
      if (!pricingData) {
        fetchPricingData();
      }
      if (staffList.length === 0) {
        fetchStaffList();
      }
    }
  }, [showAddReservationModal, pricingData, fetchPricingData, staffList.length, fetchStaffList]);

  // ブランド名を正規化する関数（短縮形から完全な名前に変換）
  const normalizeBrand = (brand: string): string => {
    const brandMap: Record<string, string> = {
      'ごほうび': 'ごほうびSPA',
      'ぐっすり': 'ぐっすり山田',
      '痴女': '痴女性感',
    };
    return brandMap[brand] || brand;
  };

  // キャスト名から所属ブランドを判定する関数
  const getBrandFromCastName = (castName: string): 'gohobi' | 'gussuri' | 'chijo' | null => {
    if (!castName) return null;
    
    // 出勤データから判定
    if (attendanceData.has(castName)) {
      // シートデータから判定
      if (sheetDataGohobi?.casts?.some(c => c.name === castName)) {
        return 'gohobi';
      } else if (sheetDataGussuri?.casts?.some(c => c.name === castName)) {
        return 'gussuri';
      } else if (sheetDataChijo?.casts?.some(c => c.name === castName)) {
        return 'chijo';
      }
    }
    
    // 予約データから判定
    if (data?.girls) {
      const matchingGirl = data.girls.find(girl => 
        girl.nameGohobi === castName || 
        girl.nameGussuri === castName || 
        girl.name === castName
      );
      
      if (matchingGirl && matchingGirl.reservations && matchingGirl.reservations.length > 0) {
        const brands = new Set(matchingGirl.reservations.map(r => r.shop));
        if (brands.has('ごほうびSPA') || brands.has('ごほうび')) {
          return 'gohobi';
        } else if (brands.has('ぐっすり山田') || brands.has('ぐっすり')) {
          return 'gussuri';
        } else if (brands.has('痴女性感') || brands.has('痴女')) {
          return 'chijo';
        }
      }
    }
    
    // 受付データから判定
    if (receptionData?.receptions) {
      const matchingReception = receptionData.receptions.find(reception => 
        reception.castName === castName
      );
      
      if (matchingReception) {
        const brand = matchingReception.brand || '';
        if (brand.includes('ごほうび')) {
          return 'gohobi';
        } else if (brand.includes('ぐっすり')) {
          return 'gussuri';
        } else if (brand.includes('痴女')) {
          return 'chijo';
        }
      }
    }
    
    return null;
  };

  // 全角数字を半角数字に変換する関数
  const toHalfWidthNumber = (str: string): string => {
    return str.replace(/[０-９]/g, (char) => {
      return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
    });
  };

  // 料金を自動算出する関数
  const calculatePrice = useCallback(() => {
    console.log('[料金算出] 計算開始');
    console.log('[料金算出] 入力値:', {
      brand: formData.brand,
      castName: formData.castName,
      memberType: formData.memberType,
      courseTime: formData.courseTime,
      option: formData.option,
      discountName: formData.discountName,
    });

    if (!pricingData) {
      console.log('[料金算出] 料金マスターデータがありません');
      return '';
    }

    const brand = normalizeBrand(formData.brand);
    const castName = formData.castName;
    const memberType = formData.memberType;
    const courseTime = parseFloat(formData.courseTime);
    const option = formData.option;
    const discountName = formData.discountName;

    console.log('[料金算出] 正規化後の値:', {
      brand,
      castName,
      memberType,
      courseTime,
      option,
      discountName,
    });

    if (!brand || !courseTime || isNaN(courseTime)) {
      console.log('[料金算出] 必須項目が不足しています:', {
        brand: !!brand,
        courseTime: courseTime,
        isNaN: isNaN(courseTime),
      });
      return '';
    }

    let totalPrice = 0;

    // 1. 基本料金（コース料金）を取得
    console.log('[料金算出] コース料金を検索中...', {
      brand,
      courseTime,
      coursesCount: pricingData.courses.length,
    });
    const course = pricingData.courses.find(
      (c) => {
        // ブランド名の部分一致も考慮
        const brandMatch = c.brand.includes(brand) || brand.includes(c.brand);
        const timeMatch = Math.abs(c.courseTime - courseTime) < 0.01; // 浮動小数点の誤差を考慮
        if (brandMatch && timeMatch) {
          console.log('[料金算出] マッチしたコース:', c);
        }
        return brandMatch && timeMatch;
      }
    );
    if (course) {
      totalPrice += course.price;
      console.log('[料金算出] コース料金を追加:', course.price, '合計:', totalPrice);
    } else {
      console.log('[料金算出] コース料金が見つかりませんでした');
      console.log('[料金算出] 利用可能なコース:', pricingData.courses.slice(0, 5).map(c => ({
        brand: c.brand,
        courseTime: c.courseTime,
        price: c.price,
      })));
    }

    // 2. 特別指名料金を追加（会員区分がJまたはSの場合）
    if ((memberType === 'J' || memberType === 'S') && castName) {
      console.log('[料金算出] 特別指名料金を検索中...', {
        brand,
        castName,
        memberType,
        specialNamesCount: pricingData.specialNames.length,
      });
      const specialName = pricingData.specialNames.find(
        (sn) => {
          const brandMatch = sn.brand.includes(brand) || brand.includes(sn.brand);
          const nameMatch = sn.castName === castName || sn.castName.includes(castName) || castName.includes(sn.castName);
          if (brandMatch && nameMatch) {
            console.log('[料金算出] マッチした特別指名:', sn);
          }
          return brandMatch && nameMatch;
        }
      );
      if (specialName) {
        totalPrice += specialName.price;
        console.log('[料金算出] 特別指名料金を追加:', specialName.price, '合計:', totalPrice);
      } else {
        console.log('[料金算出] 特別指名料金が見つかりませんでした');
      }
    } else {
      console.log('[料金算出] 特別指名料金は適用されません:', {
        memberType,
        castName: !!castName,
      });
    }

    // 3. オプション料金を追加
    if (option) {
      console.log('[料金算出] オプション料金を検索中...', {
        brand,
        option,
        optionsCount: pricingData.options.length,
      });
      const optionPrice = pricingData.options.find(
        (opt) => {
          const brandMatch = opt.brand.includes(brand) || brand.includes(opt.brand);
          const optionMatch = opt.optionName === option || opt.optionName.includes(option) || option.includes(opt.optionName);
          if (brandMatch && optionMatch) {
            console.log('[料金算出] マッチしたオプション:', opt);
          }
          return brandMatch && optionMatch;
        }
      );
      if (optionPrice) {
        totalPrice += optionPrice.price;
        console.log('[料金算出] オプション料金を追加:', optionPrice.price, '合計:', totalPrice);
      } else {
        console.log('[料金算出] オプション料金が見つかりませんでした');
      }
    }

    // 4. 割引を適用
    if (discountName) {
      console.log('[料金算出] 割引を検索中...', {
        brand,
        discountName,
        courseTime,
        discountsCount: pricingData.discounts.length,
      });
      const discount = pricingData.discounts.find(
        (disc) => {
          const brandMatch = disc.brand.includes(brand) || brand.includes(disc.brand);
          const discountMatch = disc.discountName === discountName || disc.discountName.includes(discountName) || discountName.includes(disc.discountName);
          const timeMatch = Math.abs(disc.courseTime - courseTime) < 0.01;
          if (brandMatch && discountMatch && timeMatch) {
            console.log('[料金算出] マッチした割引:', disc);
          }
          return brandMatch && discountMatch && timeMatch;
        }
      );
      if (discount) {
        // 割引は料金を置き換える（または減額する）と仮定
        // ここでは割引料金を直接使用
        totalPrice = discount.price;
        console.log('[料金算出] 割引を適用:', discount.price, '合計:', totalPrice);
      } else {
        console.log('[料金算出] 割引が見つかりませんでした');
      }
    }

    // 5. 交通費を追加
    if (formData.transportationFee) {
      const transportationFee = parseFloat(formData.transportationFee.replace(/[^\d]/g, ''));
      if (!isNaN(transportationFee) && transportationFee > 0) {
        totalPrice += transportationFee;
        console.log('[料金算出] 交通費を追加:', transportationFee, '合計:', totalPrice);
      }
    }

    const result = totalPrice > 0 ? totalPrice.toString() : '';
    console.log('[料金算出] 計算結果:', result);
    return result;
  }, [pricingData, formData.brand, formData.castName, formData.memberType, formData.courseTime, formData.option, formData.discountName, formData.transportationFee]);

  // フォームの値が変更されたときに料金を自動算出
  useEffect(() => {
    console.log('[料金算出] useEffect トリガー:', {
      showAddReservationModal,
      hasPricingData: !!pricingData,
      formData: {
        brand: formData.brand,
        courseTime: formData.courseTime,
        memberType: formData.memberType,
      },
    });
    
    if (showAddReservationModal && pricingData) {
      const calculatedPrice = calculatePrice();
      console.log('[料金算出] 算出された料金:', calculatedPrice, '現在の料金:', formData.amount);
      if (calculatedPrice && calculatedPrice !== formData.amount) {
        console.log('[料金算出] 料金を更新します');
        setFormData((prev) => ({ ...prev, amount: calculatedPrice }));
      } else if (!calculatedPrice) {
        console.log('[料金算出] 料金が算出されませんでした');
      } else {
        console.log('[料金算出] 料金は変更されていません');
      }
    } else {
      console.log('[料金算出] 条件が満たされていません:', {
        showAddReservationModal,
        hasPricingData: !!pricingData,
      });
    }
  }, [
    showAddReservationModal,
    pricingData,
    formData.brand,
    formData.castName,
    formData.memberType,
    formData.courseTime,
    formData.option,
    formData.discountName,
    formData.transportationFee,
    calculatePrice,
    formData.amount,
  ]);

  // 出勤時間帯を取得
  const getAttendanceSlot = (girl: Girl): { start: number; end: number } | null => {
    // ログ出力を削除（パフォーマンス改善）
    
    // ごほうびSPA、ぐっすり山田、通常の名前で検索
    const nameGohobi = girl.nameGohobi || '';
    const nameGussuri = girl.nameGussuri || '';
    const name = girl.name || '';
    
    const attendanceGohobi = nameGohobi ? attendanceData.get(nameGohobi) : null;
    const attendanceGussuri = nameGussuri ? attendanceData.get(nameGussuri) : null;
    const attendanceName = name ? attendanceData.get(name) : null;
    
    const attendance = attendanceGohobi || attendanceGussuri || attendanceName;
    
    if (attendance) {
      // 小数点を含む時間に対応（例：21.5 = 21時30分）
      const startHour = Math.floor(attendance.start);
      const startMinute = Math.round((attendance.start - startHour) * 60);
      const endHour = Math.floor(attendance.end);
      const endMinute = Math.round((attendance.end - endHour) * 60);
      
      // 10時基準で分に変換
      const start = timeToMinutes(startHour, startMinute);
      const end = timeToMinutes(endHour, endMinute);
      
      return { start, end };
    }
    
    return null;
  };

  // 受付データをキャスト名でインデックス化（パフォーマンス改善：O(1)で検索可能）
  const receptionIndex = useMemo(() => {
    if (!receptionData?.receptions) return new Map<string, any[]>();
    
    const index = new Map<string, any[]>();
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
    
    receptionData.receptions.forEach(reception => {
      const normalizedCastName = normalizeName(reception.castName || '');
      if (normalizedCastName) {
        if (!index.has(normalizedCastName)) {
          index.set(normalizedCastName, []);
        }
        index.get(normalizedCastName)!.push(reception);
      }
    });
    
    console.log(`[受付インデックス] 作成完了: ${index.size}件のキャスト名でインデックス化`);
    return index;
  }, [receptionData]);
  
  // 予約が入っている時間帯を計算（受付内容と重複チェック）
  const getReservedSlots = (reservations: Reservation[], girl: Girl): Array<{
    start: number;
    end: number;
    shop: string;
    type: 'reservation' | 'reception' | 'buffer' | 'attendance';
    data: any;
  }> => {
    const slots: Array<{
      start: number;
      end: number;
      shop: string;
      type: 'reservation' | 'reception' | 'buffer' | 'attendance';
      data: any;
    }> = [];
    
    // 既に追加されたスロットを追跡（重複チェック用）
    const addedSlots = new Set<string>();
    
    // スロットのキーを生成（重複チェック用）
    const getSlotKey = (start: number, end: number, shop: string): string => {
      return `${start}-${end}-${shop}`;
    };
    
    // キャスト名を正規化する関数（共通化、より柔軟なマッチング）
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
    
    // 出勤時間帯を追加（背景として表示）
    const attendanceSlot = getAttendanceSlot(girl);
    if (attendanceSlot) {
      slots.push({
        start: attendanceSlot.start,
        end: attendanceSlot.end,
        shop: '出勤',
        type: 'attendance',
        data: { start: attendanceSlot.start, end: attendanceSlot.end },
      });
    }
    
    // 予約を追加
    reservations.forEach(res => {
      const start = timeToMinutes(res.startHour, res.startMinute);
      const end = timeToMinutes(res.endHour, res.endMinute);
      const slotKey = getSlotKey(start, end, res.shop);
      
      if (!addedSlots.has(slotKey)) {
        slots.push({ start, end, shop: res.shop, type: 'reservation', data: res });
        addedSlots.add(slotKey);
        
        // 終了後30分のバッファ時間を追加
        if (end < TOTAL_MINUTES) {
          const bufferEnd = Math.min(end + 30, TOTAL_MINUTES);
          slots.push({ 
            start: end, 
            end: bufferEnd, 
            shop: 'バッファ', 
            type: 'buffer', 
            data: { message: '案内後30分の空き時間' } 
          });
        }
      }
    });
    
    // 受付内容を追加（インデックスから直接取得してパフォーマンス改善）
    const normalizedNameGohobi = normalizeName(girl.nameGohobi || '');
    const normalizedNameGussuri = normalizeName(girl.nameGussuri || '');
    const normalizedName = normalizeName(girl.name || '');
    
    // 該当する受付データをインデックスから取得（O(1)で検索）
    // 重複を避けるため、キーベースで重複を除去
    const matchingReceptionsMap = new Map<string, any>();
    
    const addReceptions = (receptions: any[], requiredBrand?: string) => {
      receptions.forEach(reception => {
        // ブランドが指定されている場合、受付データのブランドと一致するか確認
        if (requiredBrand) {
          const receptionBrand = reception.brand || '';
          if (requiredBrand === 'gohobi' && !receptionBrand.includes('ごほうび')) {
            return; // ごほうびの受付データのみ
          }
          if (requiredBrand === 'gussuri' && !receptionBrand.includes('ぐっすり')) {
            return; // ぐっすりの受付データのみ
          }
          if (requiredBrand === 'chijo' && !receptionBrand.includes('痴女')) {
            return; // 痴女の受付データのみ
          }
        }
        
        // より確実な重複除去のため、開始時間と終了時間も含める
        const key = `${reception.castName}-${reception.startTime}-${reception.courseTime}-${reception.startMinutes}-${reception.endMinutes}`;
        if (!matchingReceptionsMap.has(key)) {
          matchingReceptionsMap.set(key, reception);
        }
      });
    };
    
        // ごほうびの名前でマッチした場合、ごほうびの受付データのみを追加
        if (normalizedNameGohobi && receptionIndex.has(normalizedNameGohobi)) {
          const receptions = receptionIndex.get(normalizedNameGohobi)!;
          addReceptions(receptions, 'gohobi');
        }
        // ぐっすりの名前でマッチした場合、ぐっすりの受付データのみを追加
        if (normalizedNameGussuri && receptionIndex.has(normalizedNameGussuri)) {
          const receptions = receptionIndex.get(normalizedNameGussuri)!;
          addReceptions(receptions, 'gussuri');
        }
        // normalizedNameがnormalizedNameGohobiやnormalizedNameGussuriと異なる場合のみ追加
        // この場合は、女の子のブランドを判定してから追加
        if (normalizedName && 
            normalizedName !== normalizedNameGohobi && 
            normalizedName !== normalizedNameGussuri && 
            receptionIndex.has(normalizedName)) {
          const receptions = receptionIndex.get(normalizedName)!;
          // 女の子のブランドを判定（予約データから）
          let detectedBrand: 'gohobi' | 'gussuri' | 'chijo' | undefined = undefined;
          if (girl.reservations && girl.reservations.length > 0) {
            const brands = new Set(girl.reservations.map(r => r.shop));
            if (brands.has('ごほうびSPA') || brands.has('ごほうび')) {
              detectedBrand = 'gohobi';
            } else if (brands.has('ぐっすり山田') || brands.has('ぐっすり')) {
              detectedBrand = 'gussuri';
            } else if (brands.has('痴女性感') || brands.has('痴女')) {
              detectedBrand = 'chijo';
            }
          }
          // ブランドが判定できない場合は、すべての受付データを追加（後方互換性のため）
          addReceptions(receptions, detectedBrand);
        }
        
        // Mapから配列に変換
        const uniqueReceptions = Array.from(matchingReceptionsMap.values());
    
    let matchedCount = 0;
    let duplicateCount = 0;
    
    uniqueReceptions.forEach((reception: any) => {
        // インデックスから取得したデータは既にマッチしているので、マッチングチェックは不要
        
        if (reception.startMinutes === null || reception.endMinutes === null) {
          // ログ出力を削除（パフォーマンス改善）
          return;
        }
        
        matchedCount++;
        // ログ出力を削除（パフォーマンス改善）
        
        // ブランド名を正規化（痴女 → 痴女性感など）
        let normalizedBrand = reception.brand || '受付';
        if (normalizedBrand.includes('痴女')) {
          normalizedBrand = '痴女性感';
        } else if (normalizedBrand.includes('ごほうび')) {
          normalizedBrand = 'ごほうびSPA';
        } else if (normalizedBrand.includes('ぐっすり')) {
          normalizedBrand = 'ぐっすり山田';
        }
        
        // 予約シートのデータと重複しているかチェック（開始時間、終了時間、店舗が同じ場合は重複）
        // ただし、受付データを優先表示するため、予約シートのデータとの重複チェックは緩和
        const isDuplicate = reservations.some(res => {
          const resStart = timeToMinutes(res.startHour, res.startMinute);
          const resEnd = timeToMinutes(res.endHour, res.endMinute);
          // 開始時間が1分以内、終了時間が1分以内、店舗が同じなら重複とみなす（5分から1分に変更）
          return Math.abs(resStart - reception.startMinutes!) <= 1 && 
                 Math.abs(resEnd - reception.endMinutes!) <= 1 &&
                 res.shop === normalizedBrand;
        });
        
        // 既に追加されたスロットと重複しているかチェック
        // 受付データの場合は、予約スロットとの重複を無視して追加する
        const slotKey = getSlotKey(reception.startMinutes!, reception.endMinutes!, normalizedBrand);
        // 受付データの場合は、同じ時間帯の予約スロットがあっても追加する
        const isAlreadyAdded = addedSlots.has(slotKey) && 
          !slots.some(slot => 
            slot.start === reception.startMinutes! && 
            slot.end === reception.endMinutes! && 
            slot.type === 'reception'
          );
        
        // 受付データは予約シートのデータと重複していても表示する（受付データを優先）
        // ただし、同じ受付データが既に追加されている場合はスキップ
        if (isAlreadyAdded && slots.some(slot => 
          slot.start === reception.startMinutes! && 
          slot.end === reception.endMinutes! && 
          slot.type === 'reception'
        )) {
          duplicateCount++;
          return;
        }
        
        // 予約シートのデータと重複している場合は、予約スロットを削除して受付スロットを追加
        if (isDuplicate) {
          // 重複している予約スロットを削除
          const duplicateIndex = slots.findIndex(slot => 
            slot.type === 'reservation' &&
            Math.abs(slot.start - reception.startMinutes!) <= 1 &&
            Math.abs(slot.end - reception.endMinutes!) <= 1 &&
            slot.shop === normalizedBrand
          );
          if (duplicateIndex !== -1) {
            slots.splice(duplicateIndex, 1);
            // バッファスロットも削除
            const bufferIndex = slots.findIndex(slot => 
              slot.type === 'buffer' &&
              slot.start === reception.endMinutes!
            );
            if (bufferIndex !== -1) {
              slots.splice(bufferIndex, 1);
            }
            // addedSlotsからも削除
            const duplicateSlotKey = getSlotKey(reception.startMinutes!, reception.endMinutes!, normalizedBrand);
            addedSlots.delete(duplicateSlotKey);
          }
        }
        
        slots.push({
          start: reception.startMinutes!,
          end: reception.endMinutes!,
          shop: normalizedBrand,
          type: 'reception',
          data: reception,
        });
        addedSlots.add(slotKey);
        
        // 終了後30分のバッファ時間を追加
        if (reception.endMinutes! < TOTAL_MINUTES) {
          const bufferEnd = Math.min(reception.endMinutes! + 30, TOTAL_MINUTES);
          slots.push({ 
            start: reception.endMinutes!, 
            end: bufferEnd, 
            shop: 'バッファ', 
            type: 'buffer', 
            data: { message: '案内後30分の空き時間' } 
          });
        }
      });
    
    return slots;
  };

  // 店舗ごとの色
  const getShopColor = (shop: string, type?: string): string => {
    if (type === 'buffer') {
      return 'bg-yellow-200 border-2 border-yellow-400 border-dashed';
    }
    if (type === 'attendance') {
      return 'bg-green-200 border-2 border-green-400';
    }
    // ブランド名の正規化（部分一致も考慮）
    const normalizedShop = shop.trim();
    const colors: Record<string, string> = {
      'ごほうびSPA': 'bg-yellow-500',
      'ごほうび': 'bg-yellow-500',
      'ぐっすり山田': 'bg-blue-500',
      'ぐっすり': 'bg-blue-500',
      '痴女性感': 'bg-purple-500',
      '痴女': 'bg-purple-500',
    };
    
    // 部分一致で検索
    for (const [key, color] of Object.entries(colors)) {
      if (normalizedShop.includes(key) || key.includes(normalizedShop)) {
        return color;
      }
    }
    
    return 'bg-gray-500';
  };

  // 現在時刻を分に変換（10時基準）
  const getCurrentTimeMinutes = (): number => {
    const hour = currentTime.getHours();
    const minute = currentTime.getMinutes();
    return timeToMinutes(hour, minute);
  };

  // ひらがなをカタカナに変換する関数
  const toKatakana = (str: string): string => {
    return str.replace(/[\u3041-\u3096]/g, (match) => {
      return String.fromCharCode(match.charCodeAt(0) + 0x60);
    });
  };

  // ホテル候補リスト
  const hotelOptions = [
    '五反田駅東口ラブホ予定',
    '五反田駅西口ラブホ予定',
    'バリバリアネックス',
    'バリバリアネックスOK',
    'ヒルズ',
    'ヒルズOK',
    'ビックス',
    'ビックスOK',
    '西口)バリバリ',
    '西口)バリバリOK',
    'エメラルド',
    'エメラルドOK',
    'W1',
    'W1　OK',
    'ホテルSARA GRANDE',
    'ホテルSARA GRANDE OK',
    'ホテルSARA',
    'ホテルSARA OK',
    'ホテルMINミン',
    '五東) リオススリー',
    '五東) イーアイ',
    '五東) マーブル',
    'ビジホ直) マイステイズ五反田駅前',
    '迎) 三井ガーデンホテル五反田',
    '五西) シーズ',
    '五西) ノックス',
    '五) ウエスト',
    '五西) マーレ',
    '五西) ピース',
    '五西) リュクス',
    '五西) ビーサイド',
    '五西) ミント',
    '五西) プアラニ（元リオス）',
    '迎)ＪＲ東日本ホテルメッツ 五反田',
    'レンタルルーム サン',
    '直）ヴィアイン東京大井町',
    '迎）ニューオータニイン東京',
    '直）ホテルロイヤルオーク五反田',
    '迎）ダイワロイネットホテル東京大崎',
    '迎）シェラトン都ホテル東京',
    '直）グランドニッコー東京 台場',
    '迎）アパホテル〈六本木SIX〉',
    '迎）アパホテル〈品川 泉岳寺駅前〉',
    '迎）アパホテル〈六本木駅前〉',
    '迎）アパホテル＆リゾート〈六本木駅東〉',
    '迎え）都シティ 東京高輪',
    '迎）品川プリンスホテル（メインタワー）',
    '直）品川プリンスホテル（アネックスタワー）',
    '直）品川プリンスホテル（イーストタワー）',
    '迎）品川プリンスホテル（Nタワー）',
    '迎）アワーズイン阪急　シングル館',
    '迎）アワーズイン阪急　ツイン館',
    '直）ホテルマイステイズ五反田',
    '迎）グランドプリンスホテル新高輪',
    '迎）グランドプリンスホテル高輪',
    '五東) カームホテルトウキョウ',
    '迎)アパホテル戸越駅前',
    'ラブホ)アルファイン',
    '直)ホテルアベスト目黒',
    '直)KKRホテル東京',
    '直)渋谷東武ホテル',
    'ラブホ）イロハ',
    '迎)ホテルミッドイン目黒駅前',
    'ホテルジパゴ東五反田店',
    '直）ハートンホテル　東品川',
    'ラブホ)KARUTA/カルタ',
    'SARA 五反田',
    '迎)プルマン東京田町',
    '直)ホテルプリンセスガーデン',
    '迎)ヒルトン東京お台場',
    'ラブホ)シャンティ赤坂',
    '迎)東京ベイコート倶楽部',
    '迎)アパホテル永田町',
    '直)品川東武ホテル',
    '直)マイステイズプレミア大森',
    '迎)京急EXイン羽田イノベーションシティ',
    '迎)相鉄フレッサイン田町　別館',
    '迎)ザ・プリンス パークタワー東京',
    '迎)ダイワロイネットホテル東京京橋 PREMIER',
    'ラブホ）ホテルミレイ',
    'チサンホテル蒲田(駐車場口から直)',
    '迎)サンルート銀座',
    '迎)相鉄フレッサイン 東京田町',
    '直)グラウンドアーク半蔵門',
    'コンラッド東京（28階待ち合わせ）',
    '迎)静鉄ホテルプレジオ東京田町',
    'ラブホ)目黒エンペラー',
    '下迎え)プルマン 東京田町',
    'ラブホ)ラヴィ',
    'ラブホ)グランツカスカータ六本木',
    '下迎え）セルリアンタワー東急ホテル',
    '直)東京マリオットホテル',
    '下迎え)静鉄ホテルプレジオ 東京田町',
    'ラブホ)ビラセンメイ',
  ];

  // ホテル名と住所のマッピング
  const hotelAddressMap: Record<string, string> = {
    '五東) リオススリー': '品川区東五反田１丁目１９−１１',
    '五東) イーアイ': '品川区東五反田１丁目１８−１２',
    '五東) マーブル': '品川区東五反田1-12-4',
    'ビジホ直) マイステイズ五反田駅前': '品川区西五反田２丁目６−８',
    '迎) 三井ガーデンホテル五反田': '品川区東五反田２丁目２−６',
    '五西) シーズ': '品川区西五反田２丁目３−６',
    '五西) ノックス': '品川区西五反田２丁目３−９',
    '五) ウエスト': '品川区西五反田２丁目４−１０',
    '五西) マーレ': '品川区西五反田２丁目３−１',
    '五西) ピース': '品川区西五反田２丁目５−２',
    '五西) リュクス': '品川区西五反田２丁目５−５',
    '五西) ビーサイド': '品川区西五反田1-11-4',
    '五西) ミント': '品川区西五反田２丁目５−２',
    '五西) プアラニ（元リオス）': '品川区西五反田1-13-8',
    '迎)ＪＲ東日本ホテルメッツ 五反田': '品川区東五反田１丁目２６−３',
    'レンタルルーム サン': '品川区西五反田１丁目３２−４',
    '直）ヴィアイン東京大井町': '品川区大井４丁目３−１',
    '迎）ニューオータニイン東京': '東京都品川区大崎1-6-2',
    '直）ホテルロイヤルオーク五反田': '東京都品川区西五反田１丁目９−３',
    '迎）ダイワロイネットホテル東京大崎': '品川区大崎2-1-3',
    '迎）シェラトン都ホテル東京': '港区白金台1-1-50',
    '直）グランドニッコー東京 台場': '東京都港区台場2-6-1',
    '迎）アパホテル〈六本木SIX〉': '港区六本木2-3-11',
    '迎）アパホテル〈品川 泉岳寺駅前〉': '東京都港区高輪二丁目16-30',
    '迎）アパホテル〈六本木駅前〉': '東京都港区六本木6-7-8',
    '迎）アパホテル＆リゾート〈六本木駅東〉': '東京都港区六本木3-18-6',
    '迎え）都シティ 東京高輪': '港区高輪３丁目１９－１７',
    '迎）品川プリンスホテル（メインタワー）': '東京都港区高輪4-10-30',
    '直）品川プリンスホテル（アネックスタワー）': '東京都港区高輪4-10-30',
    '直）品川プリンスホテル（イーストタワー）': '東京都港区高輪4-10-30',
    '迎）品川プリンスホテル（Nタワー）': '東京都港区高輪4-10-30',
    '迎）アワーズイン阪急　シングル館': '品川区大井１丁目５０−５',
    '迎）アワーズイン阪急　ツイン館': '品川区大井１丁目５０−５',
    '直）ホテルマイステイズ五反田': '品川区東五反田２丁目５−４',
    '迎）グランドプリンスホテル新高輪': '港区高輪３丁目１３−１',
    '迎）グランドプリンスホテル高輪': '港区高輪３丁目１３−１',
    '五東) カームホテルトウキョウ': '品川区東五反田１丁目２３−１',
    '迎)アパホテル戸越駅前': '品川区戸越１-１５-１７',
    'ラブホ)アルファイン': '港区東麻布2-8-3',
    '直)ホテルアベスト目黒': '品川区上大崎２丁目２６−５',
    '直)KKRホテル東京': '千代田区大手町１-４−１',
    '直)渋谷東武ホテル': '渋谷区宇田川町３−１',
    'ラブホ）イロハ': '港区六本木7-20-7',
    '迎)ホテルミッドイン目黒駅前': '東京都目黒区下目黒1-2-19',
    'ホテルジパゴ東五反田店': '品川区東五反田１-２０−５',
    '直）ハートンホテル　東品川': '品川区東品川４丁目１３−２７',
    'ラブホ)KARUTA/カルタ': '港区赤坂2-13-16',
    'SARA 五反田': '品川区東五反田1-17-3',
    '迎)プルマン東京田町': '港区芝浦3-1-21',
    '直)ホテルプリンセスガーデン': '品川区上大崎2-23-7',
    '迎)ヒルトン東京お台場': '港区台場1-91',
    'ラブホ)シャンティ赤坂': '港区赤坂2-16-15',
    '迎)東京ベイコート倶楽部': '江東区有明3-1-15',
    '迎)アパホテル永田町': '千代田区平河町1-3-5',
    '直)品川東武ホテル': '港区高輪4-7-6※深夜1時以降は下迎え',
    '直)マイステイズプレミア大森': '品川区南大井6-19-3',
    '迎)京急EXイン羽田イノベーションシティ': '大田区羽田空港1-1-4',
    '迎)相鉄フレッサイン田町　別館': '港区芝浦3-14-21',
    '迎)ザ・プリンス パークタワー東京': '港区芝公園4-8-1',
    '迎)ダイワロイネットホテル東京京橋 PREMIER': '中央区京橋2-8-20',
    'ラブホ）ホテルミレイ': '品川区南品川５丁目１１−３０',
    'チサンホテル蒲田(駐車場口から直)': '大田区西蒲田８丁目２０−１１',
    '迎)サンルート銀座': '中央区銀座１丁目１５−１１',
    '迎)相鉄フレッサイン 東京田町': '港区芝浦３丁目１４−２１',
    '直)グラウンドアーク半蔵門': '千代田区隼町１−１',
    'コンラッド東京（28階待ち合わせ）': '港区東新橋１丁目９−１',
    '迎)静鉄ホテルプレジオ東京田町': '〒108-0023 東京都港区芝浦３丁目６−１８',
    'ラブホ)目黒エンペラー': '東京都目黒区下目黒２丁目１−６',
    '下迎え)プルマン 東京田町': '〒108-0023 東京都港区芝浦3-1-21',
    'ラブホ)ラヴィ': '神奈川県川崎市中原区新丸子東2-896',
    'ラブホ)グランツカスカータ六本木': '港区西麻布１丁目３−２',
    '下迎え）セルリアンタワー東急ホテル': '東京都渋谷区桜丘町２６−１',
    '直)東京マリオットホテル': '品川区北品川４丁目７−３６',
    '下迎え)静鉄ホテルプレジオ 東京田町': '港区芝浦３丁目６−１８',
    'ラブホ)ビラセンメイ': '大田区蒲田４丁目２２−７',
  };

  // 住所から交通費を算出する関数
  const calculateTransportationFee = (hotelName: string, address?: string): string => {
    const targetAddress = address || hotelAddressMap[hotelName] || hotelName;
    
    // 駅名で判定
    if (targetAddress.includes('五反田駅')) {
      return '1100';
    }
    if (targetAddress.includes('品川駅')) {
      return '1100';
    }
    
    // 区名で判定
    if (targetAddress.includes('品川区')) {
      return '2200';
    }
    if (targetAddress.includes('目黒区')) {
      return '2200';
    }
    if (targetAddress.includes('港区')) {
      return '3300';
    }
    if (targetAddress.includes('渋谷区')) {
      return '3300';
    }
    if (targetAddress.includes('大田区')) {
      return '3300';
    }
    if (targetAddress.includes('中央区')) {
      return '3300';
    }
    if (targetAddress.includes('新宿区')) {
      return '4400';
    }
    if (targetAddress.includes('千代田区')) {
      return '4400';
    }
    if (targetAddress.includes('世田谷区')) {
      return '4400';
    }
    if (targetAddress.includes('お台場') || targetAddress.includes('台場')) {
      return '4400';
    }
    if (targetAddress.includes('川崎市中原区')) {
      return '4400';
    }
    if (targetAddress.includes('江東区')) {
      return '5500';
    }
    if (targetAddress.includes('台東区')) {
      return '5500';
    }
    if (targetAddress.includes('豊島区')) {
      return '5500';
    }
    if (targetAddress.includes('文京区')) {
      return '5500';
    }
    if (targetAddress.includes('中野区')) {
      return '5500';
    }
    if (targetAddress.includes('杉並区')) {
      return '5500';
    }
    if (targetAddress.includes('墨田区')) {
      return '5500';
    }
    if (targetAddress.includes('川崎市高津区')) {
      return '5500';
    }
    
    return '';
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                予約状況カンバン
              </h1>
              <p className="text-gray-600 mb-2">
                各女性の予約状況を時間帯ごとに視覚的に確認できます
              </p>
              <p className="text-sm text-gray-500">
                ※ 120秒ごとに自動更新されます
              </p>
            </div>
            <nav className="flex gap-2">
              <div className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm">
                予約状況
              </div>
              <Link
                href="/attendance"
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors text-sm"
              >
                出勤管理
              </Link>
              <Link
                href="/chat-messages"
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors text-sm"
              >
                チャットメッセージ生成
              </Link>
            </nav>
          </div>
        </header>

        <div className="mb-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex items-center gap-2">
                <label htmlFor="date-select" className="text-sm font-medium text-gray-700">
                  日付選択:
                </label>
                <select
                  id="date-select"
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {getDateOptions().map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => fetchReservations()}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {loading ? '更新中...' : '手動更新'}
              </button>
            </div>
            {data && (
              <span className="text-sm text-gray-500">
                最終更新: {new Date().toLocaleTimeString('ja-JP')}
              </span>
            )}
          </div>

        {/* 凡例 */}
        <div className="mb-4 p-4 bg-white rounded-lg shadow">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">凡例</h3>
              <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-500 rounded"></div>
              <span className="text-sm text-gray-600">ごほうびSPA</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span className="text-sm text-gray-600">ぐっすり山田</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-purple-500 rounded"></div>
              <span className="text-sm text-gray-600">痴女性感</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-orange-500 rounded"></div>
              <span className="text-sm text-gray-600">受付</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-200 border-2 border-yellow-400 border-dashed rounded"></div>
              <span className="text-sm text-gray-600">案内後30分（空き時間）</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-200 border border-gray-300 rounded"></div>
              <span className="text-sm text-gray-600">空き時間</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-100 border border-red-300 rounded"></div>
              <span className="text-sm text-gray-600">受付終了</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-200 border-2 border-green-400 rounded"></div>
              <span className="text-sm text-gray-600">出勤時間</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-0.5 h-4 bg-red-500"></div>
              <span className="text-sm text-gray-600">現在時刻</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            <p className="font-semibold">エラー</p>
            <p>{error}</p>
          </div>
        )}

        {loading && !data && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">データを読み込んでいます...</p>
          </div>
        )}

        {data && data.success && data.girls && (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden relative" style={{ height: 'calc(100vh - 250px)' }}>
            <div className="overflow-auto h-full relative">
              <table className="min-w-full">
                <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-30 border-r border-gray-200 min-w-[120px]">
                      女性名
                    </th>
                    {HOURS.map((hour) => (
                      <th
                        key={hour}
                        className="px-2 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider border-r border-gray-100 bg-gray-50"
                        style={{ minWidth: '60px' }}
                      >
                        {hour >= 24 ? `${hour - 24}時` : `${hour}時`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.girls.length === 0 ? (
                    <tr>
                      <td
                        colSpan={HOURS.length + 1}
                        className="px-6 py-4 text-center text-gray-500"
                      >
                        データがありません
                      </td>
                    </tr>
                ) : (
                  data.girls
                    .filter((girl) => {
                      // 予約、出勤時間、受付のいずれかがある女の子のみ表示
                      const hasReservations = girl.reservations && girl.reservations.length > 0;
                      const attendanceSlot = getAttendanceSlot(girl);
                      const hasAttendance = attendanceSlot !== null;
                      
                      // 受付データをチェック（キャスト名が完全一致する受付があるか）
                      // 正規化関数を使用（getReservedSlotsと同じロジック）
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
                      
                      let hasReception = false;
                      if (receptionData?.receptions) {
                        hasReception = receptionData.receptions.some(reception => {
                          const normalizedReceptionCastName = normalizeName(reception.castName || '');
                          const normalizedNameGohobi = normalizeName(girl.nameGohobi || '');
                          const normalizedNameGussuri = normalizeName(girl.nameGussuri || '');
                          const normalizedName = normalizeName(girl.name || '');
                          
                          const castNameMatch = 
                            (normalizedNameGohobi && normalizedReceptionCastName === normalizedNameGohobi) ||
                            (normalizedNameGussuri && normalizedReceptionCastName === normalizedNameGussuri) ||
                            (normalizedName && normalizedReceptionCastName === normalizedName);
                          
                          // デバッグ: 「ななこ」や「まい」を含む場合のみログに出力（最初の3件まで）
                          // ログ出力を制限してパフォーマンスを改善
                          
                          return castNameMatch;
                        });
                      }
                      
                      // いずれかがあれば表示
                      return hasReservations || hasAttendance || hasReception;
                    })
                    .map(girl => {
                      // 手動で設定された「受付終了」状態を確認
                      const manualClosed = manualClosedStatus.get(girl.name);
                      if (manualClosed !== undefined) {
                        // 手動で設定されている場合は、その値を使用
                        return { ...girl, isClosed: manualClosed };
                      }
                      
                      // ソート前にisClosedを再計算
                      let isClosed = girl.isClosed;
                      if (!isClosed) {
                        const attendanceSlot = getAttendanceSlot(girl);
                        if (attendanceSlot) {
                          const attendanceEndMinutes = attendanceSlot.end;
                          const currentMinutes = getCurrentTimeMinutes();
                          
                          const now = new Date();
                          const currentHour = now.getHours();
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
                          
                          const [monthStr, dayStr] = selectedDate.split('/');
                          const paramMonth = parseInt(monthStr, 10);
                          const paramDay = parseInt(dayStr, 10);
                          const selectedDateObj = new Date(now.getFullYear(), paramMonth - 1, paramDay, 0, 0, 0);
                          const isFutureDate = selectedDateObj > businessToday;
                          
                          if (!isFutureDate && attendanceEndMinutes < currentMinutes) {
                            isClosed = true;
                          }
                        }
                      }
                      return { ...girl, isClosed };
                    })
                    .sort((a, b) => {
                      // まず受付可能/受付終了で分ける（受付可能を上に）
                      if (a.isClosed !== b.isClosed) {
                        return a.isClosed ? 1 : -1;
                      }
                      
                      // 同じグループ内で出勤時間の早い順に並び替え
                      const attendanceA = getAttendanceSlot(a);
                      const attendanceB = getAttendanceSlot(b);
                      
                      // 出勤時間がない場合は最後に表示
                      if (!attendanceA && !attendanceB) return 0;
                      if (!attendanceA) return 1;
                      if (!attendanceB) return -1;
                      
                      // 出勤開始時間で比較
                      return attendanceA.start - attendanceB.start;
                    })
                    .map((girl, rowIndex, sortedGirls) => {
                      // 受付可能と受付終了の区切り線を表示
                      const isFirstClosed = girl.isClosed && (rowIndex === 0 || !sortedGirls[rowIndex - 1].isClosed);
                    const reservedSlots = getReservedSlots(girl.reservations, girl);
                      const totalWidth = HOURS.length * 60; // 各時間帯60px
                      const currentTimeMinutes = getCurrentTimeMinutes();
                      
                      // 選択された日付が未来の日付かどうかを判定
                      const now = new Date();
                      const currentHour = now.getHours();
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
                      
                      const [monthStr, dayStr] = selectedDate.split('/');
                      const paramMonth = parseInt(monthStr, 10);
                      const paramDay = parseInt(dayStr, 10);
                      const selectedDateObj = new Date(now.getFullYear(), paramMonth - 1, paramDay, 0, 0, 0);
                      const isFutureDate = selectedDateObj > businessToday;
                      
                      // ブランドを判定（予約データから）
                      let detectedBrand: 'gohobi' | 'gussuri' | 'chijo' | null = null;
                      if (girl.reservations && girl.reservations.length > 0) {
                        // 予約データからブランドを判定
                        const brands = new Set(girl.reservations.map(r => r.shop));
                        if (brands.has('ごほうびSPA') || brands.has('ごほうび')) {
                          detectedBrand = 'gohobi';
                        } else if (brands.has('ぐっすり山田') || brands.has('ぐっすり')) {
                          detectedBrand = 'gussuri';
                        } else if (brands.has('痴女性感') || brands.has('痴女')) {
                          detectedBrand = 'chijo';
                        }
                      }
                      
                      // 出勤データからもブランドを判定（予約データで判定できない場合）
                      if (!detectedBrand) {
                        const attendanceSlot = getAttendanceSlot(girl);
                        if (attendanceSlot) {
                          // 出勤データマップからブランドを判定
                          const nameGohobi = girl.nameGohobi || '';
                          const nameGussuri = girl.nameGussuri || '';
                          const name = girl.name || '';
                          
                          if (nameGohobi && attendanceData.has(nameGohobi)) {
                            detectedBrand = 'gohobi';
                          } else if (nameGussuri && attendanceData.has(nameGussuri)) {
                            detectedBrand = 'gussuri';
                          } else if (name && attendanceData.has(name)) {
                            // 名前からブランドを判定（シートデータから）
                            if (sheetDataGohobi?.casts?.some(c => c.name === name)) {
                              detectedBrand = 'gohobi';
                            } else if (sheetDataGussuri?.casts?.some(c => c.name === name)) {
                              detectedBrand = 'gussuri';
                            } else if (sheetDataChijo?.casts?.some(c => c.name === name)) {
                              detectedBrand = 'chijo';
                            }
                          }
                        }
                      }
                      
                      // 受付データからもブランドを判定（まだ判定できない場合）
                      if (!detectedBrand && receptionData?.receptions) {
                        const matchingReception = receptionData.receptions.find(reception => {
                          const castNameMatch = 
                            (girl.nameGohobi && reception.castName === girl.nameGohobi) ||
                            (girl.nameGussuri && reception.castName === girl.nameGussuri) ||
                            (girl.name && reception.castName === girl.name);
                          return castNameMatch;
                        });
                        
                        if (matchingReception) {
                          const brand = matchingReception.brand || '';
                          if (brand.includes('ごほうび')) {
                            detectedBrand = 'gohobi';
                          } else if (brand.includes('ぐっすり')) {
                            detectedBrand = 'gussuri';
                          } else if (brand.includes('痴女')) {
                            detectedBrand = 'chijo';
                          }
                        }
                      }
                      
                      // 出勤時間の終了時刻が現在時刻より前の場合は「受付終了」とする
                      let isClosed = girl.isClosed;
                      if (!isClosed) {
                        const attendanceSlot = getAttendanceSlot(girl);
                        if (attendanceSlot) {
                          // 出勤時間の終了時刻を計算（分単位、10時基準）
                          const attendanceEndMinutes = attendanceSlot.end;
                          
                          // 現在時刻を分単位に変換（10時基準）
                          const currentMinutes = getCurrentTimeMinutes();
                          
                          // 選択された日付が未来の日付かどうかを判定
                          const now = new Date();
                          const currentHour = now.getHours();
                          
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
                          const [monthStr, dayStr] = selectedDate.split('/');
                          const paramMonth = parseInt(monthStr, 10);
                          const paramDay = parseInt(dayStr, 10);
                          const selectedDateObj = new Date(now.getFullYear(), paramMonth - 1, paramDay, 0, 0, 0);
                          const isFutureDate = selectedDateObj > businessToday;
                          
                          // 未来の日付の場合は「受付終了」にしない
                          // それ以外の場合（今日または過去の日付）で、出勤時間の終了時刻が現在時刻より前の場合は「受付終了」
                          if (!isFutureDate) {
                            // 出勤時間の終了時刻が現在時刻より前の場合、「受付終了」
                            // 例：11/12の23時（780分）と11/13の4時（1080分）を比較
                            if (attendanceEndMinutes < currentMinutes) {
                              isClosed = true;
                              // ログ出力を削除（パフォーマンス改善）
                            }
                          }
                        }
                      }
                      
                      return (
                        <Fragment key={`fragment-${girl.name}-${rowIndex}`}>
                          {isFirstClosed && (
                            <tr key={`divider-${rowIndex}`} className="border-t-4 border-red-300 bg-red-50">
                              <td colSpan={HOURS.length + 1} className="px-4 py-2 text-center">
                                <span className="text-red-700 font-bold text-sm">━━━ 受付終了 ━━━</span>
                              </td>
                            </tr>
                          )}
                          <tr
                            key={`${girl.name}-${rowIndex}`}
                            className={`hover:bg-gray-50 ${isClosed ? 'bg-red-50' : ''}`}
                          >
                          <td 
                            className={`px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 z-20 border-r border-gray-200 ${
                              isClosed ? 'bg-red-50' : 'bg-white'
                            } cursor-pointer hover:bg-gray-100 transition-colors`}
                            onClick={(e) => {
                              // 女性名のセルをクリックしたら「受付終了」状態を手動で切り替え
                              e.stopPropagation();
                              
                              const currentStatus = manualClosedStatus.get(girl.name);
                              const willBeClosed = currentStatus === undefined ? true : !currentStatus;
                              
                              // 確認ダイアログを表示
                              const message = willBeClosed 
                                ? `${girl.name}を受付終了にしますか？`
                                : `${girl.name}を受付可能に戻しますか？`;
                              
                              if (window.confirm(message)) {
                                setManualClosedStatus(prev => {
                                  const newMap = new Map(prev);
                                  newMap.set(girl.name, willBeClosed);
                                  return newMap;
                                });
                              }
                            }}
                            title="クリックで受付終了状態を切り替え"
                          >
                            <div className="flex flex-col gap-1 min-w-[120px]">
                              {girl.nameGohobi && girl.nameGussuri ? (
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-yellow-600 font-bold bg-yellow-50 px-1 rounded">ご</span>
                                    <span className="text-xs text-yellow-700 font-semibold">{girl.nameGohobi}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1 rounded">ぐ</span>
                                    <span className="text-xs text-blue-700 font-semibold">{girl.nameGussuri}</span>
                                  </div>
                                  {isClosed && (
                                    <span className="text-[10px] text-red-600 font-semibold">(受付終了)</span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  {detectedBrand === 'gohobi' && (
                                    <span className="text-[10px] text-yellow-600 font-bold bg-yellow-50 px-1 rounded">ご</span>
                                  )}
                                  {detectedBrand === 'gussuri' && (
                                    <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1 rounded">ぐ</span>
                                  )}
                                  {detectedBrand === 'chijo' && (
                                    <span className="text-[10px] text-purple-600 font-bold bg-purple-50 px-1 rounded">痴</span>
                                  )}
                                  <span className={detectedBrand === 'gohobi' ? 'text-xs text-yellow-700 font-semibold' : 
                                                    detectedBrand === 'gussuri' ? 'text-xs text-blue-700 font-semibold' :
                                                    detectedBrand === 'chijo' ? 'text-xs text-purple-700 font-semibold' :
                                                    'text-xs text-gray-700 font-semibold'}>
                                    {girl.name}
                                  </span>
                                  {isClosed && (
                                    <span className="text-xs text-red-600 font-semibold">(受付終了)</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td
                            colSpan={HOURS.length}
                            className={`px-0 py-1 relative ${isClosed ? '' : 'cursor-pointer'}`}
                            style={{ height: girl.nameGohobi && girl.nameGussuri ? '60px' : '40px' }}
                            onClick={() => {
                              if (!isClosed) {
                                setSelectedGirl(girl);
                                setFormData({
                                  brand: '',
                                  phone: '',
                                  customerName: '',
                                  memberType: 'F',
                                  castName: girl.nameGohobi || girl.nameGussuri || girl.name || '',
                                  startTime: '',
                                  startHour: '',
                                  startMinute: '',
                                  courseTime: '',
                                  extension: '',
                                  amount: '',
                                  actualStartTime: '',
                                  endTime: '',
                                  hotelLocation: '',
                                  roomNumber: '',
                                  option: '',
                                  transportationFee: '',
                                  discountName: '',
                                  note: '',
                                });
                                setShowAddReservationModal(true);
                              }
                            }}
                          >
                            {/* 時間帯の区切り線を表示（各時間の開始位置に目立つ線を追加） */}
                            <div className="absolute inset-0 flex">
                              {HOURS.map((hour, hourIndex) => (
                                <div
                                  key={hour}
                                  className="border-r border-gray-100 relative"
                                  style={{ width: '60px', flexShrink: 0 }}
                                >
                                  {/* 各時間の開始位置に目立つ線を表示 */}
                                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-300"></div>
                                </div>
                              ))}
                            </div>
                            
                            {/* 現在時刻のバー（未来の日付の場合は表示しない） */}
                            {!isFutureDate && currentTimeMinutes >= 0 && currentTimeMinutes <= TOTAL_MINUTES && (
                              <div
                                className="absolute top-0 h-full w-0.5 bg-red-500 z-50 pointer-events-none"
                                style={{
                                  left: `${(currentTimeMinutes / TOTAL_MINUTES) * 100}%`,
                                }}
                              />
                            )}
                            
                            {/* 予約ブロックを連続して表示 */}
                            <div className="relative w-full h-full bg-gray-50 overflow-hidden" style={{ zIndex: 1 }}>
                              {reservedSlots.map((slot, slotIndex) => {
                                // 全体のタイムラインでの位置を計算
                                const leftPercent = (slot.start / TOTAL_MINUTES) * 100;
                                const widthPercent = ((slot.end - slot.start) / TOTAL_MINUTES) * 100;
                                
                                // 受付内容の場合は色を変える
                                const isReception = slot.type === 'reception';
                                const isBuffer = slot.type === 'buffer';
                                const isAttendance = slot.type === 'attendance';
                                
                                // 受付ブロックの色をブランドに応じて決定
                                let bgColor: string;
                                if (isReception) {
                                  const brand = slot.data?.brand || '';
                                  if (brand.includes('ぐっすり')) {
                                    bgColor = 'bg-blue-500'; // ぐっすりは青色
                                  } else if (brand.includes('ごほうび')) {
                                    bgColor = 'bg-yellow-500'; // ごほうびは黄色
                                  } else if (brand.includes('痴女')) {
                                    bgColor = 'bg-purple-500'; // 痴女は紫色
                                  } else {
                                    bgColor = 'bg-orange-500'; // デフォルトはオレンジ
                                  }
                                } else {
                                  bgColor = getShopColor(slot.shop, slot.type);
                                }
                                
                                return (
                                  <div
                                    key={slotIndex}
                                    data-slot-block="true"
                                    className={`absolute ${bgColor} rounded text-xs flex items-center justify-center shadow-sm ${
                                      isAttendance ? 'cursor-default' : 'cursor-pointer hover:opacity-90'
                                    } ${
                                      isBuffer ? 'text-yellow-800' : isAttendance ? 'text-green-800' : 'text-white'
                                    }`}
                                    style={{
                                      left: `${leftPercent}%`,
                                      width: `${widthPercent}%`,
                                      top: isAttendance ? '0%' : '16.67%',
                                      height: isAttendance ? '100%' : '66.67%',
                                      minWidth: widthPercent > 2 ? 'auto' : '2px',
                                      zIndex: isAttendance ? 0 : (isReception ? 10 : (isBuffer ? 2 : 1)),
                                      pointerEvents: isAttendance ? 'none' : 'auto',
                                      opacity: isAttendance ? 0.6 : 1,
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation(); // 行のクリックイベントを停止
                                      
                                      // 受付ブロックをクリックした場合は編集モーダルを開く
                                      if (isReception && slot.data) {
                                        // ホバーポップアップを非表示にする
                                        setHoveredSlot(null);
                                        
                                        const reception = slot.data;
                                        // 開始時間とコース時間から終了時間を計算
                                        const startTimeStr = reception.startTime || '';
                                        const courseTime = reception.courseTime || 0;
                                        
                                        // 開始時間を時と分に分割
                                        let startHour = '';
                                        let startMinute = '';
                                        if (startTimeStr.includes(':')) {
                                          const [h, m] = startTimeStr.split(':');
                                          startHour = h;
                                          startMinute = m;
                                        } else if (startTimeStr.includes('.')) {
                                          const [h, m] = startTimeStr.split('.');
                                          startHour = h;
                                          startMinute = String(parseInt(m) * 6).padStart(2, '0');
                                        } else {
                                          startHour = startTimeStr;
                                          startMinute = '00';
                                        }
                                        
                                        setSelectedReception(reception);
                                        setFormData({
                                          brand: reception.brand || '',
                                          phone: reception.phone || '',
                                          customerName: reception.customerName || '',
                                          memberType: reception.memberType || 'F',
                                          castName: reception.castName || '',
                                          startTime: reception.startTime || '',
                                          startHour: startHour,
                                          startMinute: startMinute,
                                          courseTime: String(courseTime),
                                          extension: '',
                                          amount: reception.amount || '',
                                          actualStartTime: reception.actualStartTime || '',
                                          endTime: reception.endTime || '',
                                          hotelLocation: reception.hotelLocation || '',
                                          roomNumber: reception.roomNumber || '',
                                          option: reception.option || '',
                                          transportationFee: reception.transportationFee || '',
                                          discountName: reception.discountName || '',
                                          note: reception.note || '',
                                          staff: '',
                                        });
                                        setShowEditReceptionModal(true);
                                      }
                                    }}
                                    onMouseEnter={(e) => {
                                      // 編集モーダルが開いている場合はポップアップを表示しない
                                      if (showEditReceptionModal) {
                                        return;
                                      }
                                      
                                      console.log('[ポップアップ表示] onMouseEnter開始:', {
                                        type: slot.type,
                                        isReception,
                                        isBuffer,
                                        isAttendance,
                                      });
                                      
                                      // 既存のタイムアウトをクリア
                                      const existingTimeout = (e.currentTarget as any)._popupTimeout;
                                      if (existingTimeout) {
                                        clearTimeout(existingTimeout);
                                      }
                                      
                                      // 既存のhideTimeoutもクリア
                                      const existingHideTimeout = (e.currentTarget as any)._hideTimeout;
                                      if (existingHideTimeout) {
                                        clearTimeout(existingHideTimeout);
                                        (e.currentTarget as any)._hideTimeout = null;
                                      }
                                      
                                      // currentTargetを事前に取得
                                      const target = e.currentTarget;
                                      if (!target) {
                                        console.log('[ポップアップ表示] エラー: targetがnull');
                                        return;
                                      }
                                      
                                      // 少し遅延を入れてポップアップを表示（マウスが安定してから）
                                      const timeoutId = setTimeout(() => {
                                        console.log('[ポップアップ表示] setTimeout実行:', {
                                          type: slot.type,
                                          isReception,
                                        });
                                        // targetがまだDOMに存在するかチェック
                                        if (!target || !document.body.contains(target)) {
                                          return;
                                        }
                                        
                                        const rect = target.getBoundingClientRect();
                                        
                                        // ガントチャートのコンテナを取得
                                        const kanbanContainer = target.closest('.overflow-auto.h-full');
                                        
                                        if (!kanbanContainer) {
                                          return;
                                        }
                                        
                                        const containerRect = (kanbanContainer as HTMLElement).getBoundingClientRect();
                                        
                                        // ポップアップをブロックの右側に表示（すぐ近くに）
                                        const popupWidth = 400;
                                        const popupHeight = 300;
                                        
                                        // 画面全体に対する絶対位置を計算（fixedポジション用）
                                        let popupX = rect.right + 10; // ブロックの右側に10pxの余白
                                        let popupY = rect.top + rect.height / 2; // ブロックの中央
                                        
                                        // 画面の幅と高さを取得
                                        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
                                        const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
                                        
                                        // 右側に表示できない場合は左側に
                                        if (popupX + popupWidth > viewportWidth) {
                                          popupX = rect.left - popupWidth - 10;
                                        }
                                        
                                        // 左側にも表示できない場合は、ブロックの上に表示
                                        if (popupX < 10) {
                                          popupX = Math.max(10, rect.left);
                                          popupY = Math.max(popupHeight / 2 + 10, rect.top - popupHeight - 10);
                                        }
                                        
                                        // 上端・下端のチェック
                                        if (popupY - popupHeight / 2 < 10) {
                                          popupY = popupHeight / 2 + 10;
                                        } else if (popupY + popupHeight / 2 > viewportHeight - 10) {
                                          popupY = Math.max(popupHeight / 2 + 10, viewportHeight - popupHeight / 2 - 10);
                                        }
                                        
                                        // 最終的な位置が負の値にならないようにする
                                        popupX = Math.max(10, popupX);
                                        popupY = Math.max(popupHeight / 2 + 10, popupY);
                                        
                                        const hoveredSlotData = {
                                          type: slot.type,
                                          data: slot.data,
                                          x: popupX,
                                          y: popupY,
                                        };
                                        
                                        console.log('[ポップアップ表示] 受付ブロックにマウスオーバー:', {
                                          type: slot.type,
                                          isReception,
                                          hoveredSlotData,
                                          dataKeys: Object.keys(slot.data || {}),
                                          hasData: !!slot.data,
                                        });
                                        
                                        console.log('[ポップアップ表示] setHoveredSlotを呼び出し:', hoveredSlotData);
                                        setHoveredSlot(hoveredSlotData);
                                        
                                        // 状態更新を確認
                                        setTimeout(() => {
                                          console.log('[ポップアップ表示] 状態更新後の確認（次のレンダリングで確認）');
                                        }, 100);
                                      }, 50);
                                      
                                      // タイムアウトIDを保存（クリーンアップ用）
                                      (target as any)._popupTimeout = timeoutId;
                                    }}
                                    onMouseLeave={(e) => {
                                      const relatedTarget = e.relatedTarget as HTMLElement;
                                      console.log('[ポップアップ表示] onMouseLeave:', {
                                        type: slot.type,
                                        isReception,
                                        relatedTargetTag: relatedTarget?.tagName,
                                        relatedTargetClass: relatedTarget?.className,
                                      });
                                      
                                      // 受付ブロックの場合、マウスが他のブロック（バッファ、出勤時間）に移動した場合は閉じない
                                      if (isReception) {
                                        // 同じ行内の他のブロックに移動した場合は閉じない
                                        if (relatedTarget && relatedTarget.closest('[data-slot-block]')) {
                                          console.log('[ポップアップ表示] 他のブロックに移動したため閉じない');
                                          return;
                                        }
                                        // ポップアップに移動している場合は閉じない
                                        if (relatedTarget && relatedTarget.closest('.fixed.z-\\[100\\]')) {
                                          console.log('[ポップアップ表示] ポップアップに移動しているため閉じない');
                                          return;
                                        }
                                        // コンテナ（予約ブロックの親要素）に移動した場合は閉じない（マウスがまだブロックエリア内にある）
                                        if (relatedTarget && (
                                          relatedTarget.classList.contains('relative') ||
                                          relatedTarget.classList.contains('bg-gray-50') ||
                                          relatedTarget.closest('.relative.bg-gray-50')
                                        )) {
                                          console.log('[ポップアップ表示] コンテナに移動したため閉じない');
                                          return;
                                        }
                                      }
                                      
                                      // タイムアウトをクリア
                                      const timeoutId = (e.currentTarget as any)._popupTimeout;
                                      if (timeoutId) {
                                        clearTimeout(timeoutId);
                                        (e.currentTarget as any)._popupTimeout = null;
                                      }
                                      
                                      // ポップアップに移動する時間を確保するため、遅延を長くする（受付の場合は1000ms）
                                      const hideTimeoutId = setTimeout(() => {
                                        // ポップアップがまだ表示されているかチェック（マウスがポップアップに移動した場合は維持される）
                                        const relatedTarget = e.relatedTarget as HTMLElement;
                                        // ポップアップに移動している場合は閉じない
                                        if (relatedTarget && relatedTarget.closest('.fixed.z-\\[100\\]')) {
                                          console.log('[ポップアップ表示] ポップアップに移動しているため閉じない');
                                          return;
                                        }
                                        console.log('[ポップアップ表示] ポップアップを閉じる');
                                        setHoveredSlot((current) => {
                                          // 現在のポップアップがこのスロットのものかチェック
                                          if (current && current.type === slot.type && 
                                              JSON.stringify(current.data) === JSON.stringify(slot.data)) {
                                            // ポップアップにマウスが移動した可能性があるので、維持する
                                            return current;
                                          }
                                          return null;
                                        });
                                      }, isReception ? 1000 : 500);
                                      
                                      // タイムアウトIDを保存（クリーンアップ用）
                                      (e.currentTarget as any)._hideTimeout = hideTimeoutId;
                                    }}
                                  >
                                    {widthPercent > 3 && !isBuffer && !isAttendance && (
                                      <span className="px-1 truncate text-[10px] font-semibold">
                                        {isReception ? '受付' : slot.shop.substring(0, 2)}
                                      </span>
                                    )}
                                    {isAttendance && widthPercent > 5 && (
                                      <span className="px-1 truncate text-[10px] font-semibold text-gray-600">
                                        出勤
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 出勤管理テーブルは削除（/attendanceページに移動） */}

        {/* ポップアップ - ガントチャート内に表示 */}
        {hoveredSlot && !showEditReceptionModal && (() => {
                console.log('[ポップアップ表示] ポップアップをレンダリング:', {
                  type: hoveredSlot.type,
                  x: hoveredSlot.x,
                  y: hoveredSlot.y,
                  hasData: !!hoveredSlot.data,
                  dataKeys: hoveredSlot.data ? Object.keys(hoveredSlot.data) : [],
                  viewMode: 'reservations',
                });
                return (
                  <div
                    key={`popup-${hoveredSlot.type}-${hoveredSlot.x}-${hoveredSlot.y}`}
                    className="fixed z-[100] bg-white rounded-lg shadow-2xl border-2 border-gray-300 p-4 max-w-md pointer-events-auto"
                    style={{
                      left: `${Math.max(10, hoveredSlot.x)}px`,
                      top: `${Math.max(10, hoveredSlot.y)}px`,
                      transform: 'translateY(-50%)',
                      maxWidth: '400px',
                      minWidth: '300px',
                    }}
                onMouseEnter={(e) => {
                  // ポップアップにマウスが入った時、すべてのhideTimeoutをクリア
                  e.stopPropagation();
                  // ポップアップ自体のhideTimeoutもクリア
                  const popupHideTimeout = (e.currentTarget as any)._popupHideTimeout;
                  if (popupHideTimeout) {
                    clearTimeout(popupHideTimeout);
                    (e.currentTarget as any)._popupHideTimeout = null;
                  }
                  // すべての予約ブロックのhideTimeoutをクリア
                  document.querySelectorAll('[data-slot-block]').forEach((el) => {
                    const hideTimeout = (el as any)._hideTimeout;
                    if (hideTimeout) {
                      clearTimeout(hideTimeout);
                      (el as any)._hideTimeout = null;
                    }
                  });
                }}
                onMouseLeave={(e) => {
                  // ×ボタンにマウスが移動した場合は閉じない
                  const target = e.relatedTarget as HTMLElement;
                  if (target && (target.closest('button[aria-label="閉じる"]') || target.closest('svg'))) {
                    return;
                  }
                  // スロットブロックに戻っている場合は閉じない
                  if (target && target.closest('[data-slot-block]')) {
                    return;
                  }
                  // ポップアップから完全に離れた時だけ消す（遅延を長くする）
                  const hideTimeoutId = setTimeout(() => {
                    setHoveredSlot(null);
                  }, 300);
                  // タイムアウトIDを保存（クリーンアップ用）
                  (e.currentTarget as any)._popupHideTimeout = hideTimeoutId;
                }}
              >
                {/* 閉じるボタン */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setHoveredSlot(null);
                  }}
                  className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 focus:outline-none z-10"
                  aria-label="閉じる"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
            {hoveredSlot.type === 'attendance' ? (
              <div className="space-y-2">
                <h3 className="font-bold text-lg text-gray-900 border-b pb-2">
                  出勤時間
                </h3>
                <div className="space-y-1 text-sm">
                  <div className="flex">
                    <span className="font-semibold text-gray-600 w-24">開始:</span>
                    <span className="text-gray-900">
                      {minutesToTime(hoveredSlot.data.start)}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="font-semibold text-gray-600 w-24">終了:</span>
                    <span className="text-gray-900">
                      {minutesToTime(hoveredSlot.data.end)}
                    </span>
                  </div>
                </div>
              </div>
            ) : hoveredSlot.type === 'buffer' ? (
              <div className="space-y-2">
                <h3 className="font-bold text-lg text-gray-900 border-b pb-2">
                  空き時間
                </h3>
                <div className="space-y-1 text-sm">
                  <p className="text-gray-700">{hoveredSlot.data.message}</p>
                  <p className="text-xs text-gray-500">次の案内まで30分の間隔が必要です</p>
                </div>
              </div>
            ) : hoveredSlot.type === 'reservation' ? (
              <div className="space-y-2">
                <h3 className="font-bold text-lg text-gray-900 border-b pb-2">
                  予約情報
                </h3>
                <div className="space-y-1 text-sm">
                  <div className="flex">
                    <span className="font-semibold text-gray-600 w-24">店舗:</span>
                    <span className="text-gray-900">{hoveredSlot.data.shop}</span>
                  </div>
                  <div className="flex">
                    <span className="font-semibold text-gray-600 w-24">時間:</span>
                    <span className="text-gray-900">
                      {hoveredSlot.data.startHour}時{hoveredSlot.data.startMinute.toString().padStart(2, '0')}分 - {hoveredSlot.data.endHour}時{hoveredSlot.data.endMinute.toString().padStart(2, '0')}分
                    </span>
                  </div>
                  <div className="flex">
                    <span className="font-semibold text-gray-600 w-24">時間:</span>
                    <span className="text-gray-900">{hoveredSlot.data.duration}分</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <h3 className="font-bold text-lg text-gray-900 border-b pb-2">
                  受付情報
                </h3>
                <div className="space-y-1 text-sm max-h-96 overflow-y-auto">
                  {hoveredSlot.data.brand && (
                    <div className="flex">
                      <span className="font-semibold text-gray-600 w-28">ブランド:</span>
                      <span className="text-gray-900">{hoveredSlot.data.brand}</span>
                    </div>
                  )}
                  {hoveredSlot.data.customerName && (
                    <div className="flex">
                      <span className="font-semibold text-gray-600 w-28">お客様名:</span>
                      <span className="text-gray-900">{hoveredSlot.data.customerName}</span>
                    </div>
                  )}
                  {hoveredSlot.data.phone && (
                    <div className="flex">
                      <span className="font-semibold text-gray-600 w-28">電話番号:</span>
                      <span className="text-gray-900">{hoveredSlot.data.phone}</span>
                    </div>
                  )}
                  {hoveredSlot.data.memberType && (
                    <div className="flex">
                      <span className="font-semibold text-gray-600 w-28">会員区分:</span>
                      <span className="text-gray-900">{hoveredSlot.data.memberType}</span>
                    </div>
                  )}
                  {hoveredSlot.data.castName && (
                    <div className="flex">
                      <span className="font-semibold text-gray-600 w-28">キャスト名:</span>
                      <span className="text-gray-900">{hoveredSlot.data.castName}</span>
                    </div>
                  )}
                  {hoveredSlot.data.startTime && (
                    <div className="flex">
                      <span className="font-semibold text-gray-600 w-28">開始時間:</span>
                      <span className="text-gray-900">{hoveredSlot.data.startTime}</span>
                    </div>
                  )}
                  {hoveredSlot.data.courseTime && (
                    <div className="flex">
                      <span className="font-semibold text-gray-600 w-28">コース時間:</span>
                      <span className="text-gray-900">{hoveredSlot.data.courseTime}分</span>
                    </div>
                  )}
                  {hoveredSlot.data.amount && (
                    <div className="flex">
                      <span className="font-semibold text-gray-600 w-28">金額:</span>
                      <span className="text-gray-900">{hoveredSlot.data.amount}</span>
                    </div>
                  )}
                  {hoveredSlot.data.actualStartTime && (
                    <div className="flex">
                      <span className="font-semibold text-gray-600 w-28">実際開始:</span>
                      <span className="text-gray-900">{hoveredSlot.data.actualStartTime}</span>
                    </div>
                  )}
                  {hoveredSlot.data.endTime && (
                    <div className="flex">
                      <span className="font-semibold text-gray-600 w-28">終了時間:</span>
                      <span className="text-gray-900">{hoveredSlot.data.endTime}</span>
                    </div>
                  )}
                  {hoveredSlot.data.hotelLocation && (
                    <div className="flex">
                      <span className="font-semibold text-gray-600 w-28">ホテル:</span>
                      <span className="text-gray-900">{hoveredSlot.data.hotelLocation}</span>
                    </div>
                  )}
                  {hoveredSlot.data.roomNumber && (
                    <div className="flex">
                      <span className="font-semibold text-gray-600 w-28">部屋番号:</span>
                      <span className="text-gray-900">{hoveredSlot.data.roomNumber}</span>
                    </div>
                  )}
                  {hoveredSlot.data.option && (
                    <div className="flex">
                      <span className="font-semibold text-gray-600 w-28">オプション:</span>
                      <span className="text-gray-900">{hoveredSlot.data.option}</span>
                    </div>
                  )}
                  {hoveredSlot.data.transportationFee && (
                    <div className="flex">
                      <span className="font-semibold text-gray-600 w-28">交通費:</span>
                      <span className="text-gray-900">{hoveredSlot.data.transportationFee}</span>
                    </div>
                  )}
                  {hoveredSlot.data.discountName && (
                    <div className="flex">
                      <span className="font-semibold text-gray-600 w-28">割引名:</span>
                      <span className="text-gray-900">{hoveredSlot.data.discountName}</span>
                    </div>
                  )}
                  {hoveredSlot.data.note && (
                    <div className="flex flex-col">
                      <span className="font-semibold text-gray-600 w-28 mb-1">備考:</span>
                      <span className="text-gray-900 whitespace-pre-wrap">{hoveredSlot.data.note}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
              </div>
            );
          })()}

        {/* 予約追加モーダル */}
        {showAddReservationModal && selectedGirl && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">予約追加</h2>
                <button
                  onClick={() => setShowAddReservationModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  
                  // 開始時間のバリデーション
                  if (!formData.startHour || !formData.startMinute) {
                    alert('開始時間を入力してください');
                    return;
                  }
                  
                  try {
                    const response = await fetch('/api/reservations/add', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        date: selectedDate,
                        ...formData,
                        // 開始時間をHH:MM形式に変換
                        startTime: formData.startHour && formData.startMinute 
                          ? `${String(formData.startHour).padStart(2, '0')}:${String(formData.startMinute).padStart(2, '0')}`
                          : formData.startTime,
                      }),
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                      setShowAddReservationModal(false);
                      // データを再取得
                      fetchReservations();
                      alert('予約が追加されました');
                    } else {
                      alert(`エラー: ${result.error}`);
                    }
                  } catch (err: any) {
                    alert(`エラー: ${err.message}`);
                  }
                }}
                className="p-6 space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ブランド名 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.brand}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">選択してください</option>
                      {(() => {
                        const castBrand = formData.castName ? getBrandFromCastName(formData.castName) : null;
                        const availableBrands: Array<{ value: string; label: string }> = [];
                        
                        // キャスト名からブランドが判定できる場合は、そのブランドのみ表示
                        if (castBrand === 'gohobi') {
                          availableBrands.push({ value: 'ごほうび', label: 'ごほうび' });
                        } else if (castBrand === 'gussuri') {
                          availableBrands.push({ value: 'ぐっすり', label: 'ぐっすり' });
                        } else if (castBrand === 'chijo') {
                          availableBrands.push({ value: '痴女', label: '痴女' });
                        } else {
                          // ブランドが判定できない場合は、すべてのブランドを表示
                          availableBrands.push(
                            { value: 'ごほうび', label: 'ごほうび' },
                            { value: 'ぐっすり', label: 'ぐっすり' },
                            { value: '痴女', label: '痴女' }
                          );
                        }
                        
                        return availableBrands.map(brand => (
                          <option key={brand.value} value={brand.value}>
                            {brand.label}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      電話番号
                    </label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    担当
                  </label>
                  <input
                    type="text"
                    list="staff-list"
                    value={formData.staff}
                    onChange={(e) => setFormData({ ...formData, staff: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="担当を選択または入力"
                  />
                  <datalist id="staff-list">
                    {staffList.map((staff, index) => (
                      <option key={index} value={staff} />
                    ))}
                  </datalist>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      お客様名 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.customerName}
                      onChange={(e) => {
                        const katakanaValue = toKatakana(e.target.value);
                        setFormData({ ...formData, customerName: katakanaValue });
                      }}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      会員区分 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.memberType}
                      onChange={(e) => setFormData({ ...formData, memberType: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="F">新規</option>
                      <option value="J">指名</option>
                      <option value="S">本指名</option>
                    </select>
                  </div>
                </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      キャスト名 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.castName}
                      onChange={(e) => {
                        const newCastName = e.target.value;
                        const castBrand = getBrandFromCastName(newCastName);
                        // キャスト名が変更されたときに、ブランドを自動選択
                        let newBrand = formData.brand;
                        if (castBrand === 'gohobi') {
                          newBrand = 'ごほうび';
                        } else if (castBrand === 'gussuri') {
                          newBrand = 'ぐっすり';
                        } else if (castBrand === 'chijo') {
                          newBrand = '痴女';
                        }
                        setFormData({ ...formData, castName: newCastName, brand: newBrand });
                      }}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      開始時間 <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <input
                          type="number"
                          value={formData.startHour}
                          onChange={(e) => {
                            const halfWidthValue = toHalfWidthNumber(e.target.value);
                            const value = halfWidthValue.replace(/[^\d]/g, ''); // 数字以外を除去
                            if (value === '' || (parseInt(value) >= 0 && parseInt(value) <= 23)) {
                              setFormData({ ...formData, startHour: value });
                            }
                          }}
                          required
                          min="0"
                          max="23"
                          placeholder="時"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <span className="flex items-center text-gray-500">:</span>
                      <div className="flex-1">
                        <input
                          type="number"
                          value={formData.startMinute}
                          onChange={(e) => {
                            const halfWidthValue = toHalfWidthNumber(e.target.value);
                            const value = halfWidthValue.replace(/[^\d]/g, ''); // 数字以外を除去
                            if (value === '' || (parseInt(value) >= 0 && parseInt(value) <= 59)) {
                              setFormData({ ...formData, startMinute: value });
                            }
                          }}
                          required
                          min="0"
                          max="59"
                          placeholder="分"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      コース時間（分） <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        list="course-time-list"
                        value={formData.courseTime}
                        onChange={(e) => {
                          const halfWidthValue = toHalfWidthNumber(e.target.value);
                          // 数字のみを許可（小数点も許可しない）
                          const value = halfWidthValue.replace(/[^\d]/g, ''); // 数字以外を除去
                          setFormData({ ...formData, courseTime: value });
                        }}
                        onBlur={(e) => {
                          // フォーカスが外れたときに、候補から選択された値に一致するか確認
                          const value = e.target.value;
                          if (value) {
                            const suggestions = getCourseTimeSuggestions();
                            const matched = suggestions.find(c => c.time.toString() === value);
                            if (matched) {
                              // 一致する場合は、その値を設定
                              setFormData((prev) => ({ ...prev, courseTime: matched.time.toString() }));
                            }
                          }
                        }}
                        required
                        placeholder="コース時間を入力または選択"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <datalist id="course-time-list">
                        {getCourseTimeSuggestions().map((course, index) => (
                          <option key={index} value={course.time.toString()}>
                            {course.time}分（¥{course.price.toLocaleString()}）
                          </option>
                        ))}
                      </datalist>
                    </div>
                    {formData.brand && pricingData && (
                      <p className="mt-1 text-xs text-gray-500">
                        ※ {getCourseTimeSuggestions().length}件の候補があります
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    延長
                  </label>
                  <input
                    type="text"
                    value={formData.extension}
                    onChange={(e) => setFormData({ ...formData, extension: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    金額
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="自動算出されます"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const calculatedPrice = calculatePrice();
                        if (calculatedPrice) {
                          setFormData((prev) => ({ ...prev, amount: calculatedPrice }));
                        }
                      }}
                      className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm whitespace-nowrap"
                    >
                      再計算
                    </button>
                  </div>
                  {pricingData && (
                    <p className="mt-1 text-xs text-gray-500">
                      ※ ブランド、コース時間、会員区分を入力すると自動で料金が算出されます（オプション、割引名は任意です）
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      実際に開始した時間
                    </label>
                    <input
                      type="time"
                      value={formData.actualStartTime}
                      onChange={(e) => setFormData({ ...formData, actualStartTime: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      終了した時間
                    </label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ホテルの場所
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        list="hotel-list"
                        value={formData.hotelLocation}
                        onChange={(e) => {
                          const hotelName = e.target.value;
                          setFormData({ 
                            ...formData, 
                            hotelLocation: hotelName,
                            // 交通費を自動算出
                            transportationFee: calculateTransportationFee(hotelName),
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="ホテル名を入力または選択"
                      />
                      <datalist id="hotel-list">
                        {hotelOptions.map((hotel, index) => (
                          <option key={index} value={hotel} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      部屋番号
                    </label>
                    <input
                      type="text"
                      value={formData.roomNumber}
                      onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    オプション
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      list="option-list"
                      value={formData.option}
                      onChange={(e) => setFormData({ ...formData, option: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="オプション名を入力または選択"
                    />
                    <datalist id="option-list">
                      {getOptionSuggestions().map((option, index) => (
                        <option key={index} value={option.name}>
                          {option.name}（¥{option.price.toLocaleString()}）
                        </option>
                      ))}
                    </datalist>
                  </div>
                  {formData.brand && pricingData && (
                    <p className="mt-1 text-xs text-gray-500">
                      ※ {getOptionSuggestions().length}件の候補があります
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      交通費
                    </label>
                    <input
                      type="text"
                      value={formData.transportationFee}
                      onChange={(e) => setFormData({ ...formData, transportationFee: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="自動算出されます"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      割引名
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        list="discount-list"
                        value={formData.discountName}
                        onChange={(e) => setFormData({ ...formData, discountName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="割引名を入力または選択"
                      />
                      <datalist id="discount-list">
                        {getDiscountSuggestions().map((discount, index) => (
                          <option key={index} value={discount} />
                        ))}
                      </datalist>
                    </div>
                    {formData.brand && formData.courseTime && pricingData && (
                      <p className="mt-1 text-xs text-gray-500">
                        ※ {getDiscountSuggestions().length}件の候補があります
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    備考
                  </label>
                  <textarea
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowAddReservationModal(false)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    追加
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 受付編集モーダル */}
        {showEditReceptionModal && selectedReception && (
          <div className="fixed inset-0 bg-black bg-opacity-10 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">受付情報編集</h2>
                <button
                  onClick={() => setShowEditReceptionModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  
                  // 開始時間のバリデーション
                  if (!formData.startHour || !formData.startMinute) {
                    alert('開始時間を入力してください');
                    return;
                  }
                  
                  try {
                    const response = await fetch('/api/receptions/update', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        date: selectedDate,
                        rowIndex: selectedReception.rowIndex, // 元の行番号
                        ...formData,
                        // 開始時間をHH:MM形式に変換
                        startTime: formData.startHour && formData.startMinute 
                          ? `${String(formData.startHour).padStart(2, '0')}:${String(formData.startMinute).padStart(2, '0')}`
                          : formData.startTime,
                      }),
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                      setShowEditReceptionModal(false);
                      // データを再取得
                      fetchReservations();
                      alert('受付情報が更新されました');
                    } else {
                      alert(`エラー: ${result.error}`);
                    }
                  } catch (err: any) {
                    alert(`エラー: ${err.message}`);
                  }
                }}
                className="p-6 space-y-4"
              >
                {/* 予約追加フォームと同じフィールドを使用 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ブランド名 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.brand}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">選択してください</option>
                      <option value="ごほうび">ごほうび</option>
                      <option value="ぐっすり">ぐっすり</option>
                      <option value="痴女">痴女</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      電話番号
                    </label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      お客様名 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.customerName}
                      onChange={(e) => {
                        const katakanaValue = toKatakana(e.target.value);
                        setFormData({ ...formData, customerName: katakanaValue });
                      }}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      会員区分 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.memberType}
                      onChange={(e) => setFormData({ ...formData, memberType: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="F">新規</option>
                      <option value="J">指名</option>
                      <option value="S">本指名</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    キャスト名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.castName}
                    onChange={(e) => setFormData({ ...formData, castName: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      開始時間 <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <input
                          type="number"
                          value={formData.startHour}
                          onChange={(e) => {
                            const halfWidthValue = toHalfWidthNumber(e.target.value);
                            const value = halfWidthValue.replace(/[^\d]/g, '');
                            if (value === '' || (parseInt(value) >= 0 && parseInt(value) <= 23)) {
                              setFormData({ ...formData, startHour: value });
                            }
                          }}
                          required
                          min="0"
                          max="23"
                          placeholder="時"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <span className="flex items-center text-gray-500">:</span>
                      <div className="flex-1">
                        <input
                          type="number"
                          value={formData.startMinute}
                          onChange={(e) => {
                            const halfWidthValue = toHalfWidthNumber(e.target.value);
                            const value = halfWidthValue.replace(/[^\d]/g, '');
                            if (value === '' || (parseInt(value) >= 0 && parseInt(value) <= 59)) {
                              setFormData({ ...formData, startMinute: value });
                            }
                          }}
                          required
                          min="0"
                          max="59"
                          placeholder="分"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      コース時間（分） <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.courseTime}
                      onChange={(e) => {
                        const halfWidthValue = toHalfWidthNumber(e.target.value);
                        const value = halfWidthValue.replace(/[^\d]/g, '');
                        setFormData({ ...formData, courseTime: value });
                      }}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    金額
                  </label>
                  <input
                    type="text"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      実際に開始した時間
                    </label>
                    <input
                      type="time"
                      value={formData.actualStartTime}
                      onChange={(e) => setFormData({ ...formData, actualStartTime: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      終了した時間
                    </label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ホテルの場所
                    </label>
                    <input
                      type="text"
                      value={formData.hotelLocation}
                      onChange={(e) => setFormData({ ...formData, hotelLocation: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      部屋番号
                    </label>
                    <input
                      type="text"
                      value={formData.roomNumber}
                      onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    オプション
                  </label>
                  <input
                    type="text"
                    value={formData.option}
                    onChange={(e) => setFormData({ ...formData, option: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      交通費
                    </label>
                    <input
                      type="text"
                      value={formData.transportationFee}
                      onChange={(e) => setFormData({ ...formData, transportationFee: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      割引名
                    </label>
                    <input
                      type="text"
                      value={formData.discountName}
                      onChange={(e) => setFormData({ ...formData, discountName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    備考
                  </label>
                  <textarea
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowEditReceptionModal(false)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    更新
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* チャットメッセージ生成モーダルは削除（/chat-messagesページに移動） */}
      </div>
    </div>
  );
}

