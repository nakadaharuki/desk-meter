# desk-meter

A mod for Claude Code on the desktop (the Code tab). One small mod that uses a band, a pane, an Svg chart, a tool for Claude and a confirming hook, so it also works as a sample to start writing mods from.

- Band (above the prompt): context usage, branch, tool count, time spent
- Pane (`/meter`): tokens per request as stacked bars (Svg), the cache hit, the most used tools, notes, and "Ask Claude for a review"
- Claude's tool `note`: Claude leaves a note in the pane
- Check: `rm -r`, `git reset --hard` and `git push --force` are asked about before they run (no answer means stop)

English and Japanese: the `language` option (`auto`, `en`, `ja`) follows Claude Code's `language` setting on `auto`.

## Install

```
/plugin marketplace add nakadaharuki/desk-meter
/plugin install desk-meter@desk-meter
```

Claude Code v2.1.287 or later (also seen drawing in the 2.1.286 the desktop app ships). It is also listed, pinned to a read commit with a manifest and a preview of what it draws, at [modscode.com/mods/desk-meter](https://modscode.com/mods/desk-meter/).

## What it touches

Mods are not sandboxed, so here it is before you install. The code is two files, [hooks/register.js](hooks/register.js) and [hooks/chart.js](hooks/chart.js).

- No network (`$.http` is not used). No environment variables, no files
- One outside process: `git branch --show-current` (the branch in the band)
- It reads Claude Code's `language` setting to pick the language
- `claude plugin validate .` lists every API it uses

## Tests

```
claude plugin validate .
claude plugin test
```

## 日本語

デスクトップ版 Claude Code（Code タブ）で動く Mod。帯にコンテキストの使用率・ブランチ・道具の回数、欄（`/meter`）に要求ごとのトークンのグラフとメモを出し、危ないコマンドは走らせる前に聞きます。表示は日本語にもなります（`language` の設定が `auto` なら Claude Code の `language` 設定に合わせる）。成分表と入れ方は [modscode.com/ja/mods/desk-meter](https://modscode.com/ja/mods/desk-meter/)。デスクトップ版の Mods で踏んだ罠は Zenn に: https://zenn.dev/nakadaharuki

MIT License
