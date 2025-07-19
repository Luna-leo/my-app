# データ永続化機能 動作確認手順

## 1. 基本的な永続化テスト

1. **CSVデータのインポート**
   - http://localhost:3001 にアクセス
   - CSVファイルをインポート
   - インポート時に「データ永続化中...」のプログレスバーが表示されることを確認

2. **ページリロードテスト**
   - ブラウザをリロード（F5）
   - コンソールログで以下を確認：
     - `[ChartDataContext] Found X persisted datasets, restoring...`
     - `[ChartDataContext] Restored Y rows for metadata Z`

3. **グラフ作成テスト**
   - データが自動復元されていることを確認
   - グラフが正常に表示されることを確認

## 2. 永続化データの確認

ブラウザの開発者ツールで確認：

1. Application タブ → IndexedDB → GraphDataDB
2. dataChunks テーブルを確認
3. 各チャンクのデータ：
   - metadataId
   - chunkIndex
   - compressedData (Blob)
   - rowCount
   - compressionType: "gzip"

## 3. メモリ効率の確認

1. 大きなCSVファイルをインポート
2. dataChunksのサイズを確認（圧縮効果）
3. パフォーマンスタブでメモリ使用量を監視

## 4. エラーハンドリングテスト

1. IndexedDBのストレージを手動でクリア
2. アプリケーションをリロード
3. エラーが適切にログされることを確認

## コンソールログの確認ポイント

- `[DataPersistence] Persisting table...`
- `[DataPersistence] Successfully persisted X rows in Y chunks`
- `[DataPersistence] Restoring Z chunks for table...`
- `[DataPersistence] Successfully restored X rows`

## 期待される動作

1. CSVインポート後、自動的にIndexedDBに永続化
2. ページリロード後、自動的にDuckDBテーブルを復元
3. オフライン環境でもデータアクセス可能
4. 圧縮により効率的なストレージ使用