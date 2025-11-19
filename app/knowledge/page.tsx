"use client";

import { useMemo, useState } from 'react';

type CategoryId =
  | 'payment'
  | 'office'
  | 'office-sheets'
  | 'gohobi'
  | 'gussuri'
  | 'gussuri-options'
  | 'gussuri-service';

type CategoryLabel = {
  id: CategoryId;
  label: string;
  parent?: CategoryId;
  children?: CategoryLabel[];
};

const categories: CategoryLabel[] = [
  { id: 'payment', label: '支払い' },
  {
    id: 'office',
    label: '事務所作業',
    children: [
      { id: 'office-sheets', label: 'スプシ', parent: 'office' },
    ],
  },
  { id: 'gohobi', label: 'ごほうび' },
  {
    id: 'gussuri',
    label: 'ぐっすり山田',
    children: [
      { id: 'gussuri-options', label: 'オプション', parent: 'gussuri' },
      { id: 'gussuri-service', label: 'サービス内容', parent: 'gussuri' },
    ],
  },
];

const knowledgeItems = [
  {
    title: '黒塗り（講習中）',
    body: '黒塗りの女性は「まだ講習が終わっていない状態」を意味します。講習が完了するまで案内不可のため、予約受付の対象外となります。',
    tags: ['黒塗り', '講習', '案内不可'],
    category: 'office-sheets' as CategoryId,
  },
  {
    title: 'クレジットカード払いについて',
    body: 'クレジットカードでのお支払いも可能です。決済時に15%の決済手数料が発生する点のみご案内ください。',
    tags: ['クレジットカード', '決済', '手数料'],
    category: 'payment' as CategoryId,
  },
  {
    title: 'ぐっすり山田のカスタムオプション',
    body: 'カスタムオプションの内容確認は当日、女性と顔合わせ後に行います。来店前の詳細提示は不要で、当日追加も可能です。',
    tags: ['ぐっすり山田', 'カスタム', 'オプション', '当日'],
    category: 'gussuri-options' as CategoryId,
  },
  {
    title: 'ぐっすり山田のサービス内容',
    body: 'ぐっすり山田では、ハグヒーリングや温感オイルを使用したリンパマッサージで全身をトリートメントし、ドライヘッドスパで深い睡眠へ誘います。コース中はスパニストが密着するため、お客様からのボディタッチはご遠慮いただいています。',
    tags: ['ぐっすり山田', 'サービス内容', '施術'],
    category: 'gussuri-service' as CategoryId,
  },
];

export default function KnowledgePage() {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | 'all'>('all');

  const parentMap: Record<CategoryId, CategoryId | null> = {
    payment: null,
    office: null,
    'office-sheets': 'office',
    gohobi: null,
    gussuri: null,
    'gussuri-options': 'gussuri',
    'gussuri-service': 'gussuri',
  };

  const matchesCategory = (itemCategory: CategoryId, target: CategoryId | 'all') => {
    if (target === 'all') return true;
    if (itemCategory === target) return true;
    let parent = parentMap[itemCategory];
    while (parent) {
      if (parent === target) return true;
      parent = parentMap[parent];
    }
    return false;
  };
  
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return knowledgeItems.filter(item => {
      const matchQuery =
        !q ||
        [item.title, item.body, ...(item.tags || [])]
          .filter(Boolean)
          .some(text => text.toLowerCase().includes(q));
      const matchCategory = matchesCategory(item.category, selectedCategory);
      return matchQuery && matchCategory;
    });
  }, [query, selectedCategory, parentMap]);

  const getCategoryCount = (categoryId: CategoryId | 'all') =>
    knowledgeItems.filter(item => matchesCategory(item.category, categoryId)).length;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8">
        <aside className="lg:w-72 bg-white shadow rounded-xl border border-gray-100 h-fit">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">カテゴリ</h2>
            <p className="text-xs text-gray-500 mt-1">内容で絞り込みできます</p>
          </div>
          <nav className="flex flex-col">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`flex items-center justify-between px-4 py-3 text-left text-sm font-medium border-b border-gray-100 ${
                selectedCategory === 'all'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>すべて</span>
              <span className="text-xs">{knowledgeItems.length}</span>
            </button>
            {categories.map((category) => {
              const count = getCategoryCount(category.id);
              return (
                <div key={category.id} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(category.id)}
                    className={`flex items-center justify-between px-4 py-3 text-left text-sm font-medium border-b border-gray-100 ${
                      selectedCategory === category.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>{category.label}</span>
                    <span className="text-xs">{count}</span>
                  </button>
                  {category.children && (
                    <div className="ml-4 border-l border-gray-100">
                      {category.children.map(child => (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => setSelectedCategory(child.id)}
                          className={`flex items-center justify-between pl-6 pr-4 py-2 text-left text-xs font-medium border-b border-gray-100 ${
                            selectedCategory === child.id
                              ? 'bg-green-50 text-green-700'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <span>{child.label}</span>
                          <span className="text-[10px]">{getCategoryCount(child.id)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">ナレッジ</h1>
          <p className="text-sm text-gray-600">
            よくあるご質問や共有事項をまとめています。
          </p>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ナレッジ検索
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="キーワードで検索（例: クレジット、ぐっすり、講習）"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {query && (
              <p className="mt-1 text-sm text-gray-500">
                「{query}」の検索結果: {filteredItems.length}件
              </p>
            )}
          </div>
        </header>

        {filteredItems.length === 0 && (
          <div className="bg-white shadow rounded-xl p-6 text-center border border-dashed border-gray-300">
            <p className="text-gray-500">該当するナレッジは見つかりませんでした。</p>
            <p className="text-sm text-gray-400 mt-2">別のキーワードをお試しください。</p>
          </div>
        )}

        {filteredItems.map((item, index) => (
          <section
            key={`${item.title}-${index}`}
            className="bg-white shadow rounded-xl p-6 space-y-4 border border-gray-100"
          >
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold text-gray-900">{item.title}</h2>
              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-full"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="text-gray-700 leading-relaxed">{item.body}</p>
          </section>
        ))}
        </div>
      </div>
    </div>
  );
}

