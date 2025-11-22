'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { SHEETS, SheetData } from '@/app/lib/types';

export default function AttendancePage() {
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('578404798');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 出勤管理データの取得
  const fetchSheetData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/sheets?gid=${selectedSheet}`);
      const data: SheetData = await response.json();
      
      // クォータエラーのチェック
      if (response.status === 429 || (data as any).quotaExceeded) {
        setError('Google Sheets APIのクォータ制限に達しました。しばらく待ってから再度お試しください。');
        return;
      }
      
      if (data.success) {
        setSheetData(data);
        setError(null);
      } else {
        setError(data.error || 'データの取得に失敗しました');
      }
    } catch (err: any) {
      setError(err.message || 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [selectedSheet]);

  useEffect(() => {
    fetchSheetData();
    // クォータエラーを避けるため、更新間隔を120秒に変更
    const interval = setInterval(fetchSheetData, 120000); // 120秒
    return () => clearInterval(interval);
  }, [fetchSheetData]);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                出勤管理システム
              </h1>
              <p className="text-gray-600 mb-2">
                キャストの出勤状況を確認できます
              </p>
              <p className="text-sm text-gray-500">
                ※ 120秒ごとに自動更新されます
              </p>
            </div>
            <nav className="flex gap-2">
              <Link
                href="/reservations"
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors text-sm"
              >
                予約状況
              </Link>
              <div className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm">
                出勤管理
              </div>
              <Link
                href="/chat-messages"
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors text-sm"
              >
                チャットメッセージ生成
              </Link>
              <Link
                href="/map"
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors text-sm"
              >
                現在地マップ
              </Link>
              <Link
                href="/knowledge"
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors text-sm"
              >
                ナレッジ
              </Link>
            </nav>
          </div>
        </header>

        {/* シート選択 */}
        <div className="mb-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="flex items-center gap-2">
            <label htmlFor="sheet-select" className="text-sm font-medium text-gray-700">
              シート選択:
            </label>
            <select
              id="sheet-select"
              value={selectedSheet}
              onChange={(e) => setSelectedSheet(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SHEETS.map((sheet) => (
                <option key={sheet.gid} value={sheet.gid}>
                  {sheet.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* ローディング表示 */}
        {loading && !sheetData && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">データを読み込んでいます...</p>
          </div>
        )}

        {/* 出勤管理テーブル */}
        {sheetData && sheetData.success && sheetData.dates && sheetData.casts && (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            {sheetData.sheetName && (
              <div className="px-6 py-3 bg-gray-100 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  {sheetData.sheetName}
                </h2>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 border-r border-gray-200">
                      キャスト名
                    </th>
                    {sheetData.dates.map((date, index) => (
                      <th
                        key={index}
                        className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]"
                      >
                        {date}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sheetData.casts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={(sheetData.dates?.length || 0) + 1}
                        className="px-6 py-4 text-center text-gray-500"
                      >
                        データがありません
                      </td>
                    </tr>
                  ) : (
                    sheetData.casts.map((cast, rowIndex) => (
                      <tr key={rowIndex} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white z-10 border-r border-gray-200">
                          {cast.name}
                        </td>
                        {sheetData.dates?.map((date, colIndex) => {
                          const schedule = cast.schedule[date];
                          return (
                            <td
                              key={colIndex}
                              className="px-4 py-4 whitespace-nowrap text-sm text-center text-gray-900"
                            >
                              {schedule ? (
                                <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded">
                                  {schedule}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

