# desk-meter

デスクトップ版 Claude Code（Code タブ）で動く Mod。小さな 1 本で、帯・欄・Svg のグラフ・Claude の道具・確認のフックをひととおり使っています。Mods を書き始める時の見本にどうぞ。

- 帯（入力欄の上）: コンテキストの使用率・ブランチ・道具の回数・経過時間
- 欄（`/meter`）: 要求ごとのトークンの積み上げ棒（Svg）・キャッシュの当たり・よく使う道具・メモ・「Claude に振り返りを頼む」
- Claude の道具 `note`: Claude が欄にメモを残す
- 確認: `rm -r`・`git reset --hard`・`git push --force` は走らせる前に聞く（答えが無ければ止める）

## 入れる

```
/plugin marketplace add nakadaharuki/desk-meter
/plugin install desk-meter@desk-meter
```

Claude Code v2.1.287 以上（デスクトップに同梱の 2.1.286 でも描かれることを確認）。

## 中で使っている物

Mods は隔離されずに動くので、入れる前に読めるよう書いておきます。コードは [hooks/register.js](hooks/register.js) と [hooks/chart.js](hooks/chart.js) の 2 本（約 330 行）だけです。

- 通信しません（`$.http` を使わない）。環境変数・ファイルも読みません
- 外のプロセスは `git branch --show-current` の 1 つだけ（帯のブランチ名）
- 使う API は `claude plugin validate .` で一覧できます

## 試験

```
claude plugin validate .
claude plugin test
```

## 関連

成分表（何に触れるか）と、版を固定した入れ方は [modscode.com/mods/desk-meter](https://modscode.com/mods/desk-meter/) にあります。

デスクトップ版の Mods で踏んだ罠は Zenn に書いています: https://zenn.dev/nakadaharuki

MIT License
