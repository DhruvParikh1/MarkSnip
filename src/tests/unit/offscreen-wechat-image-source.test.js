const fs = require('fs');
const path = require('path');
const vm = require('vm');

const offscreenSource = fs.readFileSync(
  path.join(__dirname, '../../offscreen/offscreen.js'),
  'utf8'
);

function createOffscreenSandbox() {
  class TestTurndownService {
    constructor(options = {}) {
      this.rules = [];
      this.options = options;
    }

    use() {}

    keep() {}

    addRule(name, rule) {
      this.rules.push({ name, rule });
    }

    turndown(html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
      const imageRule = this.rules.find((entry) => entry.name === 'images')?.rule;
      const parts = [];

      function visit(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          parts.push(node.textContent);
          return;
        }
        if (imageRule?.filter(node, this.options) === true) {
          parts.push(imageRule.replacement.call(imageRule, '', node, this.options));
          return;
        }
        node.childNodes?.forEach((childNode) => visit.call(this, childNode));
      }

      doc.body.childNodes.forEach((node) => visit.call(this, node));

      const options = this.options;
      return `${this.options.prepend?.(options) || ''}${parts.join('')}${this.options.append?.(options) || ''}`;
    }
  }

  TestTurndownService.prototype = {
    ...TestTurndownService.prototype,
    escape(value) {
      return value;
    },
    defaultEscape(value) {
      return value;
    }
  };

  const domParser = global.DOMParser;
  const textNode = global.Node;
  const sandbox = {
    console,
    DOMParser: domParser,
    Node: textNode,
    TurndownService: TestTurndownService,
    turndownPluginGfm: {
      highlightedCodeBlock: () => {},
      strikethrough: () => {},
      taskListItems: () => {}
    },
    document: {
      addEventListener: jest.fn(),
      createElement: jest.fn(() => ({
        innerHTML: '',
        querySelectorAll: () => []
      }))
    },
    browser: {
      runtime: {
        onMessage: {
          addListener: jest.fn()
        },
        sendMessage: jest.fn()
      }
    },
    chrome: {},
    defaultOptions: {},
    markSnipUrlUtils: require('../../shared/url-utils')
  };

  vm.createContext(sandbox);
  vm.runInContext(offscreenSource, sandbox, { filename: 'offscreen.js' });
  return sandbox;
}

describe('offscreen WeChat image source handling', () => {
  const defaultOptions = {
    downloadImages: true,
    imageStyle: 'markdown',
    imageRefStyle: 'inlined',
    turndownEscape: false,
    tableFormatting: {},
    frontmatter: '',
    backmatter: '',
    title: 'WeChat Article',
    imagePlacement: 'sameFolder',
    imagePrefix: ''
  };

  test('uses data-src for WeChat images whose src was rewritten for lazy loading', () => {
    const sandbox = createOffscreenSandbox();
    const realSrc = 'https://mmbiz.qpic.cn/mmbiz_jpg/example/640?wx_fmt=jpeg';
    const rewrittenSrc = 'https://mmbiz.qpic.cn/mmbiz_jpg/example/640?wx_fmt=jpeg&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1';
    const result = sandbox.turndown(
      `<img alt="图片" data-src="${realSrc}" src="${rewrittenSrc}">`,
      defaultOptions,
      {
        baseURI: 'https://mp.weixin.qq.com/s/example'
      }
    );

    expect(result.markdown).toBe('![图片](640.jpeg)');
    expect(result.imageList).toEqual({
      [realSrc]: '640.jpeg'
    });
  });

  test('collects all 12 body images from the reported WeChat article fixture', () => {
    const sandbox = createOffscreenSandbox();
    const imageSources = [
      'https://mmbiz.qpic.cn/sz_mmbiz_jpg/j7RlD5l5q1yknQ1Bp2UELUXajM9O3OIrB3jcU8yia5Dcpbia8T6jz6oxrcW2Q4xOcxic9IvP1nXVwRvWGnwkfDh7TOYXfd3gG7b8HxUjnWia7G4/640?wx_fmt=jpeg&from=appmsg',
      'https://mmbiz.qpic.cn/sz_mmbiz_png/j7RlD5l5q1y3SkBtELRdXLMwQgjDIeKXvYLnuLhburO7WRllHgQiaj9f5qicfzzoibNS0zrbW0LsVBMdHnXKZ0tmnIpOcpBLqgWC3f1QUlgPKY/640?wx_fmt=png&from=appmsg',
      'https://mmbiz.qpic.cn/mmbiz_jpg/j7RlD5l5q1znPVvJFmqEicUcXwUGyU6SNbVDuC1bDzDkzXNiblWz3m0Jf6ZvZ9oiavoBicGrWcZWmp7NOkeLjyA2RiawhwLzkAR1hIic8MVvX5jib4/640?wx_fmt=webp&from=appmsg',
      'https://mmbiz.qpic.cn/sz_mmbiz_jpg/j7RlD5l5q1xUPbcLZsw1p1mBqliaPdiaDw6Iicff0c1y6ySyscjxGEtWRNBztgGGkV732Zj2ZIumZD99QZkVq8GOaib8JqpInEHibBlwcR1zSvJs/640?wx_fmt=webp&from=appmsg',
      'https://mmbiz.qpic.cn/sz_mmbiz_jpg/j7RlD5l5q1zSib6uyLEibbyocwPWgq4OlM6vUgiaGMLCrt2P3SZgjasF9gNI6BS8zr7ib2p2uuialt8ULx6ZKJ0MgS8GPgLLny0qB4QcmGFiaHqnY/640?wx_fmt=webp&from=appmsg',
      'https://mmbiz.qpic.cn/mmbiz_jpg/j7RlD5l5q1x99ic8nqMQWqMc3hGujxkG3ukuDJOGw8UUKa4hGJTBg6DpwX2GiaQgg5V9mvCupn4ZXrHXKF5AyYibRz9iadTIY3kOvgqiax3lkdJs/640?wx_fmt=webp&from=appmsg',
      'https://mmbiz.qpic.cn/sz_mmbiz_jpg/j7RlD5l5q1xuAMI6nKhIKF3vxegVCyF4vxh9qnHLfQicMvibwYseCFQlJk4xhgJ4lribxia9x4HG0QupoF2tVVXWWfYT7n8jDKMqnTmEuqjiboa0/640?wx_fmt=webp&from=appmsg',
      'https://mmbiz.qpic.cn/mmbiz_jpg/j7RlD5l5q1yYhjpndt6eibSNy3LDdlLyZS4BID9RqgAgHWGDpBFcJPbBtFvwsTicibBIDiaWtcib8dQ3r2ADicOmCX1fBGOETxicyxI6g5U2hwDxmA/640?wx_fmt=webp&from=appmsg',
      'https://mmbiz.qpic.cn/sz_mmbiz_jpg/j7RlD5l5q1yrSghvHAUmW028RMx7AZz1V6m14lfx3ZT4rtAI7e2RpbsC2hKwicYNotkrfeUgiaPA0ULXDgq0SaI8Olibko0Bfiau7ibdDJg8o5zI/640?wx_fmt=webp&from=appmsg',
      'https://mmbiz.qpic.cn/mmbiz_jpg/j7RlD5l5q1xppsVCPDMTvvncAkYhxEenJicBib2Cic952uCG6OQyCz1TCCoeJArtiakkSG1icPTo5tonk3ha2IMGS32MfpTYicHEich2daKcfpkddY/640?wx_fmt=webp&from=appmsg',
      'https://mmbiz.qpic.cn/mmbiz_jpg/j7RlD5l5q1y5h8RSem4RHre6iaExamY6OQpNSMB9nmnflPAgibZB7nNFhrnDSHvFAMl5le408aKCxnrIcZj3DNWQHcGTkROhEDVGhGgqooIhg/640?wx_fmt=webp&from=appmsg',
      'https://mmbiz.qpic.cn/mmbiz_jpg/j7RlD5l5q1zKNeK5iaJ7g9zD1AG3pjr5b1hRiaicB8b5tgljHZCVPI1jlplH86yFX4nVHiaGuHNPtzJ8exKXu4hRo3iab4aQsVPvdQelGOUlslia4/640?wx_fmt=webp&from=appmsg'
    ];
    const html = imageSources
      .map((src) => `<section><p><img class="rich_pages wxw-img js_insertlocalimg" alt="图片" data-src="${src}" data-type="webp"></p></section>`)
      .join('');

    const result = sandbox.turndown(html, defaultOptions, {
      baseURI: 'https://mp.weixin.qq.com/s/2kWi0Fld09fNMVIUg9ddKQ'
    });

    expect(Object.keys(result.imageList)).toEqual(imageSources);
    expect(Object.keys(result.imageList)).toHaveLength(12);
    expect(new Set(Object.values(result.imageList))).toEqual(new Set([
      '640.jpeg',
      '640.png',
      '640.webp',
      '640.1.webp',
      '640.2.webp',
      '640.3.webp',
      '640.4.webp',
      '640.5.webp',
      '640.6.webp',
      '640.7.webp',
      '640.8.webp',
      '640.9.webp'
    ]));
  });
});
