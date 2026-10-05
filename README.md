# desk-meter

デスクトップ版 Claude Code の Mod。Zenn の本「デスクトップ版 Claude Code の Mods 入門」で 1 章ずつ作る物の完成形。

- 帯（入力欄の上）: コンテキストの使用率・ブランチ・道具の回数・経過時間
- 欄（`/meter`）: 要求ごとのトークンの積み上げ棒（Svg）・キャッシュの当たり・よく使う道具・メモ・「Claude に振り返りを頼む」
- Claude の道具 `note`: Claude が欄にメモを残す
- 確認: `rm -r`・`git reset --hard`・`git push --force` は走らせる前に聞く（答えが無ければ止める）

## 入れる

```
/plugin marketplace add C:\path\to\desk-meter
/plugin install desk-meter@desk-meter
```

Claude Code v2.1.287 以上。

## 試験

```
claude plugin validate .
claude plugin test
```

MIT License
