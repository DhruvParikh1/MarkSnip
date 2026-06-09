const liveClipCases = [
  {
    id: 'example-domain',
    name: 'clips Example.com via popup flow and returns markdown',
    url: 'https://example.com/',
    selector: 'h1',
    titleContains: 'Example Domain',
    snippets: [
      'This domain is for use in documentation examples without needing permission.',
      'Learn more'
    ]
  },
  {
    id: 'wikipedia-markdown',
    name: 'clips the live Wikipedia Markdown article via popup flow',
    url: 'https://en.wikipedia.org/wiki/Markdown',
    selector: '#firstHeading',
    titleContains: 'Markdown',
    snippets: [
      'Markdown',
      'lightweight markup language'
    ]
  },
  {
    id: 'wikipedia-wiki-sidecar-images',
    name: 'clips the live Wikipedia Wiki article with sidecar image paths',
    url: 'https://en.wikipedia.org/wiki/Wiki',
    selector: '#firstHeading',
    titleContains: 'Wiki',
    storageOptions: {
      downloadImages: true,
      downloadMode: 'downloadsApi',
      imagePlacement: 'sidecar',
      imagePrefix: '{pageTitle}/',
      imageStyle: 'markdown',
      title: '{pageTitle}'
    },
    snippets: [
      'Wiki'
    ],
    baseSnippets: [
      '%7BpageTitle%7D/'
    ],
    currentSnippets: [
      'Wiki%20-%20Wikipedia/'
    ]
  },
  {
    id: 'wikipedia-firefox',
    name: 'clips the live Wikipedia Firefox article via popup flow',
    url: 'https://en.wikipedia.org/wiki/Firefox',
    selector: '#firstHeading',
    titleContains: 'Firefox',
    snippets: [
      'Mozilla Firefox',
      'web browser'
    ]
  },
  {
    id: 'obsidian-links',
    name: 'clips the live Obsidian links help page via popup flow',
    url: 'https://obsidian.md/help/links',
    selector: 'h1',
    titleContains: 'Internal links',
    snippets: [
      'Learn how to link to notes, attachments, and other files from your notes'
    ]
  },
  {
    id: 'sebastian-open-watcom',
    name: 'clips the live Sebastian graphics Open Watcom article via popup flow',
    url: 'https://sebastian.graphics/blog/16-bit-tiny-model-standalone-c-with-open-watcom.html',
    selector: 'h1',
    titleContains: 'Open Watcom',
    snippets: [
      "A few days ago I've heard that Open Watcom is able to generate",
      '## Replacing the wrapper',
      'wrapper.asm'
    ]
  },
  {
    id: 'visualmode-array-argument',
    name: 'clips the live Visualmode array argument article via popup flow',
    url: 'https://www.visualmode.dev/ruby-operators/array-argument',
    selector: 'h1',
    titleContains: 'Argument',
    snippets: [
      'Here is an example of a method that can accept any number of (positional) arguments',
      'def odd_finder(*items)'
    ]
  },
  {
    id: 'ruby-data-docs',
    name: 'clips the live Ruby Data docs page via popup flow',
    url: 'https://ruby-doc.org/3.3.6/Data.html',
    selector: 'h1',
    titleContains: 'Data',
    snippets: [
      'Class Data provides a convenient way to define simple classes for value-alike objects.',
      'Measure = Data.define(:amount, :unit)'
    ]
  },
  {
    id: 'runjs-equations',
    name: 'clips the live RunJS equations article via popup flow',
    url: 'https://runjs.app/blog/equations-that-changed-the-world-rewritten-in-javascript',
    selector: 'h1',
    titleContains: 'Equations',
    snippets: [
      '17 Equations That Changed The World',
      '## The Pythagorean Theorem'
    ]
  },
  {
    id: 'virginia-beach-celebrating-children',
    name: 'clips the live Virginia Beach Celebrating Children page via popup flow',
    url: 'https://libraries.virginiabeach.gov/programs-events/growsmart/our-initiatives/celebrating-children',
    selector: 'h1',
    titleContains: 'Celebrating Children',
    snippets: [
      'This annual event, presented by GrowSmart',
      '## Celebrating Children FAQ',
      'Kid-friendly games, crafts and activities'
    ]
  },
  {
    id: 'wechat-code-block-newlines',
    name: 'clips a WeChat article with code block newlines via popup flow',
    url: 'https://mp.weixin.qq.com/s/CZmoztuvC2mYssA2VVtWgg',
    selector: 'h1',
    titleContains: 'edu漏洞之若依nday漏洞复现',
    snippets: [
      'edu漏洞之若依nday漏洞复现',
      '若依nday漏洞二'
    ],
    baseSnippets: [
      'POST /system/user/list HTTP/1.1Host: xxxContent-Length: 153'
    ],
    currentSnippets: [
      'POST /system/user/list HTTP/1.1\nHost: xxx\nContent-Length: 153',
      'pageSize=10&pageNum=1&orderByColumn=createTime'
    ]
  }
];

module.exports = {
  liveClipCases
};
