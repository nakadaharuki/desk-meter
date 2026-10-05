// desk-meter: 帯にコンテキストの使用率・ブランチ・道具の回数、欄に要求ごとのトークンのグラフとメモ
import { tokenChart, short } from './chart.js'

const PANE = 'desk-meter'
const TOOL_NOTE = 'mcp__desk-meter__note'
// rm -r / rm -rf / git reset --hard / git push --force（-f も）
const RISKY = /\brm\s+-[a-z]*r[a-z]*\b|\bgit\s+reset\s+--hard\b|\bgit\s+push\b.*(--force|\s-f\b)/
// デスクトップの欄の 1 マス（CSS の点）。環境で少し違うので、絵は viewBox で収める
const CELL = { w: 7.6, h: 18.6 }

// ---- 状態（モジュールの変数は読み直しで消える。残したい物は $.store へ） ----
let steps = [] // 要求ごとのトークン（主の会話だけ・新しい 40 回）
let tools = {} // 道具の名前 → 回数
let context = null // { percent, tokens, window }
let branch = ''
let startedAt = 0
let notes = [] // メモ（$.store の 'notes' と同じ物）
let toSend = null // ボタンから頼まれた、次に Claude に送る文
let draft = '' // メモの欄に打ちかけの字（描き直しで消さないため）

// $ を渡す関数は同じファイルに置く（claude plugin validate が「via refresh」と呼び先をたどれる）
async function refresh($) {
  try {
    const u = await $.session.usage()
    context = u.context
    startedAt = u.startedAt
  } catch {
    // 使用率が取れない面（claude -p など）では出さない
  }
  try {
    const r = await $.process.run(['git', 'branch', '--show-current'], { timeoutMs: 3000 })
    branch = r.exitCode === 0 ? r.stdout.trim() : ''
  } catch {
    branch = ''
  }
  $.ui.invalidate('ui.render')
}

async function saveNotes($, change) {
  // 別のセッションも同じ store に書くので、書く直前に読み直してから変える
  const now = await $.store.get('notes')
  notes = change(Array.isArray(now) ? now : [])
  await $.store.set('notes', notes)
  $.ui.invalidate('ui.render')
}

const elapsed = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}時間${m}分` : `${m}分`
}

const topTools = (n) => Object.entries(tools).sort((a, b) => b[1] - a[1]).slice(0, n)
const toolTotal = () => Object.values(tools).reduce((a, b) => a + b, 0)

export function register(on) {
  // ---- 起動: コマンドと道具を登録し、メモを読み、時計を 1 本だけ回す ----
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('notes')
    if (Array.isArray(saved)) notes = saved
    // 読み直し（hot reload）で同じ名前をもう一度登録すると例外になりうるので、1 つずつ try で包む
    try {
      await $.tool.register({
        name: 'note',
        description: '作業のメモを desk-meter の欄に 1 行残す。決めたこと・後で確かめることを残すときに使う',
        inputSchema: { type: 'object', properties: { text: { type: 'string', description: '1 行のメモ' } }, required: ['text'] },
      })
    } catch (err) {
      $.ui.log('note の道具を登録できませんでした: ' + err.message)
    }
    let n = 0
    $.clock.every(1000, async () => {
      n += 1
      // ボタンの中で $.prompt.submit を呼んでも、その出来事が終わると捨てられる。だから時計から送る
      if (toSend) {
        const text = toSend
        toSend = null
        $.prompt.submit({ text })
      }
      if (n % 5 === 1) await refresh($)
    })
    // 名前がかぶると例外になるので、登録は最後に・try で包む
    try {
      await $.command.register({ name: 'meter', description: 'desk-meter の欄を開く（/meter reset で数え直す）', argumentHint: '[reset]', immediate: true })
    } catch (err) {
      $.ui.log('/meter を登録できませんでした: ' + err.message)
    }
    return next(e)
  })

  // ---- 道具の回数を数える（止めない。$.ui.ask の質問も AskUserQuestion の呼び出しとして来るので除く） ----
  on('tool.call', async ($, e, next) => {
    if (e.tool === 'AskUserQuestion') return next(e)
    tools[e.tool] = (tools[e.tool] ?? 0) + 1
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // ---- 危ないコマンドは、走らせる前に聞く ----
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!RISKY.test(e.command ?? '')) return next(e)
    let answer = '止める'
    try {
      answer = await $.ui.ask('このコマンドを走らせますか？ ' + e.command, ['走らせる', '止める'])
    } catch {
      // 答える人がいない（claude -p）・閉じられた → 止める側に倒す
    }
    if (answer !== '走らせる') return { deny: '利用者がこのコマンドを止めました。別のやり方を提案する前に、利用者に確かめてください。' }
    return next(e)
  }).catch(async () => ({ deny: 'desk-meter の確認が失敗したので、このコマンドは走らせていません。' }))

  // ---- Claude 用の道具: メモを残す ----
  on('tool.call', { tool: TOOL_NOTE }, async ($, e) => {
    const text = String(e.text ?? '').trim().slice(0, 200)
    if (!text) return { result: 'メモが空です。text に 1 行を入れてください。' }
    await saveNotes($, (list) => [...list, text].slice(-20))
    return { result: 'メモを残しました: ' + text }
  })

  // 自分の道具は確認なしで通す（メモを書くだけで、外に出ない）
  on('tool.check', { tool: TOOL_NOTE }, async () => ({ decision: 'allow' }))

  // ---- 要求ごとのトークンを記録（turn.step は流れるので async generator） ----
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const u = result?.usage
    if (u && !e.agentId) {
      steps = [...steps, {
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0,
      }].slice(-40)
      $.ui.invalidate('ui.render')
    }
    return result
  })

  // ---- /meter ----
  on('command.run', { command: 'meter' }, async ($, e) => {
    if (e.args.trim() === 'reset') {
      steps = []
      tools = {}
      $.ui.invalidate('ui.render')
      return { text: '数え直しました' }
    }
    await $.ui.open({ id: PANE, title: 'desk-meter', focus: true, closeOnEscape: true })
    return {}
  })

  // ---- 帯（入力欄の上の 1 行） ----
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!context?.percent && !branch && !toolTotal()) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const desk = e.surface !== 'terminal'
    const pct = context?.percent
    const hot = (pct ?? 0) >= 80
    const parts = []
    if (pct !== undefined && pct !== null) {
      // color に undefined を渡さない（値の無い項目は書かない）
      const style = hot ? { bold: true, color: desk ? 'warning' : 'yellow' } : { bold: true }
      parts.push(Text({ key: 'ctx', ...style, children: [`文脈 ${pct}%`] }))
    }
    if (branch) parts.push(Text({ key: 'branch', children: ['⎇ ' + branch] }))
    parts.push(Text({ key: 'tools', dimColor: true, children: [`道具 ${toolTotal()} 回`] }))
    if (startedAt) parts.push(Text({ key: 'time', dimColor: true, children: [elapsed(Date.now() - startedAt)] }))
    return Box({ flexDirection: 'row', columnGap: 3, children: parts })
  })

  // ---- 欄 ----
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button, Input, Svg } = $.ui.resolve(e)
    const desk = e.surface === 'desktop'
    const cols = e.props?.bodyColumns ?? 60
    const last = steps[steps.length - 1]

    const head = Text({
      bold: true,
      children: [
        context?.percent !== undefined && context?.percent !== null
          ? `文脈 ${context.percent}%（${short(context.tokens ?? 0)} / ${short(context.window)}）`
          : '文脈はまだ測れていません',
      ],
    })

    // デスクトップは Svg のグラフ、端末は字で直近 5 回
    const chart = desk
      ? Svg({
          source: tokenChart(steps, Math.floor(cols * CELL.w), Math.floor(9 * CELL.h)),
          alt: `要求ごとのトークン（${steps.length} 回）`,
          width: Math.floor(cols * CELL.w),
          height: Math.floor(9 * CELL.h),
        })
      : Box({
          flexDirection: 'column',
          children: steps.slice(-5).map((s, i) =>
            Text({ key: 'step-' + i, children: [`入力 ${short(s.input + s.cacheRead + s.cacheWrite)}（読み ${short(s.cacheRead)}） 出力 ${short(s.output)}`] }),
          ),
        })

    const hit = last ? Math.round((last.cacheRead / Math.max(1, last.input + last.cacheRead + last.cacheWrite)) * 100) : null
    const toolLine = Text({
      dimColor: true,
      children: [toolTotal() ? '道具 ' + topTools(4).map(([k, v]) => `${k.replace(/^mcp__[^_]+(?:_[^_]+)*__/, '')} ${v}`).join(' · ') : '道具はまだ使われていません'],
    })

    const noteRows = notes.map((text, i) =>
      Box({
        key: 'row-' + i,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Button({
            key: 'del-' + i,
            label: '×',
            plain: true,
            onPress: () => saveNotes($, (list) => list.filter((_, j) => j !== i)),
          }),
          Text({ wrap: 'truncate-end', children: [text] }),
        ],
      }),
    )

    return Box({
      flexDirection: 'column',
      rowGap: 1,
      children: [
        head,
        chart,
        Text({ dimColor: true, children: [hit === null ? 'キャッシュの当たりは、最初の要求の後に出ます' : `直近の要求のキャッシュの当たり ${hit}%`] }),
        toolLine,
        Text({ bold: true, children: [`メモ ${notes.length}`] }),
        Input({
          key: 'note-input',
          label: 'メモ',
          placeholder: '1 行書いて Enter',
          // 道具の呼び出しのたびに描き直すので、打ちかけの字を自分で持って返す
          value: draft,
          submitLabel: '残す',
          onInput: (value) => {
            draft = value
          },
          onSubmit: (value) => {
            draft = ''
            const text = value.trim()
            if (text) return saveNotes($, (list) => [...list, text].slice(-20))
            $.ui.invalidate('ui.render')
          },
        }),
        ...noteRows,
        Button({
          key: 'ask-review',
          label: 'Claude に振り返りを頼む',
          onPress: () => {
            toSend = 'desk-meter のメモ（' + notes.join(' / ') + '）を踏まえて、ここまでの作業を 3 行で振り返り、次にやることを 1 つ挙げてください。'
          },
        }),
      ],
    })
  })
}
