'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { formatDate, getBusinessDate } from '@/app/lib/utils';

interface WebReservation {
  brand: string;
  phone: string;
  customerName: string;
  castName: string;
  startTime: string;
  courseTime: string;
  hotelName: string;
  rowIndex: number;
}

export default function ChatMessagesPage() {
  const [webReservations, setWebReservations] = useState<WebReservation[]>([]);
  const [selectedWebReservation, setSelectedWebReservation] = useState<number | null>(null);
  const [messageType, setMessageType] = useState<'advance' | 'gohobi-new' | 'gohobi-new-2' | 'chijo-new' | 'gussuri-new' | 'confirm' | 'confirm-hotel' | 'price-change' | 'cast-absence' | 'time-change-request'>('advance');
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    const businessDate = getBusinessDate(now);
    return formatDate(businessDate);
  });

  const generateChatMessage = useCallback((
    reservation: WebReservation,
    type: 'advance' | 'gohobi-new' | 'gohobi-new-2' | 'chijo-new' | 'gussuri-new' | 'confirm' | 'confirm-hotel' | 'price-change' | 'cast-absence' | 'time-change-request'
  ): string => {
    // 開始時間をパース（例: "15:00" または "15.5"）
    let startHour = 0;
    let startMinute = 0;
    if (reservation.startTime.includes(':')) {
      const [h, m] = reservation.startTime.split(':');
      startHour = parseInt(h, 10);
      startMinute = parseInt(m, 10);
    } else if (reservation.startTime.includes('.')) {
      const [h, m] = reservation.startTime.split('.');
      startHour = parseInt(h, 10);
      startMinute = parseInt(m, 10) * 6; // 0.5 = 30分
    }

    // 日付を取得（選択された日付または今日）
    const [month, day] = selectedDate.split('/');
    const dateStr = `${month}/${day}`;

    // 時間文字列を生成
    const timeStr = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;
    const endMinute = startMinute + 30;
    const endHour = startHour + Math.floor(endMinute / 60);
    const endMinuteMod = endMinute % 60;
    const timeRangeStr = `${timeStr}～${endHour.toString().padStart(2, '0')}:${endMinuteMod.toString().padStart(2, '0')}`;

    // コース時間を数値に変換
    const courseTimeNum = parseInt(reservation.courseTime.replace(/[^0-9]/g, ''), 10) || 0;

    // スタッフ名（デフォルト: 大久保）
    const staffName = '大久保';
    
    // ブランドに応じて店舗名を決定
    const brand = reservation.brand || '';
    const shopName = (brand.includes('ぐっすり') || brand.includes('ぐっすり山田'))
      ? 'ぐっすり山田五反田店'
      : 'ごほうびSPA五反田店';

    let message = '';

    switch (type) {
      case 'advance':
        message = `${reservation.customerName}様

${dateStr} ${timeStr}～ ${courseTimeNum}分コース

${reservation.castName}さんのご予約、誠にありがとうございます。

ご希望内容にてご予約を承りました。

ご利用の1時間前までに、予約確認のチャット連絡、またはお電話をお願いいたします。

また、ご案内のお時間ですが、出勤時間の都合上
${timeRangeStr}と30分幅をくださいませ。

1時間前の確認のご連絡の際に確定のお時間をお伝えさせていただきます。

こちらのメッセージをご確認いただき、ご返信をいただいた段階で【ご予約確定】となります。

※ご返信がない場合はお電話差し上げております。お電話でも確認取れませんと、キャンセル扱いとさせていただきます。

${shopName} ${staffName}`;
        break;

      case 'gohobi-new':
        message = `${reservation.customerName}様

${dateStr} ${timeStr}～ ${courseTimeNum}分コース

${reservation.castName}さんのご予約、誠にありがとうございます。

当店のご利用がお初めてのお客様へは以下のプレイ内容をご確認いただいております。

"当店は性感エステとなりますので、ハンドフィニッシュとなります。

女性はトップレスになりますが、全裸になる事はございません。

また女性へのソフトタッチはOKですが、局部への直接タッチや指入れ行為などは禁止となります。

当店はボディエステを重視した柔肌に包まれながら果てる快感をご堪能頂いておりますので、どうぞごゆっくりお楽しみくださいませ。

大変恐縮ではありますが
盗難、盗撮防止のため
女性がお客様の荷物にタオルを掛けて部屋の明るさも調整させて頂きます。"

上記をご確認いただき、内容に問題がなければ、チャットまたはお電話にてご連絡をお願いいたします。

ご連絡をいただいた段階で【ご予約確定】とさせていただきますので、ご了承くださいませ。

ご予約当日は、ご利用の1時間前までに、予約確認のチャット連絡、またはお電話をお願いいたします。

また、ご案内のお時間ですが、出勤時間の都合上
${timeRangeStr}と30分幅をくださいませ。

1時間前の確認のご連絡の際に確定のお時間をお伝えさせていただきます。

※ご返信がない場合はお電話差し上げております。お電話でも確認取れませんと、キャンセル扱いとさせていただきます。

${shopName} ${staffName}`;
        break;

      case 'gohobi-new-2':
        message = `${reservation.customerName}様

${dateStr} ${timeStr}～ ${courseTimeNum}分コース

${reservation.castName}さんのご予約、誠にありがとうございます。

当店のご利用がお初めてのお客様へは以下のプレイ内容をご確認いただいております。

"当店は性感エステとなりますので、ハンドフィニッシュとなります。

破廉恥コースは女性一糸まとわぬ姿になりますが、指入れ行為や女性が痛がる行為は禁止とさせて頂きます。

また粘膜接触を防止する為、顔面騎乗やクンニは行えませんので予めご理解頂きますようにお願いします。

尚、大変恐縮ではありますが、盗難、盗撮防止のため
女性がお客様の荷物にタオルを掛けて、お部屋の明るさも調整させて頂きます。

こちらも、予めご了承お願い致します。

最後になりますが、当店はボディエステを重視した、柔肌に包まれながら果てる快感をご堪能頂いておりますので、どうぞごゆっくりお楽しみくださいませ。"

上記をご確認いただき、内容に問題がなければ、チャットまたはお電話にてご連絡をお願いいたします。

ご連絡をいただいた段階で【ご予約確定】とさせていただきますので、ご了承くださいませ。

ご予約当日は、ご利用の1時間前までに、予約確認のチャット連絡、またはお電話をお願いいたします。

また、ご案内のお時間ですが、出勤時間の都合上
${timeRangeStr}と30分幅をくださいませ。

1時間前の確認のご連絡の際に確定のお時間をお伝えさせていただきます。

※ご返信がない場合はお電話差し上げております。お電話でも確認取れませんと、キャンセル扱いとさせていただきます。

${shopName} ${staffName}`;
        break;

      case 'chijo-new':
        message = `${reservation.customerName}様

${dateStr} ${timeStr}～ ${courseTimeNum}分コース

${reservation.castName}さんのご予約、誠にありがとうございます。

当店のご利用がお初めてのお客様へは以下のプレイ内容をご確認いただいております。

"当店は男の潮吹きや前立腺刺激によるドライオーガズムによって、普段の射精の100倍気持ちが良いと言われる強烈な快感にチャレンジできるお店となっております。

スケベなことが大好きな痴女が目隠しをした上で卑猥な淫語を連発し、
男性の感じる姿に興奮し、トップレスで体中を舐めまくりながらの顔面騎乗、
亀頭責めをしながらの焦らし・寸止めを行い、最終的にハンドサービスでフィニッシュを迎えて頂きます！

受け身を楽しんでいただくお店となっておりますので、お客様からのボディタッチや粘膜接触のあるサービスはご遠慮いただいております。"

上記をご確認いただき、内容に問題がなければ、チャットまたはお電話にてご連絡をお願いいたします。

ご連絡をいただいた段階で【ご予約確定】とさせていただきますので、ご了承くださいませ。

ご予約当日は、ご利用の1時間前までに、予約確認のチャット連絡、またはお電話をお願いいたします。

また、ご案内のお時間ですが、出勤時間の都合上
${timeRangeStr}と30分幅をくださいませ。

1時間前の確認のご連絡の際に確定のお時間をお伝えさせていただきます。

※ご返信がない場合はお電話差し上げております。お電話でも確認取れませんと、キャンセル扱いとさせていただきます。

${shopName} ${staffName}`;
        break;

      case 'gussuri-new':
        message = `${reservation.customerName}様

${dateStr} ${timeStr}～ ${courseTimeNum}分コース

${reservation.castName}さんのご予約、誠にありがとうございます。

当店のご利用がお初めてのお客様へは以下のプレイ内容をご確認いただいております。

"当店はハグヒーリングと温感オイルを使用したリンパマッサージで全身の毒素を排出します。

体中が満たされた後に、最低20分以上のドライヘッドスパで極楽睡眠に導きます。 

性欲からの解放、睡眠欲への絶頂アプローチによって究極の全身、脳内リフレッシュをどうぞご体感くださいませ。

スパニストは常に密着致しますので、お客様からのボディタッチはご遠慮頂いております。"

上記をご確認いただき、内容に問題がなければ、チャットまたはお電話にてご連絡をお願いいたします。

ご連絡をいただいた段階で【ご予約確定】とさせていただきますので、ご了承くださいませ。

ご予約当日は、ご利用の1時間前までに、予約確認のチャット連絡、またはお電話をお願いいたします。

また、ご案内のお時間ですが、出勤時間の都合上
${timeRangeStr}と30分幅をくださいませ。

1時間前の確認のご連絡の際に確定のお時間をお伝えさせていただきます。

※ご返信がない場合はお電話差し上げております。お電話でも確認取れませんと、キャンセル扱いとさせていただきます。

ぐっすり山田五反田店 ${staffName}`;
        break;

      case 'confirm':
        message = `${reservation.customerName}様

確認のご連絡ありがとうございます。

${dateStr} ${timeStr}～ ${courseTimeNum}分コース　${reservation.castName}さんにてご案内させていただきます。

ご料金は、〇〇円となります。

本日は、
ホテル名を抑えておりますので、5～10分前ごろにフロントでお名前をお伝えいただき、ご入室ください。

ホテルにご入室されましたら、お電話にて入室のご連絡をよろしくお願いいたします。

電話番号：03-6277-0347

${shopName} ${staffName}`;
        break;

      case 'confirm-hotel':
        message = `${reservation.customerName}様

確認のご連絡ありがとうございます。

${dateStr} ${timeStr}～ ${courseTimeNum}分コース　${reservation.castName}さんにてご案内させていただきます。

ご料金は、〇〇円となります。

本日は、
${reservation.hotelName || 'ホテル名'}
でのご利用でお間違いなかったでしょうか？

ホテルにご入室されましたら、お電話にて入室のご連絡をよろしくお願いいたします。

電話番号：03-6277-0347

${shopName} ${staffName}`;
        break;

      case 'price-change':
        message = `${reservation.customerName}様

${dateStr} ${timeStr}～ ${courseTimeNum}分コース

${reservation.castName}さんのご予約、誠にありがとうございます。

ご希望の内容にてご予約を承りますが、ご予約内容の料金に誤りがございました。

正しくは、〇〇円になります。

上記で進めさせていただいてもよろしいでしょうか？

ご確認いただきましたら、ご返信よろしくお願いいたします。

${shopName} ${staffName}`;
        break;

      case 'cast-absence':
        message = `${reservation.customerName}様

${dateStr} ${timeStr}～ ${courseTimeNum}分コース

${reservation.castName}さんのご予約、誠にありがとうございます。

大変申し訳ございませんが、本日${reservation.castName}さんがお休みになってしまいまして、別の日程もしくは、他の女性でしたら同じお時間でもご案内可能です。

ご検討のほどよろしくお願いいたしますm(__)m

${shopName} ${staffName}`;
        break;

      case 'time-change-request':
        // 時間変更のリクエストメッセージ（新しい時間は手動で入力する必要があるため、プレースホルダーを使用）
        message = `${reservation.customerName}様

${dateStr} ${timeStr}～ ${courseTimeNum}分コース

${reservation.castName}さんのご予約、誠にありがとうございます。

もし可能でしたら、女性の出勤時間の都合上〇〇：〇〇からのご案内とさせていただけると幸いでございます。難しい場合は、ご希望のお時間でのご案内で問題ございません。

ご検討の程、よろしくお願いいたします。

${shopName} ${staffName}`;
        break;
    }

    return message;
  }, [selectedDate]);

  // 選択された予約のブランドに応じてメッセージタイプをリセット
  useEffect(() => {
    if (selectedWebReservation !== null) {
      const selectedReservation = webReservations[selectedWebReservation];
      const brand = selectedReservation?.brand || '';
      
      // ごほうびのメッセージタイプ
      const gohobiMessageTypes = [
        'advance',
        'gohobi-new',
        'gohobi-new-2',
        'confirm',
        'confirm-hotel',
        'price-change',
        'cast-absence',
        'time-change-request',
      ];
      
      // ぐっすりのメッセージタイプ
      const gussuriMessageTypes = [
        'advance',
        'gussuri-new',
        'confirm-hotel',
        'price-change',
        'cast-absence',
        'time-change-request',
      ];
      
      // ブランドに応じてメッセージタイプを判定
      const isGohobi = brand.includes('ごほうび') || brand.includes('ごほうびSPA');
      const isGussuri = brand.includes('ぐっすり') || brand.includes('ぐっすり山田');
      
      // 選択されたメッセージタイプが利用可能でない場合は、最初のオプションにリセット
      if (isGohobi && !gohobiMessageTypes.includes(messageType)) {
        setMessageType('advance');
      } else if (isGussuri && !gussuriMessageTypes.includes(messageType)) {
        setMessageType('gussuri-new');
      } else if (!isGohobi && !isGussuri) {
        // ごほうびでもぐっすりでもない場合は、メッセージタイプをクリア（表示しない）
        setMessageType('advance');
      }
    }
  }, [selectedWebReservation, webReservations]); // messageTypeを依存配列から削除

  // メッセージタイプまたは選択された予約が変更されたときに自動的にメッセージを生成
  useEffect(() => {
    if (selectedWebReservation !== null && webReservations.length > 0) {
      const reservation = webReservations[selectedWebReservation];
      if (reservation) {
        const message = generateChatMessage(reservation, messageType);
        setGeneratedMessage(message);
      }
    }
  }, [messageType, selectedWebReservation, webReservations, generateChatMessage]);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                チャットメッセージ生成
              </h1>
              <p className="text-gray-600 mb-2">
                Web予約データからチャットメッセージを生成します
              </p>
            </div>
            <nav className="flex gap-2">
              <Link
                href="/reservations"
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors text-sm"
              >
                予約状況
              </Link>
              <Link
                href="/attendance"
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors text-sm"
              >
                出勤管理
              </Link>
              <div className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm">
                チャットメッセージ生成
              </div>
            </nav>
          </div>
        </header>

        <div className="bg-white rounded-lg shadow-lg p-6">
          {/* 日付選択 */}
          <div className="mb-4">
            <label htmlFor="date-select" className="block text-sm font-medium text-gray-700 mb-2">
              日付選択:
            </label>
            <select
              id="date-select"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(() => {
                const options: Array<{ value: string; label: string }> = [];
                const now = new Date();
                const businessDate = getBusinessDate(now);
                
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
                
                return options.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ));
              })()}
            </select>
          </div>

          {/* Web予約データ取得 */}
          <div className="mb-4">
            <button
              onClick={async () => {
                try {
                  const response = await fetch('/api/web-reservations');
                  const data = await response.json();
                  if (data.success) {
                    setWebReservations(data.reservations || []);
                  } else {
                    alert(data.error || 'データの取得に失敗しました');
                  }
                } catch (error) {
                  console.error('Web予約データ取得エラー:', error);
                  alert('データの取得に失敗しました');
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Web予約データを取得
            </button>
            {webReservations.length > 0 && (
              <p className="mt-2 text-sm text-gray-600">
                {webReservations.length}件の予約データを取得しました
              </p>
            )}
          </div>

          {/* 予約選択 */}
          {webReservations.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                予約を選択:
              </label>
              <select
                value={selectedWebReservation ?? ''}
                onChange={(e) => setSelectedWebReservation(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">選択してください</option>
                {webReservations.map((res, index) => (
                  <option key={index} value={index}>
                    {res.customerName}様 - {res.brand} - {res.castName} - {res.startTime} - {res.courseTime}分
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* メッセージタイプ選択 */}
          {selectedWebReservation !== null && (() => {
            const selectedReservation = webReservations[selectedWebReservation];
            const brand = selectedReservation?.brand || '';
            
            // ごほうびのメッセージタイプ
            const gohobiMessageTypes = [
              { value: 'advance', label: '事前予約（2時間以上前）' },
              { value: 'gohobi-new', label: 'ごほうびSPA（新規お客様・通常）' },
              { value: 'gohobi-new-2', label: 'ごほうびSPA（新規お客様・破廉恥コース）' },
              { value: 'confirm-hotel', label: '確認連絡への返信（ホテル名あり）' },
              { value: 'price-change', label: '料金の変更がある場合' },
              { value: 'cast-absence', label: '女性が休みの場合' },
              { value: 'time-change-request', label: '時間変更をお願いする場合' },
            ];
            
            // ぐっすりのメッセージタイプ
            const gussuriMessageTypes = [
              { value: 'advance', label: '事前予約（2時間以上前）' },
              { value: 'gussuri-new', label: 'ぐっすり（新規お客様）' },
              { value: 'confirm-hotel', label: '確認連絡への返信（ホテル名あり）' },
              { value: 'price-change', label: '料金の変更がある場合' },
              { value: 'cast-absence', label: '女性が休みの場合' },
              { value: 'time-change-request', label: '時間変更をお願いする場合' },
            ];
            
            // ブランドに応じてメッセージタイプを表示
            let availableMessageTypes: Array<{ value: string; label: string }> = [];
            if (brand.includes('ごほうび') || brand.includes('ごほうびSPA')) {
              availableMessageTypes = gohobiMessageTypes;
            } else if (brand.includes('ぐっすり') || brand.includes('ぐっすり山田')) {
              availableMessageTypes = gussuriMessageTypes;
            }
            
            return (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  メッセージタイプ:
                </label>
                {availableMessageTypes.length > 0 ? (
                  <select
                    value={messageType}
                    onChange={(e) => setMessageType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {availableMessageTypes.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-gray-500">
                    ごほうびまたはぐっすりの予約のみメッセージタイプを選択できます
                  </p>
                )}
              </div>
            );
          })()}

          {/* メッセージ生成ボタン（オプション：手動で再生成したい場合） */}
          {selectedWebReservation !== null && (
            <div className="mb-4">
              <button
                onClick={() => {
                  const reservation = webReservations[selectedWebReservation];
                  if (!reservation) return;

                  const message = generateChatMessage(reservation, messageType);
                  setGeneratedMessage(message);
                }}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                メッセージを再生成
              </button>
              <p className="mt-2 text-xs text-gray-500">
                ※ メッセージタイプを変更すると自動的にメッセージが生成されます
              </p>
            </div>
          )}

          {/* 生成されたメッセージ表示 */}
          {generatedMessage && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                生成されたメッセージ:
              </label>
              <textarea
                value={generatedMessage}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-96 font-mono text-sm"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedMessage);
                  alert('メッセージをクリップボードにコピーしました');
                }}
                className="mt-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                クリップボードにコピー
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

