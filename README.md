<h1 align="center">Next.js + Cloudflare D1 SQL + Drizzle ORM + Drizzle Kit + Cloudflare Pages starter kit</h1>

# Getting started

## Prerequisites

1. Node.js >=v20.11.0
2. pnpm >=v9.15.1

## Initialise the database(s)

1. [Create a production D1 database.](https://developers.cloudflare.com/d1/get-started/#3-create-a-database)
2. The starter kit focuses on 2 environments, **development on local machine** and **production on
   remote machine**. So, create the following files:

   1. `.env.development`: duplicate `.env.example`, and set the variables to development values.
   2. `.env.production`: duplicate `.env.example`, and set the variables to production values.
   3. `wrangler.toml.development`: duplicate `wrangler.toml.example`, and set the variables to
      development values.
   4. `wrangler.toml.production`: duplicate `wrangler.toml.example`, and set the variables to
      production values.

3. Install the app's dependencies:

```sh
pnpm install
```

4. Generate db migration files (that documents schema changes in an SQL script).

```sh
pnpm db:generate
```

5. Run db migrations (that executes the SQL script to update the database to match the schema).

- dev (local) db: `pnpm db:migrate:dev`
- prod (remote) db: `pnpm db:migrate:prod`

6. View the database using a graphical user interface:

- dev (local) db: `pnpm db:studio:dev`
- prod (remote) db: `pnpm db:studio:prod`

## Run the app

- Run Next.js on dev. Ideal for development since it supports hot-reload/fast refresh.

```sh
pnpm dev
```

⚠️ **Warning**: `next start` will return an error due to how the application is designed to run on
Cloudflare pages.

- Run Cloudflare Pages locally. Ideal to test how the app would work after being deployed.

```sh
pnpm pages:dev
```

⚠️ **Warning #1**: Connecting to the prod remote db on the local code
[is not supported](https://developers.cloudflare.com/d1/build-with-d1/local-development/).
`pnpm db:studio:prod` is not work. error is
`7403: The given account is not valid or is not authorized to access this service`.

⚠️ **Warning #2**: All pages deployed to Cloudflare Pages run on edge runtime, whereas
[ISR only works on Nodejs runtime](https://developers.cloudflare.com/pages/framework-guides/nextjs/ssr/supported-features/)
(because how Vercel designed their functions); so, some functions like `revalidatePath` will throw
an error when running the app with `pnpm pages:dev`. But, the functions work as expected after
deploying.

⚠️ **Warning #3**: if working in pages, root(/) path is not working. error message is `Not Found`.
But `pnpm dev` is working. I want to fix this.

## Deploy

- Deploy code to pages:

```sh
pnpm pages:deploy
```

## RAGシステムの使い方

このプロジェクトには汎用的なRAG（Retrieval-Augmented Generation）システムが実装されています。

### 機能

1. **ドキュメント登録**: AIに参照してほしい情報を登録できます
2. **会話機能**: ChatGPT APIのThreads機能を使用したLINE風の会話インターフェース
3. **RAG検索**: 登録したドキュメントを検索して、関連情報をコンテキストとして使用

### セットアップ

1. 環境変数に`OPENAI_API_KEY`を設定してください（`.env.development`と`.env.production`に追加）

2. データベースマイグレーションを実行してください：

```sh
pnpm db:generate
pnpm db:migrate:dev  # 開発環境の場合
```

3. アプリケーションを起動：

```sh
pnpm dev
```

4. ブラウザで`http://localhost:3000`にアクセスし、ログイン後「RAGシステム」ボタンをクリック

### 使い方

1. **ドキュメント登録**:
   - RAGシステムページの「ドキュメント」タブで、タイトルとコンテンツを入力して登録
   - ドキュメントは自動的にチャンクに分割され、埋め込みベクトルが生成されます

2. **会話**:
   - 「チャット」タブで「新しい会話」をクリック
   - 質問を入力すると、登録されたドキュメントから関連情報を検索し、それをコンテキストとしてAIが回答します

### APIエンドポイント

- `GET /api/documents` - ドキュメント一覧取得
- `POST /api/documents` - ドキュメント登録
- `POST /api/search` - RAG検索
- `GET /api/threads` - スレッド一覧取得
- `POST /api/threads` - 新しいスレッド作成
- `GET /api/threads/[threadId]/messages` - メッセージ一覧取得
- `POST /api/threads/[threadId]/messages` - メッセージ送信
