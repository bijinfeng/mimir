const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const parserDir = fs
  .readdirSync('node_modules/.pnpm')
  .find((name) => name.startsWith('@babel+parser@'))
const parser = require(path.resolve('node_modules/.pnpm', parserDir, 'node_modules/@babel/parser'))
const base = path.resolve(__dirname)
const root = 'packages/office/src/editors'
const files = fs
  .readdirSync(root)
  .filter((name) => /^Pdf.*\.tsx$/.test(name) && !name.includes('.test.'))
  .toSorted()
const supporting = fs
  .readdirSync(root)
  .filter((name) => /^pdf-.*\.(ts|css)$/.test(name) && !name.includes('.test.'))
  .map((name) => `${root}/${name}`)
supporting.push(
  `${root}/editors.css`,
  `${root}/pptx-pdf-toolbar.css`,
  `${root}/CompactToolbar.tsx`,
  `${root}/ThumbnailSidebar.tsx`,
  'packages/office/src/shell/EditorShell.tsx',
  'packages/office/src/shell/shell.css',
)
const output = {
  date: '2026-10-20',
  method:
    'Babel TSX AST over every own Pdf*.tsx excluding tests. Every UI control opening tag, option/menu label declaration, JSX/option map family, JSX-producing conditional/if branch and state hook is indexed. CSS/supporting files are hashed, not counted as UI records. Includes hidden legacy JSX and document-dependent families; counts are SOURCE mappings, never GUI passes or expanded native options.',
  sourceFiles: [],
  supportingFiles: [],
  tabs: [],
  groups: [],
  surfaces: [],
  controls: [],
  labelDeclarations: [],
  dynamicFamilies: [],
  stateBranches: [],
  stateHooks: [],
  selectAudit: [],
}
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex')
function walk(node, fn, ancestors = []) {
  if (!node || typeof node !== 'object') return
  if (node.type) fn(node, ancestors)
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'tokens', 'comments'].includes(key)) continue
    if (Array.isArray(value)) value.forEach((child) => walk(child, fn, [...ancestors, node]))
    else if (value && typeof value === 'object') walk(value, fn, [...ancestors, node])
  }
}
function hasJsx(node) {
  let found = false
  walk(node, (child) => {
    if (child.type === 'JSXElement' || child.type === 'JSXFragment') found = true
  })
  return found
}
function hasOptionLabel(node) {
  let found = false
  walk(node, (child) => {
    if (child.type === 'ObjectProperty' && (child.key.name || child.key.value) === 'label')
      found = true
  })
  return found
}
for (const file of files) {
  const f = `${root}/${file}`,
    src = fs.readFileSync(f, 'utf8'),
    fileHash = hash(src)
  const ast = parser.parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  output.sourceFiles.push({ path: f, lines: src.split('\n').length, sha256: fileHash })
  const text = (n) => (n ? src.slice(n.start, n.end) : '')
  const val = (n) =>
    !n
      ? null
      : n.type === 'StringLiteral'
        ? n.value
        : n.type === 'JSXExpressionContainer' && n.expression.type === 'StringLiteral'
          ? n.expression.value
          : text(n)
  const rec = (kind, n, more) => {
    const arr = output[kind]
    arr.push({
      id: `PDF-${kind.toUpperCase()}-${String(arr.length + 1).padStart(4, '0')}`,
      file: f,
      line: n.loc.start.line,
      endLine: n.loc.end.line,
      fileSha256: fileHash,
      snippetSha256: hash(text(n)),
      ...more,
    })
  }
  walk(ast, (n, anc) => {
    if (n.type === 'JSXOpeningElement') {
      const tag = text(n.name),
        attrs = Object.fromEntries(
          n.attributes.filter((a) => a.type === 'JSXAttribute').map((a) => [text(a.name), a.value]),
        )
      const parent = anc[anc.length - 1]
      const childrenText =
        parent?.type === 'JSXElement'
          ? parent.children
              .filter((c) => c.type === 'JSXText')
              .map((c) => c.value.trim())
              .filter(Boolean)
              .join(' ')
          : ''
      const label = val(attrs.label || attrs['aria-label'] || attrs.title) || childrenText || null
      const owner =
        anc.toReversed().find((a) => a.type === 'FunctionDeclaration')?.id?.name ||
        '(component callback)'
      if (
        /^(Toolbar(Button|FileButton|Select|TextField|TextArea|NumberField|ToggleGroup|ColorPicker|MenuItemRow|Menu|Confirm)|Button|Input(\..+)?|InputNumber|Checkbox|Radio(\..+)?|Select|NumberField|Field|ConciseNumberInput|button|input|textarea|select)$/.test(
          tag,
        )
      ) {
        rec('controls', n, {
          component: tag,
          owner,
          label,
          disabled: text(attrs.disabled) || null,
          action: text(attrs.onClick || attrs.onChange || attrs.onCommit || attrs.onPick) || null,
        })
      }
      if (tag === 'ToolbarSelect' || tag === 'Select')
        rec('selectAudit', n, {
          component: tag,
          owner,
          label,
          disabled: text(attrs.disabled) || null,
          fieldsetAncestors: anc
            .filter((a) => a.type === 'JSXElement' && text(a.openingElement.name) === 'fieldset')
            .map((a) => text(a.openingElement)),
        })
      if (
        /^Toolbar(Menu|Confirm|ColorPicker)$/.test(tag) ||
        ['aside', 'details'].includes(tag) ||
        (tag === 'section' && /panel/.test(val(attrs.className) || '')) ||
        (tag === 'div' && /mimir-pdf-panel/.test(val(attrs.className) || ''))
      )
        rec('surfaces', n, { component: tag, label, className: val(attrs.className) })
      if (tag === 'CompactToolbar')
        for (const kind of ['tabs', 'sections']) {
          const attr = attrs[kind]
          if (attr?.type !== 'JSXExpressionContainer') continue
          walk(attr.expression, (x) => {
            if (x.type !== 'ObjectExpression') return
            const props = Object.fromEntries(
              x.properties
                .filter((p) => p.type === 'ObjectProperty')
                .map((p) => [p.key.name || p.key.value, p.value]),
            )
            if (
              props.key?.type === 'StringLiteral' &&
              props.label?.type === 'StringLiteral' &&
              (kind === 'tabs' || props.tab?.type === 'StringLiteral')
            )
              rec(kind === 'tabs' ? 'tabs' : 'groups', x, {
                key: props.key.value,
                label: props.label.value,
                tab: props.tab?.value || null,
              })
          })
        }
    }
    if (n.type === 'ObjectProperty' && (n.key.name || n.key.value) === 'label')
      rec('labelDeclarations', n, {
        label: val(n.value),
        dynamic: n.value.type !== 'StringLiteral',
      })
    if (
      n.type === 'CallExpression' &&
      n.callee.type === 'MemberExpression' &&
      n.callee.property.name === 'map' &&
      (hasJsx(n.arguments[0]) || hasOptionLabel(n.arguments[0]))
    )
      rec('dynamicFamilies', n, {
        expression: text(n.callee.object),
        description: 'One source family, not expanded or GUI verified.',
      })
    if (
      (n.type === 'ConditionalExpression' ||
        n.type === 'LogicalExpression' ||
        n.type === 'IfStatement') &&
      hasJsx(n)
    )
      rec('stateBranches', n, {
        kind: n.type,
        condition: text(n.test || n.left),
        description:
          'JSX-producing branch; nested/overlapping branches are separate source records, not independent end-user states.',
      })
    if (
      n.type === 'VariableDeclarator' &&
      n.init?.type === 'CallExpression' &&
      n.init.callee.name === 'useState'
    )
      rec('stateHooks', n, { binding: text(n.id), initialValue: text(n.init.arguments[0]) })
  })
}
for (const file of [...new Set(supporting)].toSorted()) {
  const data = fs.readFileSync(file)
  output.supportingFiles.push({ path: file, sha256: hash(data), bytes: data.length })
}
output.counts = Object.fromEntries(
  Object.keys(output)
    .filter((key) => Array.isArray(output[key]))
    .map((key) => [key, output[key].length]),
)
fs.writeFileSync(path.join(base, 'source-inventory.json'), JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify(output.counts, null, 2))
console.log(
  JSON.stringify(
    output.selectAudit
      .filter((r) => !r.disabled)
      .map(({ file, line, label, owner }) => ({ file, line, label, owner })),
    null,
    2,
  ),
)
