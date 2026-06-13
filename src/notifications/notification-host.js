'use strict';

(function () {
  if (window.top !== window) {
    return;
  }

  const DISPLAY_DELAY_MS = (
    location.protocol === 'chrome-extension:' ||
    location.protocol === 'moz-extension:'
  ) ? 0 : 1000;

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function waitForDomReady() {
    if (document.readyState !== 'loading') {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      window.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }

  function getRuntime() {
    if (typeof browser !== 'undefined' && browser.runtime) {
      return browser.runtime;
    }

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      return chrome.runtime;
    }

    return null;
  }

  function sendRuntimeMessage(message) {
    const runtime = getRuntime();
    if (!runtime) {
      return Promise.resolve(null);
    }

    if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
      return browser.runtime.sendMessage(message);
    }

    return new Promise((resolve, reject) => {
      runtime.sendMessage(message, (response) => {
        if (chrome.runtime?.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(response);
      });
    });
  }

  class FloatingNotificationCard {
    constructor(notification, options = {}) {
      this.notification = notification;
      this.onRemove = typeof options.onRemove === 'function' ? options.onRemove : () => {};
      this.host = document.createElement('div');
      this.host.style.position = 'fixed';
      this.host.style.top = '20px';
      this.host.style.right = '20px';
      this.host.style.left = 'auto';
      this.host.style.bottom = 'auto';
      this.host.style.zIndex = '2147483647';
      this.host.style.pointerEvents = 'auto';

      this.shadow = this.host.attachShadow({ mode: 'open' });
      this.shadow.appendChild(this.buildStyles());
      this.shadow.appendChild(this.buildCard());
    }

    buildStyles() {
      const style = document.createElement('style');
      style.textContent = `
        :host {
          all: initial;
        }

        /* ── Entrance animation ── */
        @keyframes notif-slideIn {
          from {
            opacity: 0;
            transform: translateX(40px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }

        /* ── Sparkle float (milestone only) ── */
        @keyframes sparkle-float {
          0%, 100% {
            opacity: 0.25;
            transform: translateY(0) scale(0.8);
          }
          50% {
            opacity: 0.85;
            transform: translateY(-8px) scale(1.1);
          }
        }

        /* ── Shimmer sweep for accent stripe ── */
        @keyframes shimmer-sweep {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        /* ── Card ── */
        .card {
          width: min(340px, calc(100vw - 32px));
          background:
            linear-gradient(180deg, rgba(24, 34, 31, 0.98) 0%, rgba(16, 24, 22, 0.99) 100%);
          color: #f8f6f1;
          border: 1px solid rgba(169, 194, 176, 0.22);
          border-radius: 18px;
          box-shadow:
            0 24px 60px rgba(0, 0, 0, 0.38),
            0 4px 16px rgba(0, 0, 0, 0.18),
            inset 0 1px 0 rgba(255, 255, 255, 0.06);
          font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
          overflow: hidden;
          animation: notif-slideIn 360ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        /* ── Accent stripe (version-update) ── */
        .accent-stripe {
          height: 3px;
          background: linear-gradient(90deg, #56735A, #6B8E6F, #a9c2b0, #6B8E6F, #56735A);
          background-size: 200% 100%;
          animation: shimmer-sweep 3s ease-in-out infinite;
        }

        /* ── Header ── */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 13px 16px 11px;
          cursor: move;
          background: linear-gradient(135deg, rgba(110, 142, 116, 0.18), rgba(255, 255, 255, 0));
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          user-select: none;
        }

        .eyebrow {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(169, 194, 176, 0.72);
        }

        /* ── Close button ── */
        .close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border: 0;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.55);
          font-size: 15px;
          line-height: 1;
          cursor: pointer;
          padding: 0;
          transition: background 150ms ease, color 150ms ease;
        }

        .close:hover {
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
        }

        /* ── Body ── */
        .body {
          padding: 16px 18px 18px;
        }

        /* ── Title ── */
        .title {
          margin: 0 0 6px;
          font-size: 17px;
          line-height: 1.3;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: #ffffff;
        }

        /* ── Version badge ── */
        .version-badge {
          display: inline-block;
          margin-bottom: 10px;
          padding: 2px 10px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: #a9c2b0;
          background: rgba(107, 142, 111, 0.2);
          border: 1px solid rgba(107, 142, 111, 0.25);
          border-radius: 999px;
        }

        /* ── Message ── */
        .message {
          margin: 0;
          font-size: 13.5px;
          line-height: 1.55;
          color: rgba(248, 246, 241, 0.75);
        }

        /* ── Milestone hero ── */
        .milestone-hero {
          position: relative;
          text-align: center;
          padding: 10px 0 6px;
          margin-bottom: 10px;
        }

        .milestone-number {
          font-size: 40px;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #ffffff;
          text-shadow:
            0 0 30px rgba(215, 177, 94, 0.3),
            0 0 60px rgba(215, 177, 94, 0.12);
          line-height: 1.1;
        }

        .milestone-label {
          font-size: 13px;
          font-weight: 500;
          color: rgba(248, 246, 241, 0.48);
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-top: 2px;
        }

        /* ── Sparkle particles ── */
        .sparkle {
          position: absolute;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: rgba(215, 177, 94, 0.6);
          pointer-events: none;
        }

        .sparkle-1 {
          top: 8px;
          right: 22%;
          animation: sparkle-float 2.4s ease-in-out infinite;
        }

        .sparkle-2 {
          bottom: 10px;
          left: 18%;
          animation: sparkle-float 2.8s ease-in-out 0.6s infinite;
        }

        .sparkle-3 {
          top: 14px;
          left: 28%;
          width: 3px;
          height: 3px;
          background: rgba(169, 194, 176, 0.5);
          animation: sparkle-float 3.2s ease-in-out 1.2s infinite;
        }

        /* ── Highlights list ── */
        .highlights {
          margin: 12px 0 0;
          padding: 0;
          list-style: none;
          max-height: 150px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(169, 194, 176, 0.2) transparent;
        }

        .highlights li {
          position: relative;
          margin: 0 0 7px;
          padding-left: 20px;
          line-height: 1.45;
          font-size: 12.5px;
          color: rgba(248, 246, 241, 0.82);
        }

        .highlights li::before {
          content: '✓';
          position: absolute;
          left: 0;
          top: 0;
          font-size: 12px;
          font-weight: 700;
          color: #6B8E6F;
        }

        /* ── Divider ── */
        .body-divider {
          height: 1px;
          margin: 14px 0;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
          border: none;
        }

        /* ── Actions ── */
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 16px;
        }

        .action {
          appearance: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 38px;
          padding: 0 16px;
          border-radius: 999px;
          text-decoration: none;
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: 0.01em;
          transition:
            transform 140ms cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow 140ms ease,
            background 140ms ease,
            border-color 140ms ease;
        }

        .action:hover {
          transform: translateY(-2px);
        }

        .action-primary {
          background: linear-gradient(135deg, #d7b15e, #c9a24e);
          color: #1a1711;
          box-shadow: 0 2px 10px rgba(215, 177, 94, 0.15);
          border: none;
        }

        .action-primary:hover {
          box-shadow: 0 6px 20px rgba(215, 177, 94, 0.3);
          background: linear-gradient(135deg, #deba6c, #d7b15e);
        }

        .action-secondary {
          background: rgba(255, 255, 255, 0.07);
          color: rgba(255, 255, 255, 0.88);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .action-secondary:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.22);
          color: #ffffff;
        }

        .action-arrow {
          font-size: 14px;
          opacity: 0.7;
          transition: transform 140ms ease, opacity 140ms ease;
        }

        .action:hover .action-arrow {
          transform: translateX(2px);
          opacity: 1;
        }
      `;
      return style;
    }

    buildCard() {
      const isVersionUpdate = this.notification.type === 'version-update';
      const isMilestone = this.notification.type === 'support-milestone';
      const isReviewRequest = this.notification.type === 'review-request';

      const card = document.createElement('section');
      card.className = 'card';

      // ── Accent stripe (version-update only) ──
      if (isVersionUpdate) {
        const stripe = document.createElement('div');
        stripe.className = 'accent-stripe';
        card.appendChild(stripe);
      }

      // ── Header ──
      const header = document.createElement('div');
      header.className = 'header';

      const eyebrow = document.createElement('div');
      eyebrow.className = 'eyebrow';
      eyebrow.textContent = isVersionUpdate ? 'MarkSnip Update' : isReviewRequest ? 'Quick Ask' : 'Milestone';

      const close = document.createElement('button');
      close.className = 'close';
      close.type = 'button';
      close.setAttribute('aria-label', 'Dismiss notification');
      close.textContent = '✕';
      close.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
      });
      close.addEventListener('click', () => {
        void sendRuntimeMessage({
          type: 'dismiss-notification',
          notificationId: this.notification.id
        }).catch(() => {});
        this.remove();
      });

      header.appendChild(eyebrow);
      header.appendChild(close);

      // ── Body ──
      const body = document.createElement('div');
      body.className = 'body';

      // ── Milestone hero (milestone only) ──
      if (isMilestone && this.notification.milestone) {
        const hero = document.createElement('div');
        hero.className = 'milestone-hero';

        const number = document.createElement('div');
        number.className = 'milestone-number';
        number.textContent = new Intl.NumberFormat('en-US').format(this.notification.milestone);

        const label = document.createElement('div');
        label.className = 'milestone-label';
        label.textContent = 'pages exported';

        // Sparkle particles
        for (let i = 1; i <= 3; i++) {
          const sparkle = document.createElement('span');
          sparkle.className = `sparkle sparkle-${i}`;
          hero.appendChild(sparkle);
        }

        hero.appendChild(number);
        hero.appendChild(label);
        body.appendChild(hero);

        // Divider after hero
        const divider = document.createElement('hr');
        divider.className = 'body-divider';
        body.appendChild(divider);
      }

      // ── Title ──
      const title = document.createElement('h2');
      title.className = 'title';
      title.textContent = this.notification.title || 'MarkSnip notification';
      body.appendChild(title);

      // ── Version badge (version-update only) ──
      if (isVersionUpdate && this.notification.currentVersion) {
        const badge = document.createElement('span');
        badge.className = 'version-badge';
        badge.textContent = `v${this.notification.currentVersion}`;
        body.appendChild(badge);
      }

      // ── Message ──
      const message = document.createElement('p');
      message.className = 'message';
      message.textContent = this.notification.message || '';
      body.appendChild(message);

      // ── Highlights (version-update) ──
      if (Array.isArray(this.notification.highlights) && this.notification.highlights.length > 0) {
        const highlights = document.createElement('ul');
        highlights.className = 'highlights';

        this.notification.highlights.forEach((highlight) => {
          const item = document.createElement('li');
          item.textContent = highlight;
          highlights.appendChild(item);
        });

        body.appendChild(highlights);
      }

      // ── Action buttons ──
      const actions = document.createElement('div');
      actions.className = 'actions';

      if (this.notification.primaryAction?.url) {
        actions.appendChild(
          this.createAction(this.notification.primaryAction, 'action-primary', false)
        );
      }

      if (this.notification.secondaryAction?.url) {
        actions.appendChild(
          this.createAction(this.notification.secondaryAction, 'action-secondary', true)
        );
      }

      if (actions.childNodes.length > 0) {
        body.appendChild(actions);
      }

      card.appendChild(header);
      card.appendChild(body);

      this.enableDragging(header);

      return card;
    }

    createAction(action, variantClass, showArrow = false) {
      const anchor = document.createElement('a');
      anchor.className = `action ${variantClass}`;
      anchor.href = action.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = action.label;

      if (showArrow) {
        const arrow = document.createElement('span');
        arrow.className = 'action-arrow';
        arrow.textContent = '→';
        anchor.appendChild(arrow);
      }

      return anchor;
    }

    enableDragging(handle) {
      let pointerId = null;
      let offsetX = 0;
      let offsetY = 0;

      handle.addEventListener('pointerdown', (event) => {
        pointerId = event.pointerId;
        handle.setPointerCapture(pointerId);

        const rect = this.host.getBoundingClientRect();
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;

        this.host.style.left = `${rect.left}px`;
        this.host.style.top = `${rect.top}px`;
        this.host.style.right = 'auto';
        this.host.style.bottom = 'auto';
      });

      handle.addEventListener('pointermove', (event) => {
        if (pointerId !== event.pointerId) {
          return;
        }

        const maxX = Math.max(0, window.innerWidth - this.host.offsetWidth);
        const maxY = Math.max(0, window.innerHeight - this.host.offsetHeight);
        const nextLeft = Math.min(Math.max(0, event.clientX - offsetX), maxX);
        const nextTop = Math.min(Math.max(0, event.clientY - offsetY), maxY);

        this.host.style.left = `${nextLeft}px`;
        this.host.style.top = `${nextTop}px`;
      });

      const stopDragging = (event) => {
        if (pointerId !== event.pointerId) {
          return;
        }

        handle.releasePointerCapture(pointerId);
        pointerId = null;
      };

      handle.addEventListener('pointerup', stopDragging);
      handle.addEventListener('pointercancel', stopDragging);
    }

    mount() {
      (document.body || document.documentElement).appendChild(this.host);
    }

    remove() {
      this.host.remove();
      this.onRemove();
    }
  }

  function createNotificationHostController() {
    let currentCard = null;
    let currentNotificationId = null;
    let displayTask = null;

    function clearCurrentCard(card) {
      if (currentCard === card) {
        currentCard = null;
        currentNotificationId = null;
      }
    }

    async function showPendingNotification() {
      if (displayTask) {
        return displayTask;
      }

      displayTask = (async () => {
        await waitForDomReady();
        await delay(DISPLAY_DELAY_MS);

        const notification = await sendRuntimeMessage({ type: 'get-pending-notification' }).catch(() => null);
        if (!notification || !notification.id) {
          return false;
        }

        if (
          currentCard &&
          currentNotificationId === notification.id &&
          currentCard.host.isConnected
        ) {
          return true;
        }

        if (currentCard) {
          currentCard.remove();
        }

        const card = new FloatingNotificationCard(notification, {
          onRemove: () => clearCurrentCard(card)
        });

        currentCard = card;
        currentNotificationId = notification.id;
        card.mount();

        void sendRuntimeMessage({
          type: 'mark-notification-shown',
          notificationId: notification.id
        }).catch(() => {});

        return true;
      })().finally(() => {
        displayTask = null;
      });

      return displayTask;
    }

    return {
      showPendingNotification
    };
  }

  const notificationHost = (
    window.markSnipNotificationHost &&
    typeof window.markSnipNotificationHost.showPendingNotification === 'function'
  )
    ? window.markSnipNotificationHost
    : createNotificationHostController();

  window.markSnipNotificationHost = notificationHost;
  void notificationHost.showPendingNotification();
})();
