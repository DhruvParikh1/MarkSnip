(function (root, factory) {
  const api = factory(root);
  root.markSnipReader = Object.assign(root.markSnipReader || {}, api);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function slugify(value, fallback) {
    const slug = String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || fallback;
  }

  function collectOutlineItems(articleEl) {
    const headings = Array.from(articleEl.querySelectorAll('h2,h3,h4,h5,h6'));
    if (headings.length <= 1) return [];
    const usedIds = new Set();
    return headings.map((heading, index) => {
      const level = Number(heading.tagName.slice(1));
      let id = heading.id || slugify(heading.textContent, `reader-section-${index + 1}`);
      const base = id;
      let suffix = 2;
      while (usedIds.has(id)) {
        id = `${base}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(id);
      heading.id = id;
      return {
        id,
        level,
        text: String(heading.textContent || '').replace(/\s+/g, ' ').trim()
      };
    }).filter((item) => item.text);
  }

  function buildOutline(doc, articleEl, opts = {}) {
    const items = collectOutlineItems(articleEl);
    const container = opts.container || doc.createElement('nav');
    container.className = container.className || 'ms-reader-outline-list';
    container.innerHTML = '';

    if (!items.length) {
      container.hidden = true;
      return { items, element: container, teardown() {} };
    }

    const list = doc.createElement('ol');
    items.forEach((item) => {
      const li = doc.createElement('li');
      li.dataset.level = String(item.level);
      const link = doc.createElement('a');
      link.href = `#${item.id}`;
      link.textContent = item.text;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        doc.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      li.appendChild(link);
      list.appendChild(li);
    });
    container.appendChild(list);

    let observer = null;
    if (typeof IntersectionObserver === 'function') {
      const byId = new Map(Array.from(container.querySelectorAll('a')).map((link) => [link.getAttribute('href').slice(1), link]));
      observer = new IntersectionObserver((entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible?.target?.id) return;
        byId.forEach((link) => link.removeAttribute('aria-current'));
        byId.get(visible.target.id)?.setAttribute('aria-current', 'true');
      }, { rootMargin: '0px 0px -70% 0px', threshold: [0, 0.25, 0.5, 1] });
      items.forEach((item) => {
        const heading = doc.getElementById(item.id);
        if (heading) observer.observe(heading);
      });
    }

    return {
      items,
      element: container,
      teardown() {
        observer?.disconnect();
      }
    };
  }

  return {
    buildOutline,
    _collectReaderOutlineItems: collectOutlineItems
  };
});
