# 作業日報 Ninku PWA

作業現場・作業者・工程・人数・作業時間・備考を記録し、端末内に保存する日本語対応のPWAです。

## 機能
- 入力 / まとめ / 工程・設定の3画面
- `1人工 = 7時間` による自動集計
- ブラウザのLocalStorageへの保存（オフライン対応）
- CSV出力（Excel向けUTF-8 BOM）
- 編集・削除・設定項目の追加削除
- PWA / Service Worker / GitHub Pages対応

## GitHub Pages
`main`へのpush後、リポジトリの **Settings → Pages → Source: GitHub Actions** を選択してください。下記ワークフローが自動デプロイします。

> データは端末とブラウザごとに保存されます。ブラウザのデータ消去・端末変更時には引き継がれません。
