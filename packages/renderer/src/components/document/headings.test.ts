import { expect, it } from 'vitest'
import { extractHeadings } from './headings'

it('ignores fenced and indented code, including fences closed only by matching markers', () => {
  expect(
    extractHeadings(
      '# Start\n```md\n# not heading\n~~~\n## still code\n```\n    # indented\n## End',
    ).map((h) => h.text),
  ).toEqual(['Start', 'End'])
})
it('matches rendered ATX/Setext headings in DOM order with readable labels', () => {
  expect(
    extractHeadings(
      'Title\n=====\n\n## **Second** [link](https://example.com) ##\n\n> ### Quote\n\n```\nignored\n```\nTail\n---',
    ),
  ).toEqual([
    { id: 'h-0', level: 2, text: 'Title' },
    { id: 'h-1', level: 2, text: 'Second link' },
    { id: 'h-2', level: 3, text: 'Quote' },
    { id: 'h-3', level: 2, text: 'Tail' },
  ])
})
