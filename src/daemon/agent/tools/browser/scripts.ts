// Injectable JavaScript for browser automation.
//
// Each export is a string constant evaluated inside Playwright's page context
// via page.evaluate(). They share the `data-jeriko-id` attribute convention
// for element identification.
//
// Design:
//   - Pure JS strings — no TypeScript, no imports, no Node APIs
//   - Each script is self-contained (no cross-references at runtime)
//   - Return types documented in comments for TypeScript consumers
//   - Defensive coding: try/catch around cross-origin frames, null checks

// ---------------------------------------------------------------------------
// Shared constants used across multiple scripts
// ---------------------------------------------------------------------------

const ATTR = "data-jeriko-id";
const MAX_FRAME_DEPTH = 10;

// ---------------------------------------------------------------------------
// COLLECT_ELEMENTS_JS — indexes all interactive elements with data-jeriko-id
// ---------------------------------------------------------------------------
// Args: { startIndex: number, clickIdAttr: string }
// Returns: { elements: Array<{index, x, y, width, height, tag, inputType, description}>,
//            nextIndex: number, viewport: {width, height, devicePixelRatio} }

export const COLLECT_ELEMENTS_JS = `(args) => {
  const startIndex = args.startIndex || 1;
  const attr = args.clickIdAttr || '${ATTR}';
  const elements = [];
  let index = startIndex;
  const interactiveTags = new Set(['a','button','input','select','textarea','summary','option']);
  const interactiveRoles = new Set(['button','tab','link','checkbox','menuitem','menuitemcheckbox','menuitemradio','radio']);

  const normalize = (v, lim = 120) => {
    if (!v) return '';
    const t = v.replace(/\\s+/g,' ').trim();
    return t.length > lim ? t.slice(0,lim)+'...' : t;
  };

  const desc = (el, tag, text, inputType) => {
    const h = [];
    const id = normalize(el.id, 60);
    if (id) h.push('id:"'+id+'"');
    const aria = normalize(el.getAttribute('aria-label')||el.title||'', 80);
    if (aria) h.push('hint:"'+aria+'"');
    const ph = normalize(el.getAttribute('placeholder')||'', 80);
    if (ph) h.push('placeholder:"'+ph+'"');
    const role = normalize(el.getAttribute('role')||'', 40);
    if (role) h.push('role:"'+role+'"');
    if (inputType) h.push('type:"'+inputType+'"');
    const hText = h.length ? '{'+h.join(',')+'}' : '{}';
    return text ? tag+' '+hText+' '+text : tag+' '+hText;
  };

  const getText = (el, tag, inputType) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.value) return normalize(el.value);
      if (el.placeholder) return normalize(el.placeholder);
    }
    if (tag === 'select' && el instanceof HTMLSelectElement) {
      return Array.from(el.options).slice(0,5).map((o,i) => {
        const v = normalize(o.textContent||'');
        return v ? 'option#'+i+':'+v : null;
      }).filter(Boolean).join(', ');
    }
    const t = normalize(el.innerText || el.textContent || '');
    if (t) return t;
    if (inputType==='submit'||inputType==='button') return normalize(el.value||'submit');
    return '';
  };

  const isClickable = (el, tag) => {
    if (interactiveTags.has(tag)) return true;
    const roles = (el.getAttribute('role')||'').split(' ').map(r=>r.trim().toLowerCase());
    if (roles.some(r=>interactiveRoles.has(r))) return true;
    const ce = el.getAttribute('contenteditable');
    if (ce && ce.toLowerCase()!=='false') return true;
    return false;
  };

  const isVisible = (el, rect) => {
    if (!rect || rect.width<=1 || rect.height<=1) return false;
    const s = window.getComputedStyle(el);
    if (s.display==='none'||s.visibility==='hidden'||s.pointerEvents==='none') return false;
    const op = parseFloat(s.opacity||'1');
    if (!isNaN(op) && op<=0) return false;
    return true;
  };

  const seen = new Set();
  const traverse = (root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let n = w.nextNode();
    while (n) {
      if (n instanceof HTMLElement && !seen.has(n)) {
        seen.add(n);
        const tag = n.tagName.toLowerCase();
        if (isClickable(n, tag)) {
          const rect = n.getBoundingClientRect();
          if (isVisible(n, rect)) {
            const iType = tag==='input' ? (n.getAttribute('type')||'text').toLowerCase() : null;
            const text = getText(n, tag, iType);
            n.setAttribute(attr, String(index));
            elements.push({
              index, x:rect.x, y:rect.y, width:rect.width, height:rect.height,
              tag, inputType:iType, description:desc(n,tag,text,iType)
            });
            index++;
          }
        }
        if (n.shadowRoot) traverse(n.shadowRoot);
      }
      n = w.nextNode();
    }
  };
  traverse(document);

  return {
    elements,
    nextIndex: index,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    }
  };
}`;

// ---------------------------------------------------------------------------
// FIND_ELEMENT_JS — resolves data-jeriko-id to center coordinates
// ---------------------------------------------------------------------------
// Upgraded: recursively searches iframes and shadow roots (max depth 10).
// Cross-origin iframes are silently skipped (try/catch).
// Args: (index: number)
// Returns: { x: number, y: number, tag: string } | null

export const FIND_ELEMENT_JS = `(index) => {
  const attr = '${ATTR}';
  const target = String(index);
  const visited = new WeakSet();

  const searchRoot = (root, depth) => {
    if (!root || depth > ${MAX_FRAME_DEPTH}) return null;
    if (visited.has(root)) return null;
    visited.add(root);

    // Search direct elements in this root
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      if (node instanceof Element) {
        if (node.getAttribute(attr) === target) {
          const r = node.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, tag: node.tagName.toLowerCase() };
        }
        // Descend into shadow roots
        if (node.shadowRoot) {
          const found = searchRoot(node.shadowRoot, depth + 1);
          if (found) return found;
        }
      }
      node = walker.nextNode();
    }

    // Search iframes and frames recursively
    const frames = root.querySelectorAll ? root.querySelectorAll('iframe, frame') : [];
    for (const frame of frames) {
      try {
        const contentDoc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        if (!contentDoc) continue;
        const found = searchRoot(contentDoc, depth + 1);
        if (found) {
          // Translate coordinates: iframe's own bounding rect offsets the child coords
          const frameRect = frame.getBoundingClientRect();
          return {
            x: found.x + frameRect.x,
            y: found.y + frameRect.y,
            tag: found.tag
          };
        }
      } catch (e) {
        // Cross-origin iframe — silently skip
      }
    }

    return null;
  };

  return searchRoot(document, 0);
}`;

// ---------------------------------------------------------------------------
// EXTRACT_MARKDOWN_JS — converts DOM to LLM-friendly markdown
// ---------------------------------------------------------------------------
// Returns: string (markdown, max 15000 chars)

export const EXTRACT_MARKDOWN_JS = `(() => {
  const body = document.body;
  if (!body) return '';
  const walk = (node) => {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\\s+/g, ' ');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    const style = window.getComputedStyle(node);
    if (style.display==='none'||style.visibility==='hidden') return '';
    if (['script','style','noscript','svg','path'].includes(tag)) return '';
    let children = '';
    for (const c of node.childNodes) children += walk(c);
    children = children.trim();
    if (!children && !['img','br','hr','input'].includes(tag)) return '';
    switch (tag) {
      case 'h1': return '\\n# '+children+'\\n';
      case 'h2': return '\\n## '+children+'\\n';
      case 'h3': return '\\n### '+children+'\\n';
      case 'h4': return '\\n#### '+children+'\\n';
      case 'p': return '\\n'+children+'\\n';
      case 'br': return '\\n';
      case 'hr': return '\\n---\\n';
      case 'a': {
        const href = node.getAttribute('href')||'';
        return href && !href.startsWith('javascript:') ? '['+children+']('+href+')' : children;
      }
      case 'strong': case 'b': return '**'+children+'**';
      case 'em': case 'i': return '*'+children+'*';
      case 'code': return '\\x60'+children+'\\x60';
      case 'pre': return '\\n\\x60\\x60\\x60\\n'+children+'\\n\\x60\\x60\\x60\\n';
      case 'li': return '- '+children+'\\n';
      case 'ul': case 'ol': return '\\n'+children;
      case 'div': case 'section': case 'article': case 'main': return '\\n'+children+'\\n';
      default: return children;
    }
  };
  let md = walk(body);
  md = md.replace(/\\n{3,}/g, '\\n\\n').trim();
  return md.length > 15000 ? md.slice(0,15000)+'\\n...(truncated)' : md;
})()`;

// ---------------------------------------------------------------------------
// NESTED_SCROLL_JS — smart scrolling with container detection
// ---------------------------------------------------------------------------
// Finds the scrollable container at a target point (or the largest scrollable
// container on the page) and scrolls it. Supports directional scrolling and
// scroll-to-edge.
//
// Args: { direction: "up"|"down"|"left"|"right", amount: number,
//         targetPoint?: [number, number], toEdge?: boolean }
// Returns: { scrolled: boolean, targetDescription: string,
//            before: { x: number, y: number }, after: { x: number, y: number },
//            atBoundary: boolean, maxOffset: { x: number, y: number } }

export const NESTED_SCROLL_JS = `async (args) => {
  const { direction = 'down', amount = 3, targetPoint, toEdge = false } = args;
  const px = amount * 300;

  const isScrollable = (el) => {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const hasVertical = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
      && el.scrollHeight > el.clientHeight;
    const hasHorizontal = (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay')
      && el.scrollWidth > el.clientWidth;
    return hasVertical || hasHorizontal;
  };

  const findScrollableAt = (x, y) => {
    const elements = document.elementsFromPoint(x, y);
    for (const el of elements) {
      if (el === document.documentElement || el === document.body) continue;
      if (isScrollable(el)) return el;
    }
    return null;
  };

  const findLargestScrollable = () => {
    let best = null;
    let bestArea = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      if (node instanceof HTMLElement && isScrollable(node)) {
        const rect = node.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > bestArea) {
          bestArea = area;
          best = node;
        }
      }
      node = walker.nextNode();
    }
    return best;
  };

  const describeElement = (el) => {
    if (el === document.scrollingElement || el === document.documentElement || el === document.body) {
      return 'page';
    }
    const tag = el.tagName.toLowerCase();
    const id = el.id ? '#' + el.id : '';
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
      : '';
    return tag + id + cls;
  };

  // Determine scroll target
  let target;
  if (targetPoint && Array.isArray(targetPoint) && targetPoint.length === 2) {
    target = findScrollableAt(targetPoint[0], targetPoint[1]);
    if (!target) target = findLargestScrollable();
  }

  // Fall back to document scrolling element
  if (!target) {
    target = document.scrollingElement || document.documentElement;
  }

  const before = { x: target.scrollLeft, y: target.scrollTop };
  const maxOffset = {
    x: target.scrollWidth - target.clientWidth,
    y: target.scrollHeight - target.clientHeight
  };

  // Perform scroll
  if (toEdge) {
    switch (direction) {
      case 'up':    target.scrollTop = 0; break;
      case 'down':  target.scrollTop = maxOffset.y; break;
      case 'left':  target.scrollLeft = 0; break;
      case 'right': target.scrollLeft = maxOffset.x; break;
    }
  } else {
    switch (direction) {
      case 'up':    target.scrollBy(0, -px); break;
      case 'down':  target.scrollBy(0, px); break;
      case 'left':  target.scrollBy(-px, 0); break;
      case 'right': target.scrollBy(px, 0); break;
    }
  }

  // Wait for smooth scroll to settle
  await new Promise(r => setTimeout(r, 100));

  const after = { x: target.scrollLeft, y: target.scrollTop };
  const scrolled = before.x !== after.x || before.y !== after.y;

  // Detect if we're at a boundary
  let atBoundary = false;
  switch (direction) {
    case 'up':    atBoundary = after.y <= 0; break;
    case 'down':  atBoundary = after.y >= maxOffset.y - 1; break;
    case 'left':  atBoundary = after.x <= 0; break;
    case 'right': atBoundary = after.x >= maxOffset.x - 1; break;
  }

  return {
    scrolled,
    targetDescription: describeElement(target),
    before,
    after,
    atBoundary,
    maxOffset
  };
}`;

// ---------------------------------------------------------------------------
// SELECT_OPTION_JS — selects an option in a <select> element
// ---------------------------------------------------------------------------
// Finds the element by data-jeriko-id, selects the option by index,
// and dispatches change/input events for framework compatibility.
//
// Args: { elementIndex: number, optionIndex: number }
// Returns: { success: boolean, selectedValue?: string, selectedText?: string,
//            availableOptions?: Array<{index, value, text}>, error?: string }

export const SELECT_OPTION_JS = `(args) => {
  const { elementIndex, optionIndex } = args;
  const attr = '${ATTR}';
  const target = String(elementIndex);

  // Find the element
  const el = document.querySelector('[' + attr + '="' + target + '"]');
  if (!el) {
    return { success: false, error: 'Element [' + elementIndex + '] not found' };
  }

  // Must be a <select> element
  if (el.tagName.toLowerCase() !== 'select') {
    return { success: false, error: 'Element [' + elementIndex + '] is not a <select> (found: ' + el.tagName.toLowerCase() + ')' };
  }

  const select = el;
  const options = Array.from(select.options);

  // List available options for the response
  const availableOptions = options.map((opt, i) => ({
    index: i,
    value: opt.value,
    text: (opt.textContent || '').trim()
  }));

  // Validate option index
  if (optionIndex < 0 || optionIndex >= options.length) {
    return {
      success: false,
      error: 'Option index ' + optionIndex + ' out of range (0-' + (options.length - 1) + ')',
      availableOptions
    };
  }

  // Select the option
  select.selectedIndex = optionIndex;
  const selected = options[optionIndex];

  // Dispatch events for framework compatibility (React, Vue, Angular, etc.)
  const inputEvent = new Event('input', { bubbles: true, cancelable: true });
  const changeEvent = new Event('change', { bubbles: true, cancelable: true });
  select.dispatchEvent(inputEvent);
  select.dispatchEvent(changeEvent);

  return {
    success: true,
    selectedValue: selected.value,
    selectedText: (selected.textContent || '').trim(),
    availableOptions
  };
}`;

// ---------------------------------------------------------------------------
// SCROLL_STATUS_JS — reports page-level scroll capacity
// ---------------------------------------------------------------------------
// Returns: { canScrollX: boolean, canScrollY: boolean,
//            scrollTop: number, scrollLeft: number,
//            scrollHeight: number, scrollWidth: number,
//            clientHeight: number, clientWidth: number }

export const SCROLL_STATUS_JS = `(() => {
  const el = document.scrollingElement || document.documentElement;
  return {
    canScrollX: el.scrollWidth > el.clientWidth,
    canScrollY: el.scrollHeight > el.clientHeight,
    scrollTop: el.scrollTop,
    scrollLeft: el.scrollLeft,
    scrollHeight: el.scrollHeight,
    scrollWidth: el.scrollWidth,
    clientHeight: el.clientHeight,
    clientWidth: el.clientWidth
  };
})()`;

// ---------------------------------------------------------------------------
// CAPTCHA_DETECTION_JS — detects 17 types of CAPTCHA and anti-bot challenges
// ---------------------------------------------------------------------------
// Self-contained IIFE that inspects the DOM for known CAPTCHA indicators.
// Returns: { detected: boolean, type: string, confidence: number,
//            indicators: string[], url: string, timestamp: string }

export const CAPTCHA_DETECTION_JS = `(() => {
  const result = {
    detected: false,
    type: 'none',
    confidence: 0,
    indicators: [],
    url: window.location.href,
    timestamp: new Date().toISOString()
  };

  const addIndicator = (text) => {
    result.indicators.push(text);
  };

  const setDetected = (type, confidence) => {
    if (confidence > result.confidence) {
      result.detected = true;
      result.type = type;
      result.confidence = confidence;
    } else if (confidence === result.confidence && result.detected) {
      result.indicators.push('(same confidence: ' + type + ')');
    }
  };

  // Visibility check — only detect CAPTCHAs that are actually blocking the user
  const isElementVisible = (el, minSize) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    if (parseFloat(style.opacity) === 0) return false;
    if (minSize > 0 && rect.width < minSize && rect.height < minSize) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
    if (rect.right < 0 || rect.left > window.innerWidth) return false;
    return true;
  };

  // Blocking overlay detection — high z-index fixed element covering most of viewport
  const hasBlockingOverlay = () => {
    const allFixed = document.querySelectorAll('*');
    for (const el of allFixed) {
      const style = window.getComputedStyle(el);
      const zIndex = parseInt(style.zIndex);
      if (zIndex > 1000 && style.position === 'fixed') {
        const rect = el.getBoundingClientRect();
        if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.8) {
          if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(style.opacity) < 1) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const bodyText = (document.body && document.body.innerText) || '';
  const bodyHTML = (document.body && document.body.innerHTML) || '';
  const bodyTextLower = bodyText.toLowerCase();
  const title = document.title || '';
  const url = window.location.href;

  // --- 1. Cloudflare Challenge ---
  if (title.toLowerCase().includes('just a moment')) {
    if (bodyTextLower.includes('verify you are human') ||
        bodyTextLower.includes('checking your browser') ||
        (bodyTextLower.includes('cloudflare') && bodyText.length < 1000)) {
      addIndicator('cloudflare: title + verification text');
      setDetected('cloudflare_challenge', 95);
    }
  }
  if (title.includes('Attention Required')) {
    addIndicator('cloudflare: attention required');
    setDetected('cloudflare_challenge', 95);
  }
  const cfChallengeSelectors = ['#challenge-form', '#cf-challenge-running', '.cf-browser-verification'];
  for (const sel of cfChallengeSelectors) {
    const el = document.querySelector(sel);
    if (el && isElementVisible(el, 0)) {
      addIndicator('cloudflare: challenge element ' + sel);
      setDetected('cloudflare_challenge', 90);
      break;
    }
  }
  if (bodyHTML.includes('cdn-cgi/challenge-platform') || bodyHTML.includes('cf-challenge')) {
    addIndicator('cloudflare: challenge platform script');
    setDetected('cloudflare_challenge', 90);
  }

  // --- 2. Cloudflare Block ---
  if ((bodyTextLower.includes('you have been blocked') || bodyTextLower.includes('access denied')) &&
      bodyTextLower.includes('cloudflare') && bodyText.includes('Ray ID')) {
    addIndicator('cloudflare: block page with Ray ID');
    setDetected('cloudflare_block', 95);
  }
  if (document.querySelector('.cf-error-details, #cf-error-details')) {
    addIndicator('cloudflare: error details element');
    setDetected('cloudflare_block', 85);
  }

  // --- 3. Cloudflare Turnstile ---
  const turnstileEl = document.querySelector('.cf-turnstile[data-sitekey]');
  if (turnstileEl && isElementVisible(turnstileEl, 100)) {
    const iframe = turnstileEl.querySelector('iframe');
    if (iframe && isElementVisible(iframe, 100)) {
      addIndicator('cloudflare: turnstile widget with visible iframe');
      setDetected('cloudflare_turnstile', 85);
    }
  }
  // Also check for standalone turnstile iframe
  const turnstileIframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
  if (turnstileIframe && isElementVisible(turnstileIframe, 50)) {
    addIndicator('cloudflare: turnstile iframe');
    setDetected('cloudflare_turnstile', 85);
  }

  // --- 4. reCAPTCHA v2 ---
  const recaptchaCheckbox = document.querySelector('.recaptcha-checkbox, .recaptcha-checkbox-border');
  if (recaptchaCheckbox && isElementVisible(recaptchaCheckbox, 20)) {
    addIndicator('recaptcha: v2 checkbox visible');
    setDetected('recaptcha_v2', 90);
  }
  if (!result.detected || result.type !== 'recaptcha_v2') {
    const recaptchaIframes = document.querySelectorAll('iframe[src*="recaptcha"]');
    for (const iframe of recaptchaIframes) {
      if (!isElementVisible(iframe, 0)) continue;
      const rect = iframe.getBoundingClientRect();
      const src = (iframe.src || '').toLowerCase();
      if (src.includes('/anchor') && rect.width > 250 && rect.height > 60) {
        addIndicator('recaptcha: v2 anchor iframe (' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ')');
        setDetected('recaptcha_v2', 85);
        break;
      }
      if (src.includes('/bframe') && rect.width > 350 && rect.height > 400) {
        addIndicator('recaptcha: v2 challenge iframe (' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ')');
        setDetected('recaptcha_v2', 90);
        break;
      }
      if (rect.width < 300 && rect.height < 100) continue;
    }
  }
  if (document.querySelector('.g-recaptcha, #recaptcha')) {
    addIndicator('recaptcha: v2 widget');
    setDetected('recaptcha_v2', 90);
  }
  if (document.querySelector('iframe[title="reCAPTCHA"]')) {
    addIndicator('recaptcha: iframe title match');
    setDetected('recaptcha_v2', 85);
  }

  // --- 5. reCAPTCHA v3 ---
  if (document.querySelector('script[src*="recaptcha/api.js?render="], script[src*="recaptcha/enterprise.js"]')) {
    const hasV2Widget = document.querySelector('.g-recaptcha, iframe[src*="recaptcha/api2"]');
    if (!hasV2Widget) {
      addIndicator('recaptcha: v3 script (invisible)');
      setDetected('recaptcha_v3', 70);
    }
  }

  // --- 6. hCaptcha ---
  const hcaptchaSelectors = ['.h-captcha[data-sitekey]', '#hcaptcha'];
  for (const sel of hcaptchaSelectors) {
    const el = document.querySelector(sel);
    if (el && isElementVisible(el, 100)) {
      const iframe = el.querySelector('iframe');
      if (iframe && isElementVisible(iframe, 100)) {
        addIndicator('hcaptcha: visible widget with iframe');
        setDetected('hcaptcha', 85);
        break;
      }
    }
  }
  if (document.querySelector('.h-captcha, iframe[src*="hcaptcha.com"]')) {
    addIndicator('hcaptcha: widget detected');
    setDetected('hcaptcha', 80);
  }

  // --- 7. FunCaptcha (Arkose Labs) ---
  const funcaptchaSelectors = ['#EnforcementChallenge', 'iframe[src*="arkoselabs.com"]', 'iframe[src*="funcaptcha.com"]'];
  for (const sel of funcaptchaSelectors) {
    const el = document.querySelector(sel);
    if (el && isElementVisible(el, 200)) {
      addIndicator('funcaptcha: visible challenge ' + sel);
      setDetected('funcaptcha', 85);
      break;
    }
  }
  if (bodyHTML.includes('arkoselabs.com') || bodyHTML.includes('funcaptcha')) {
    addIndicator('funcaptcha: script reference');
    setDetected('funcaptcha', 75);
  }

  // --- 8. AWS WAF ---
  if (document.title.includes('Human Verification')) {
    if (bodyTextLower.includes('confirm you are human') || bodyTextLower.includes('amazon')) {
      addIndicator('aws_waf: human verification title');
      setDetected('aws_waf', 90);
    }
  }
  const awsSelectors = ['#captcha-container', '.amzn-captcha-lang-selector'];
  for (const sel of awsSelectors) {
    const el = document.querySelector(sel);
    if (el && isElementVisible(el, 0)) {
      addIndicator('aws_waf: visible captcha container');
      setDetected('aws_waf', 85);
      break;
    }
  }

  // --- 9. Geetest ---
  const geetestSelectors = ['.geetest_holder', '.geetest_widget', '.geetest_radar_tip', '.gt_slider'];
  for (const sel of geetestSelectors) {
    const el = document.querySelector(sel);
    if (el && isElementVisible(el, 100)) {
      addIndicator('geetest: visible widget ' + sel);
      setDetected('geetest', 80);
      break;
    }
  }

  // --- 10. DataDome ---
  const ddCaptcha = document.querySelector('.dd-captcha');
  if (ddCaptcha && isElementVisible(ddCaptcha, 100)) {
    addIndicator('datadome: visible captcha element');
    setDetected('datadome', 85);
  }
  if (bodyTextLower.includes('datadome') && (bodyTextLower.includes('blocked') || bodyTextLower.includes('verify')) && bodyText.length < 2000) {
    addIndicator('datadome: block page text');
    setDetected('datadome', 80);
  }

  // --- 11. Sucuri / CloudProxy ---
  if (bodyTextLower.includes('sucuri') && (bodyTextLower.includes('website firewall') || bodyTextLower.includes('access denied'))) {
    addIndicator('sucuri: firewall block page');
    setDetected('sucuri', 90);
  }

  // --- 12. PerimeterX / HUMAN ---
  if (document.querySelector('#px-captcha, .px-captcha')) {
    addIndicator('perimeterx: captcha element');
    setDetected('perimeterx', 90);
  }
  if (bodyHTML.includes('perimeterx.net') || bodyHTML.includes('human.com/captcha')) {
    addIndicator('perimeterx: script reference');
    setDetected('perimeterx', 75);
  }

  // --- 13. Imperva / Incapsula ---
  if (bodyHTML.includes('_Incapsula_') || bodyHTML.includes('incapsula.com')) {
    addIndicator('imperva: incapsula reference');
    setDetected('imperva', 80);
  }

  // --- 14. Kasada ---
  if (bodyHTML.includes('kasada.io') || bodyHTML.includes('_kpsdk_')) {
    addIndicator('kasada: script reference');
    setDetected('kasada', 80);
  }

  // --- 15. Generic Access Blocks ---
  if ((bodyTextLower.includes('access blocked') || bodyTextLower.includes('access denied')) && bodyText.length < 1500) {
    if (!result.detected) {
      addIndicator('access_block: denied/blocked on short page');
      setDetected('access_block', 85);
    }
  }
  if ((document.title.includes('403') || document.title.includes('Forbidden')) && bodyText.length < 2000) {
    if (!result.detected) {
      addIndicator('access_block: 403 forbidden page');
      setDetected('access_block', 85);
    }
  }

  // --- 16. Reddit Security Block ---
  if (url.includes('reddit.com')) {
    const blockDiv = document.querySelector('div.font-bold.text-24');
    const loginLink = document.querySelector('a[href="https://www.reddit.com/login/"]');
    if (blockDiv && loginLink) {
      addIndicator('reddit: security block structure');
      setDetected('reddit_block', 95);
    }
    if (bodyTextLower.includes('whoa there, pardner') || bodyTextLower.includes("we've been having trouble")) {
      addIndicator('reddit: security block text');
      setDetected('reddit_block', 85);
    }
  }

  // --- 17. Device Verification ---
  if ((bodyTextLower.includes('unusual activity') || bodyTextLower.includes('automated requests')) &&
      (bodyTextLower.includes('verify') || bodyTextLower.includes('device')) && bodyText.length < 2000) {
    addIndicator('device_verification: unusual activity prompt');
    setDetected('device_verification', 85);
  }
  if (bodyTextLower.includes('verify you are human') || bodyTextLower.includes('verify your device')) {
    if (!result.detected) {
      addIndicator('device_verification: verify prompt');
      setDetected('device_verification', 65);
    }
  }

  // --- Overlay boost — if captcha detected + blocking overlay, increase confidence ---
  if (result.detected && result.confidence >= 70 && hasBlockingOverlay()) {
    result.confidence = Math.min(result.confidence + 5, 100);
    addIndicator('overlay: blocking overlay detected');
  }

  // --- Explicit captcha text on short pages ---
  if (!result.detected && bodyText.length < 3000) {
    if (bodyTextLower.includes('please complete the captcha') ||
        bodyTextLower.includes('solve the captcha') ||
        bodyTextLower.includes('verify you are not a robot')) {
      addIndicator('generic: explicit captcha text');
      setDetected('captcha_page', 80);
    }
  }

  return result;
})()`;
