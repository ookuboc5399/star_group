'use client';

import { useEffect, useState } from 'react';

interface SheetData {
  success: boolean;
  headers?: string[];
  data?: Record<string, any>[];
  error?: string;
}

export default function Home() {
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSheetData();
    // 30秒ごとにデータを更新
    const interval = setInterval(fetchSheetData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchSheetData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/sheets');
      const data: SheetData = await response.json();
      
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
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            出勤管理システム
          </h1>
          <p className="text-gray-600">
            キャストの出勤状況と予約情報を確認できます
          </p>
        </header>

        <div className="mb-4 flex justify-between items-center">
          <button
            onClick={fetchSheetData}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '更新中...' : '更新'}
          </button>
          {sheetData && (
            <span className="text-sm text-gray-500">
              最終更新: {new Date().toLocaleTimeString('ja-JP')}
            </span>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            <p className="font-semibold">エラー</p>
            <p>{error}</p>
          </div>
        )}

        {loading && !sheetData && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">データを読み込んでいます...</p>
          </div>
        )}

        {sheetData && sheetData.success && sheetData.data && (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {sheetData.headers?.map((header, index) => (
                      <th
                        key={index}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sheetData.data.length === 0 ? (
                    <tr>
                      <td
                        colSpan={sheetData.headers?.length || 1}
                        className="px-6 py-4 text-center text-gray-500"
                      >
                        データがありません
                      </td>
                    </tr>
                  ) : (
                    sheetData.data.map((row, rowIndex) => (
                      <tr key={rowIndex} className="hover:bg-gray-50">
                        {sheetData.headers?.map((header, colIndex) => (
                          <td
                            key={colIndex}
                            className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                          >
                            {row[header] !== undefined && row[header] !== null
                              ? String(row[header])
                              : '-'}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && !sheetData && !error && (
          <div className="text-center py-12">
            <p className="text-gray-500">データがありません</p>
          </div>
        )}
      </div>
    </div>
  );
}
