# star_group

風俗店の予約状況やキャストの出勤状況を確認できるWebアプリケーションです。

## 機能

- キャストの出勤状況の確認
- 予約状況の確認
- Googleスプレッドシートからリアルタイムでデータを取得

## 技術スタック

- Next.js 16
- TypeScript
- Google Sheets API
- Tailwind CSS

## セットアップ

1. 依存関係のインストール

```bash
npm install
```

2. 環境変数の設定

Googleサービスアカウントの認証情報JSONファイル（`roadtoentrepreneur-045990358137.json`）をプロジェクトルートに配置してください。

3. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いてください。

## スプレッドシート設定

このアプリケーションは以下のスプレッドシートからデータを取得します：

- 出勤表: https://docs.google.com/spreadsheets/d/11070jPIy5mwK9sGM4wCqjUKi1NRv-KTRV3vdKsGYP70/edit?gid=578404798#gid=578404798

スプレッドシートへのアクセス権限をサービスアカウントに付与してください。
