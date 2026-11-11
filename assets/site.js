/* Rendered Imagination — IWAIT 2027 online exhibition.
 * 이 파일은 고칠 필요가 없어요. 내용은 settings.txt 와 works/ 폴더에서 바꿔요.
 * No build step: pages read settings.txt and works/NN.txt and draw themselves. */
(function () {
  'use strict';

  /* ---------- reading the text files ---------- */

  function load(path) {
    // ?v= stops the browser from showing an old copy right after an edit
    return fetch(path + '?v=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' (' + r.status + ')');
      return r.text();
    });
  }

  // "name: value" lines (a name with an empty value may be followed by "- item" lines),
  // then a line "---", then the body text. Lines starting with "# " are notes.
  function parseDoc(text) {
    var lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
    var fields = {}, i = 0, lastKey = null;
    for (; i < lines.length; i++) {
      var line = lines[i];
      if (/^\s*-{3,}\s*$/.test(line)) { i++; break; }
      if (/^\s*#/.test(line) || !line.trim()) continue;
      var item = line.match(/^\s*[-*•]\s+(.*)$/);
      if (item && lastKey) {
        if (!Array.isArray(fields[lastKey])) fields[lastKey] = fields[lastKey] ? list(fields[lastKey]) : [];
        fields[lastKey].push(item[1].trim());
        continue;
      }
      var m = line.match(/^\s*([A-Za-z0-9_]+)\s*[:：]\s?(.*)$/);
      if (m) { lastKey = m[1].toLowerCase(); fields[lastKey] = m[2].trim(); }
    }
    var body = lines.slice(i).filter(function (l) { return !/^#(\s|$)/.test(l); }).join('\n').trim();
    return { fields: fields, body: body };
  }

  function list(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    return (v || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  // "file.jpg | Title" → { file, title }
  function imageEntries(v) {
    return list(v).map(function (s) {
      var p = s.split('|');
      return { file: p[0].trim(), title: p.slice(1).join('|').trim() };
    }).filter(function (e) { return e.file; });
  }

  /* ---------- tiny Markdown: ## headings, paragraphs, - lists, **bold**, *italic*, [links](url) ---------- */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function inline(s) {
    s = esc(s);
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|[^\s)]+)\)/g, function (_, t, u) {
      var ext = /^https?:/.test(u);
      return '<a href="' + u + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + t + '</a>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    return s;
  }
  function markdown(src) {
    var out = [], para = [], items = [];
    function flush() {
      if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; }
      if (items.length) { out.push('<ul>' + items.map(function (t) { return '<li>' + inline(t) + '</li>'; }).join('') + '</ul>'); items = []; }
    }
    (src || '').split('\n').forEach(function (line) {
      var h = line.match(/^(#{2,3})\s+(.*)$/), li = line.match(/^\s*[-*]\s+(.*)$/);
      if (h) { flush(); out.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>'); }
      else if (li) { if (para.length) flush(); items.push(li[1]); }
      else if (!line.trim()) flush();
      else { if (items.length) flush(); para.push(line.trim()); }
    });
    flush();
    return out.join('\n');
  }
  // split a body into { "heading": "markdown" } by ## headings
  function sections(body) {
    var map = {}, cur = '';
    (body || '').split('\n').forEach(function (line) {
      var h = line.match(/^##\s+(.*)$/);
      if (h) { cur = h[1].trim().toLowerCase(); map[cur] = ''; }
      else map[cur] = (map[cur] || '') + line + '\n';
    });
    return map;
  }
  function section(map, words) {
    for (var k in map) for (var i = 0; i < words.length; i++) if (k.indexOf(words[i]) !== -1) return map[k];
    return '';
  }

  /* ---------- small DOM helpers ---------- */

  function $(sel) { return document.querySelector(sel); }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function text(id, value) { var n = document.getElementById(id); if (n) n.textContent = value || ''; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function placeholder(label, num) {
    return el('div', { class: 'ph', 'aria-hidden': 'true' }, [el('span', { text: num || '' }), el('span', { text: label })]);
  }
  // an <img> that turns into a placeholder box if the file is missing
  function image(src, alt, label, num, eager) {
    if (!src) return placeholder(label, num);
    var img = el('img', { src: src, alt: alt || '', loading: eager ? 'eager' : 'lazy', decoding: 'async' });
    img.addEventListener('error', function () {
      console.warn('Image not found: ' + src + ' — check the file name (upper/lower case matters).');
      img.replaceWith(placeholder(label, num));
    });
    return img;
  }

  /* ---------- category, video ---------- */

  function catKey(c) {
    c = (c || '').toLowerCase();
    if (c.indexOf('interactive') !== -1 || c.indexOf('immersive') !== -1) return 'interactive';
    if (c.indexOf('video') !== -1 || c.indexOf('moving') !== -1) return 'video';
    if (c.indexOf('image') !== -1) return 'image';
    return 'other';
  }
  function videoEmbed(url) {
    if (!url) return null;
    var m;
    if ((m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/))) {
      return 'https://www.youtube-nocookie.com/embed/' + m[1] + '?rel=0';
    }
    if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/(\w+))?/))) {
      var h = (m[2] && m[2] !== 'video') ? m[2] : ((url.match(/[?&]h=(\w+)/) || [])[1]);
      return 'https://player.vimeo.com/video/' + m[1] + '?dnt=1' + (h ? '&h=' + h : '');
    }
    return null;
  }
  // the image a work shows on its card
  function cardImage(w) {
    var f = w.fields;
    return f.thumbnail || f.main_image || (catKey(f.category) === 'image' ? (imageEntries(f.images)[0] || {}).file : '') || '';
  }

  /* ---------- the halftone pattern: flowing waves, ripples under the pointer ---------- */

  function pattern(canvas, accent, seed) {
    var S = 16, COLS = 34, ROWS = 26, W = S * COLS, H = S * ROWS;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var hex = (accent || '#FF5A36').replace('#', '');
    if (hex.length === 3) hex = hex.replace(/./g, '$&$&');
    var n = parseInt(hex, 16); if (isNaN(n)) n = 0xFF5A36;
    var A = 'rgb(' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',') + ')';
    var G0 = [14, 15, 19], G1 = [242, 241, 236];
    var ph = seed * 0.73;
    var ax = W * (0.12 + 0.1 * Math.sin(seed)), ay = H * 1.1;
    var bx = W * (0.9 - 0.08 * Math.cos(seed * 1.3)), by = -H * 0.2;

    var pointer = { x: 0, y: 0, on: 0, target: 0 };
    var ripples = [];

    function frame(t) {
      ctx.fillStyle = '#0E0F12';
      ctx.fillRect(0, 0, W, H);
      pointer.on += (pointer.target - pointer.on) * 0.08;
      ripples = ripples.filter(function (r) { return t - r.t0 < 2.6; });
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var x = (c + 0.5) * S, y = (r + 0.5) * S;
          var d1 = Math.hypot(x - ax, y - ay), d2 = Math.hypot(x - bx, y - by);
          var v = 0.5 + 0.25 * Math.sin(d1 / 22 + ph - t * 0.55) + 0.25 * Math.sin(d2 / 30 - ph * 1.7 + t * 0.35);
          v *= 0.25 + 0.75 * Math.pow(x / W, 0.8);
          if (pointer.on > 0.01) {
            var dp = Math.hypot(x - pointer.x, y - pointer.y);
            v += pointer.on * 0.45 * Math.sin(dp / 14 - t * 4) * Math.exp(-dp / 120) + pointer.on * 0.25 * Math.exp(-dp / 70);
          }
          for (var k = 0; k < ripples.length; k++) {
            var rp = ripples[k], age = t - rp.t0, rad = age * 260;
            var dr = Math.hypot(x - rp.x, y - rp.y) - rad;
            v += 0.7 * Math.exp(-(dr * dr) / 900) * Math.exp(-age * 1.3);
          }
          v = Math.max(0, Math.min(1, v));
          var size = S * (0.1 + 0.8 * Math.pow(v, 1.3));
          if (v > 0.8) ctx.fillStyle = A;
          else {
            var q = 0.22 + 0.78 * Math.min(1, v / 0.8);
            ctx.fillStyle = 'rgb(' + Math.round(G0[0] + (G1[0] - G0[0]) * q) + ',' + Math.round(G0[1] + (G1[1] - G0[1]) * q) + ',' + Math.round(G0[2] + (G1[2] - G0[2]) * q) + ')';
          }
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
        }
      }
    }

    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) { frame(0); return; }

    function local(e) {
      var b = canvas.getBoundingClientRect();
      return { x: (e.clientX - b.left) / b.width * W, y: (e.clientY - b.top) / b.height * H };
    }
    var clock = 0, last = null;
    canvas.addEventListener('pointermove', function (e) { var p = local(e); pointer.x = p.x; pointer.y = p.y; pointer.target = 1; });
    canvas.addEventListener('pointerleave', function () { pointer.target = 0; });
    canvas.addEventListener('pointercancel', function () { pointer.target = 0; });
    canvas.addEventListener('pointerdown', function (e) {
      var p = local(e); pointer.x = p.x; pointer.y = p.y; pointer.target = 1;
      ripples.push({ x: p.x, y: p.y, t0: clock });
      if (ripples.length > 6) ripples.shift();
    });

    // run only while visible on screen and the tab is in front
    var visible = true, raf = 0;
    function tick(now) {
      if (last != null) clock += Math.min(0.05, (now - last) / 1000);
      last = now;
      frame(clock);
      raf = requestAnimationFrame(tick);
    }
    function sync() {
      var run = visible && !document.hidden;
      if (run && !raf) { last = null; raf = requestAnimationFrame(tick); }
      if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; sync(); }).observe(canvas);
    }
    document.addEventListener('visibilitychange', sync);
    frame(0);
    sync();
  }

  /* ---------- image-series carousel ---------- */

  function carousel(root, entries, dir, workTitle) {
    var total = entries.length, cur = 0;
    var stage = el('div', { class: 'frame stage', tabindex: '0', role: 'region', 'aria-roledescription': 'carousel', 'aria-label': (workTitle || 'Image series') + ' — use left and right arrow keys' });
    var slot = el('div', { class: 'slot', 'aria-live': 'polite' });
    var prev = el('button', { type: 'button', class: 'nav-btn prev', 'aria-label': 'Previous image' });
    var next = el('button', { type: 'button', class: 'nav-btn next', 'aria-label': 'Next image' });
    prev.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
    next.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
    stage.append(slot, prev, next);
    var counter = el('span', { class: 'series-count' }), title = el('span', { class: 'series-title' });
    var bar = el('div', { class: 'series-bar' }, [counter, title]);
    var thumbs = el('div', { class: 'thumbs', role: 'group', 'aria-label': 'All images in the series' });
    var buttons = entries.map(function (e, i) {
      var b = el('button', { type: 'button', 'aria-label': 'Image ' + (i + 1) + (e.title ? ': ' + e.title : '') });
      b.appendChild(image(dir + e.file, '', '', pad(i + 1)));
      b.addEventListener('click', function () { show(i); });
      thumbs.appendChild(b);
      return b;
    });
    root.innerHTML = '';
    root.append(stage, bar, thumbs);

    function show(i) {
      cur = (i + total) % total;
      var e = entries[cur];
      slot.innerHTML = '';
      slot.appendChild(image(dir + e.file, e.title || ((workTitle || 'Image') + ' ' + (cur + 1)), 'Image coming soon', pad(cur + 1), true));
      counter.textContent = pad(cur + 1) + ' / ' + pad(total);
      title.textContent = e.title || '';
      buttons.forEach(function (b, k) { b.setAttribute('aria-current', k === cur ? 'true' : 'false'); });
      var tb = buttons[cur];
      thumbs.scrollTo({ left: tb.offsetLeft - (thumbs.clientWidth - tb.offsetWidth) / 2, behavior: 'smooth' });
      [cur + 1, cur - 1].forEach(function (k) { var x = entries[(k + total) % total]; if (x) new Image().src = dir + x.file; });
    }
    prev.addEventListener('click', function () { show(cur - 1); });
    next.addEventListener('click', function () { show(cur + 1); });
    if (total < 2) { prev.hidden = next.hidden = true; thumbs.hidden = true; }

    document.addEventListener('keydown', function (e) {
      var t = e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowLeft') { show(cur - 1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { show(cur + 1); e.preventDefault(); }
    });
    var sx = null, sy = null;
    stage.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; });
    stage.addEventListener('pointerup', function (e) {
      if (sx == null) return;
      var dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(cur + (dx < 0 ? 1 : -1));
    });
    show(0);
  }

  /* ---------- shared header / footer ---------- */

  function applySettings(s) {
    if (s.accent_color) document.documentElement.style.setProperty('--accent', s.accent_color);
    text('brand-conf', s.conference_name);
    text('brand-title', s.title);
    var ext = document.getElementById('nav-conf');
    if (ext) {
      if (s.conference_url) { ext.href = s.conference_url; ext.textContent = (s.conference_name || 'Conference') + ' ↗'; }
      else ext.remove();
    }
    var groups = $('#logo-groups');
    if (groups) {
      groups.innerHTML = '';
      [['Organized by', s.organized_by], ['Co-organized by', s.co_organized_by]].forEach(function (g) {
        var entries = (Array.isArray(g[1]) ? g[1].join(',') : (g[1] || '')).match(/[^,()]+(\([^)]*\))?/g) || [];
        var logos = el('div', { class: 'logos' });
        entries.forEach(function (raw) {
          var m = raw.trim().match(/^(.*?)\s*(?:\(([^)]*)\))?$/);
          if (!m || !m[1]) return;
          var name = m[1].trim(), file = (m[2] || '').trim();
          var onLight = (s.logo_background || 'white').toLowerCase() !== 'none';
          var box = el('div', { class: 'logo' + (onLight ? ' on-light' : '') });
          var showName = function () { box.className = 'logo missing'; box.textContent = name; };
          if (file) {
            var img = el('img', { src: 'images/logos/' + file, alt: name });
            img.addEventListener('error', showName);
            box.appendChild(img);
          } else showName();
          logos.appendChild(box);
        });
        if (logos.children.length) groups.appendChild(el('div', { class: 'logo-group' }, [el('span', { class: 'eyebrow', text: g[0] }), logos]));
      });
    }
    text('foot-line', [s.conference_name, s.conference_full_name, s.conference_dates].filter(Boolean).join(' · '));
  }

  function loadWorks(ids) {
    return Promise.all(ids.map(function (id) {
      return load('works/' + id + '.txt').then(function (t) {
        var d = parseDoc(t); d.id = id; return d;
      }).catch(function (e) { console.warn('Could not read works/' + id + '.txt —', e.message); return null; });
    })).then(function (all) { return all.filter(Boolean); });
  }

  function fail(where, e) {
    console.error(e);
    var n = $(where);
    if (n) n.innerHTML = '<p class="notice wrap">The page could not load its content. If you opened this file directly from your computer, open the published site address instead.<br><span class="fine">' + esc(e.message) + '</span></p>';
  }

  /* ---------- home page ---------- */

  function home() {
    load('settings.txt').then(function (t) {
      var doc = parseDoc(t), s = doc.fields;
      applySettings(s);
      document.title = (s.title || 'Exhibition') + ' — ' + (s.conference_name || '');
      text('hero-tag', s.label); text('hero-sub', s.subtitle); text('hero-intro', s.intro);
      var h1 = $('#hero-title'), words = (s.title || '').split(' ');
      h1.textContent = '';
      if (words.length === 2) { h1.append(words[0], el('br'), words[1]); } else h1.textContent = s.title || '';
      text('f-exhibit', s.exhibition_dates); text('f-session', s.session_date); text('f-venue', [s.venue, s.venue_detail && s.venue_detail.split(',')[0]].filter(Boolean).join(', '));
      text('s-date', s.session_date_long); text('s-time', s.session_time); text('s-venue', s.venue); text('s-venue2', s.venue_detail);
      var secs = sections(doc.body);
      $('#about-body').innerHTML = markdown(section(secs, ['about']));
      $('#presentation-body').innerHTML = markdown(section(secs, ['presentation', 'live', 'session']));
      pattern($('#pattern'), s.accent_color, parseFloat(s.pattern_seed) || 7);

      return loadWorks(list(s.works)).then(function (works) { renderGrid(works, s); });
    }).catch(function (e) { fail('main', e); });
  }

  function renderGrid(works, s) {
    var grid = $('#grid'), buttons = document.querySelectorAll('.filters button');
    function draw(filter) {
      grid.innerHTML = '';
      var shown = works.filter(function (w) { return filter === 'all' || catKey(w.fields.category) === filter; });
      shown.forEach(function (w) {
        var f = w.fields, src = cardImage(w);
        grid.appendChild(el('a', { class: 'card', href: 'work.html?id=' + encodeURIComponent(w.id) }, [
          el('div', { class: 'thumb' }, [image(src ? 'works/' + w.id + '/' + src : '', '', 'Image coming soon', w.id)]),
          el('div', { class: 'card-meta' }, [
            el('span', { class: 'card-cat', text: f.category }),
            el('span', { class: 'card-title', text: f.title || 'Untitled' }),
            el('span', { class: 'card-artist', text: f.artist })
          ])
        ]));
      });
      if (filter === 'all') grid.appendChild(el('a', { class: 'live-card', href: '#presentation' }, [
        el('span', { class: 'eyebrow', text: 'Conference presentation' }),
        el('strong', { text: 'Meet the creators at ' + (s.conference_name || 'the conference') }),
        el('span', { text: [s.session_date, s.venue].filter(Boolean).join(' · ') + ' →' })
      ]));
      if (!shown.length) grid.appendChild(el('p', { class: 'empty', text: 'No works in this category.' }));
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.filter === filter)); });
    }
    buttons.forEach(function (b) { b.addEventListener('click', function () { draw(b.dataset.filter); }); });
    // hide filters for categories nobody uses
    buttons.forEach(function (b) {
      if (b.dataset.filter !== 'all' && !works.some(function (w) { return catKey(w.fields.category) === b.dataset.filter; })) b.hidden = true;
    });
    draw('all');
  }

  /* ---------- work page ---------- */

  function work() {
    var id = (new URLSearchParams(location.search).get('id') || '').replace(/[^\w-]/g, '');
    load('settings.txt').then(function (t) {
      var s = parseDoc(t).fields, order = list(s.works);
      applySettings(s);
      if (!id) id = order[0];
      return load('works/' + id + '.txt').then(function (wt) {
        var w = parseDoc(wt), f = w.fields, dir = 'works/' + id + '/';
        var pos = order.indexOf(id), isSeries = catKey(f.category) === 'image';
        document.title = (f.title || 'Work') + ' — ' + (f.artist ? f.artist + ' — ' : '') + (s.title || '');

        text('w-num', (pos >= 0 ? pad(pos + 1) : id) + ' / ' + pad(order.length));
        text('w-cat', f.category); text('w-year', f.year);
        if (!f.year) $('#w-year').remove();
        text('w-title', f.title); text('w-artist', f.artist); text('w-aff', f.affiliation);

        var media = $('#w-media'), entries = imageEntries(f.images), embed = videoEmbed(f.video);
        if (isSeries && entries.length) {
          media.classList.add('series');
          carousel(media, entries, dir, f.title);
        } else {
          var frame = el('div', { class: 'frame' });
          if (embed) frame.appendChild(el('iframe', { src: embed, title: (f.title || 'Work') + ' — video', allow: 'autoplay; fullscreen; picture-in-picture', loading: 'lazy' }));
          else frame.appendChild(image(f.main_image ? dir + f.main_image : '', f.title, 'Main image coming soon', '', true));
          media.innerHTML = ''; media.appendChild(frame);
        }

        $('#w-text').innerHTML = markdown(w.body);

        text('d-cat', f.category); text('d-format', f.format);
        if (!f.format) $('#d-format').parentNode.remove();
        var chips = $('#d-tech'); chips.innerHTML = '';
        list(f.technologies).forEach(function (t) { chips.appendChild(el('span', { text: t })); });
        if (!chips.children.length) chips.parentNode.remove();
        text('d-live1', s.session_date_long ? s.session_date_long + ' · ' + (s.session_time || '') : s.session_date);
        text('d-live2', [s.venue, s.venue_detail].filter(Boolean).join(', '));
        var pdf = $('#d-pdf');
        if (f.abstract_pdf) pdf.href = dir + f.abstract_pdf; else pdf.remove();

        // "More images" — for video and interactive works only; a series shows everything in its carousel
        var gal = $('#gallery-grid'); gal.innerHTML = '';
        if (!isSeries) entries.forEach(function (e, i) {
          var a = el('a', { href: dir + e.file, target: '_blank', rel: 'noopener', 'aria-label': (e.title || 'Image ' + (i + 1)) + ' (opens full size)' });
          a.appendChild(image(dir + e.file, e.title || (f.title || '') + ' — image ' + (i + 1), 'Image coming soon', pad(i + 1)));
          gal.appendChild(a);
        });
        if (!gal.children.length) $('#gallery').remove();

        // previous / next
        var prev = pos > 0 ? order[pos - 1] : null, next = pos >= 0 && pos < order.length - 1 ? order[pos + 1] : null;
        loadWorks([prev, next].filter(Boolean)).then(function (pn) {
          var byId = {}; pn.forEach(function (p) { byId[p.id] = p; });
          [['#prev', prev], ['#next', next]].forEach(function (x) {
            var a = $(x[0]), p = byId[x[1]];
            if (!p) { a.style.visibility = 'hidden'; return; }
            var num = pad(order.indexOf(p.id) + 1);
            a.href = 'work.html?id=' + encodeURIComponent(p.id);
            a.querySelector('.eyebrow').textContent = x[0] === '#prev' ? '← Previous · ' + num : num + ' · Next →';
            a.querySelector('strong').textContent = p.fields.title || 'Untitled';
            a.querySelector('span:last-child').textContent = p.fields.artist || '';
          });
        });
      });
    }).catch(function (e) { fail('main', e); });
  }

  window.Exhibition = { home: home, work: work, _parseDoc: parseDoc, _markdown: markdown, _videoEmbed: videoEmbed, _imageEntries: imageEntries };
})();
