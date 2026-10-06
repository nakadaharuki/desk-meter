import { expect, mock, test } from 'claude-code/testing'
import { tokenChart, short } from '../hooks/chart.js'

const PANE = {
  plugin: 'desk-meter',
  component: 'Pane',
  requestId: 'desk-meter',
  viewport: { columns: 100, rows: 30 },
  props: {
    title: 'desk-meter',
    isFocused: true,
    bodyColumns: 60,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const BAND = {
  plugin: 'desk-meter',
  component: 'AbovePrompt',
  viewport: { columns: 100, rows: 30 },
  props: { bodyColumns: 60 },
} as const

// 起動に要る答えをまとめて用意する
function boot(on: any, saved: Map<string, unknown>, sent: string[] = []) {
  const clock = mock.clock(on)
  on('store.get', ($: any, e: any) => ({ value: saved.get(e.key) }))
  on('store.set', ($: any, e: any) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('settings.read', () => ({ value: { language: 'japanese' } }))
  on('tool.register', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', () => ({ cwd: '/work' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: 84_000, window: 200_000, percent: 42 }, rateLimits: {} },
  }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'main\n', stderr: '' } }))
  on('prompt.submit', ($: any, e: any) => {
    sent.push(e.text)
    return { text: e.text }
  })
  return clock
}

const start = ($: any) => $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })

test('帯に使用率・ブランチ・道具の回数が出る', async ($, on) => {
  const clock = boot(on, new Map())
  on('tool.call', () => ({ result: 'ok' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['Claude Code の帯'] }))
  await start($)
  await $.tool.call({ tool: 'Read', file_path: 'a.md' })
  await $.tool.call({ tool: 'Grep', pattern: 'x' })
  await clock.advance(1000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: '文脈 42%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '⎇ main' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '道具 2 回' })).toBeDefined()
    await ui.unmount()
  }
})

test('要求ごとのトークンを数え、子のエージェントは数えない', async ($, on) => {
  boot(on, new Map())
  on('turn.step', async function* ($: any, e: any) {
    yield { kind: 'text', index: 0, text: 'ok' }
    return {
      turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn',
      usage: { input_tokens: 1_000, output_tokens: 300, cache_read_input_tokens: 9_000, cache_creation_input_tokens: 0 },
    }
  })
  await start($)
  const drain = async (s: any) => {
    let step = await s.next()
    while (step.done !== true) step = await s.next()
  }
  await drain($.turn.step({ turnId: 't', index: 0, model: 'claude-test', messageCount: 1 }))
  await drain($.turn.step({ turnId: 't', index: 1, model: 'claude-test', messageCount: 3, agentId: 'sub' }))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  expect(svg?.props.alt).toBe('要求ごとのトークン（1 回）')
  expect(await ui.find({ type: 'Text', text: '直近の要求のキャッシュの当たり 90%' })).toBeDefined()
  await ui.unmount()

  // 端末では Svg を使わず、字で出す
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ type: 'Svg' })).toBeUndefined()
  expect(await term.find({ type: 'Text', text: '入力 10k（読み 9k） 出力 300' })).toBeDefined()
})

test('メモは欄から足して消せ、Claude の道具からも残せる', async ($, on) => {
  const saved = new Map<string, unknown>([['notes', ['前のメモ']]])
  boot(on, saved)
  on('tool.call', () => ({ result: 'ok' }))
  await start($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // 打ちかけの字は、描き直しの後も残る
  await ui.input({ key: 'note-input', text: '型を', kind: 'change' })
  await $.tool.call({ tool: 'Read', file_path: 'a.md' })
  expect((await ui.find({ key: 'note-input' }))?.props.value).toBe('型を')
  await ui.input({ key: 'note-input', text: '型を先に決める' })
  expect((await ui.find({ key: 'note-input' }))?.props.value).toBe('')
  expect(saved.get('notes')).toEqual(['前のメモ', '型を先に決める'])
  await ui.press({ key: 'del-0' })
  expect(saved.get('notes')).toEqual(['型を先に決める'])

  const r: any = await $.tool.call({ tool: 'mcp__desk-meter__note', text: '試験は最後に' })
  expect(r.result).toBe('メモを残しました: 試験は最後に')
  expect(saved.get('notes')).toEqual(['型を先に決める', '試験は最後に'])
})

test('振り返りのボタンは、次の時計の刻みで Claude に送る', async ($, on) => {
  const sent: string[] = []
  const clock = boot(on, new Map([['notes', ['A']]]), sent)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'ask-review' })
  expect(sent).toEqual([])
  await clock.advance(1000)
  expect(sent.length).toBe(1)
  expect(sent[0]).toContain('（A）')
})

test('危ないコマンドは聞き、止めたら走らせない（会話が始まる前は英語）', async ($, on) => {
  let ran = 0
  let answer = 'Stop'
  on('tool.call', ($: any, e: any) => {
    if (e.tool === 'AskUserQuestion') return { result: { answers: { [e.questions[0].question]: answer } } }
    ran += 1
    return { result: 'ok' }
  })
  const r: any = await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  expect(r.deny).toBeDefined()
  expect(ran).toBe(0)

  answer = 'Run'
  await $.tool.call({ tool: 'Bash', command: 'git push --force origin main' })
  expect(ran).toBe(1)

  // 危なくないコマンドは聞かずに通す
  await $.tool.call({ tool: 'Bash', command: 'ls -la' })
  expect(ran).toBe(2)
})

test('/meter reset で数え直す', async ($, on) => {
  boot(on, new Map())
  on('tool.call', () => ({ result: 'ok' }))
  await start($)
  await $.tool.call({ tool: 'Read', file_path: 'a.md' })
  const a: any = await $.command.run({ command: 'meter', args: 'reset' })
  expect(a.text).toBe('数え直しました')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '道具はまだ使われていません' })).toBeDefined()
})

test('グラフの部品', () => {
  expect(short(950)).toBe('950')
  expect(short(12_345)).toBe('12k')
  expect(short(1_500_000)).toBe('1.5M')
  const svg = tokenChart([{ input: 1, output: 1, cacheRead: 2, cacheWrite: 0 }], 400, 160)
  expect(svg).toContain('viewBox="0 0 400 160"')
  expect(svg).toContain('requests: 1')
  expect(tokenChart([], 400, 160, { legend: ['キャッシュ読み', '書き', '新しい入力', '出力'], axis: '古い ← 要求 0 回 → 新しい' })).toContain('要求 0 回')
})
