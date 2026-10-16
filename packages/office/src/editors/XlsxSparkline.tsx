export function XlsxSparkline({
  values,
  type,
  color,
}: {
  values: (number | null)[]
  type: string
  color: string
}) {
  const numbers = values.filter((n): n is number => n !== null),
    min = Math.min(0, ...numbers),
    max = Math.max(0, ...numbers),
    spread = max - min || 1,
    baseline = 22 - ((0 - min) / spread) * 20
  const x = (i: number) => 2 + (values.length <= 1 ? 36 : (i / (values.length - 1)) * 72),
    y = (n: number) => 22 - ((n - min) / spread) * 20
  const points = values.map((value, index) => ({ value, index, key: `point-${index}` }))
  return (
    <svg
      className="mimir-xlsx-sparkline"
      viewBox="0 0 76 24"
      role="img"
      aria-label={`${type === 'line' ? '折线' : type === 'column' ? '柱形' : '盈亏'}迷你图：${values.map((v) => v ?? '空').join('、')}`}
    >
      {type === 'line' &&
        points.map(({ value: v, index: i, key }) =>
          v !== null && values[i - 1] == null && values[i + 1] == null ? (
            <circle key={key} cx={x(i)} cy={y(v)} r={2} fill={color} />
          ) : null,
        )}
      {type === 'line'
        ? points.map(({ value: v, index: i, key }) =>
            v !== null && i > 0 && values[i - 1] !== null ? (
              <line
                key={key}
                x1={x(i - 1)}
                y1={y(values[i - 1]!)}
                x2={x(i)}
                y2={y(v)}
                stroke={color}
                strokeWidth={1.5}
              />
            ) : null,
          )
        : points.map(({ value: v, index: i, key }) =>
            v === null ? null : (
              <rect
                key={key}
                x={(i / values.length) * 74 + 1}
                width={Math.max(1, 74 / values.length - 2)}
                y={type === 'stacked' ? (v >= 0 ? 2 : 13) : Math.min(baseline, y(v))}
                height={type === 'stacked' ? 9 : Math.max(1, Math.abs(y(v) - baseline))}
                fill={v < 0 ? '#C0504D' : color}
              />
            ),
          )}
    </svg>
  )
}
