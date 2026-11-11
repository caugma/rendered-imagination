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

  // "name: value" lines, then a line "---", then the body text.
  function parseDoc(text) {
    var lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
    var fields = {}, i = 0;
    for (; i < lines.length; i++) {
      var line = lines[i];
      if (/^\s*-{3,}\s*$/.test(line)) { i++; break; }
      if (/^\s*#/.test(line) || !line.trim()) continue;
      var m = line.match(/^\s*([A-Za-z0-9_]+)\s*[:：]\s?(.*)$/);
      if (m) fields[m[1].toLowerCase()] = m[2].trim();
    }
    return { fields: fields, body: lines.slice(i).join('\n').trim() };
  }

  function list(v) {
    return (v || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
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
  function section(map, word) {
    for (var k in map) if (k.indexOf(word) !== -1) return map[k];
    return '';
  }

  /* ---------- small DOM helpers ---------- */

  function $(sel) { return document.querySelector(sel); }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function text(id, value) { var n = document.getElementById(id); if (n) n.textContent = value || ''; }
  function placeholder(label, num) {
    return el('div', { class: 'ph', 'aria-hidden': 'true' }, [el('span', { text: num || '' }), el('span', { text: label })]);
  }
  // an <img> that turns into a placeholder box if the file is missing
  function image(src, alt, label, num) {
    if (!src) return placeholder(label, num);
    var img = el('img', { src: src, alt: alt || '', loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', function () {
      console.warn('Image not found: ' + src + ' — check the file name (upper/lower case matters).');
      img.replaceWith(placeholder('Image coming soon', num));
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

  /* ---------- the halftone pattern ---------- */

  function drawPattern(canvas, accent, seed) {
    var S = 16, COLS = 34, ROWS = 26, W = S * COLS, H = S * ROWS;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    var hex = (accent || '#FF5A36').replace('#', '');
    if (hex.length === 3) hex = hex.replace(/./g, '$&$&');
    var n = parseInt(hex, 16); if (isNaN(n)) n = 0xFF5A36;
    var A = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    var ph = seed * 0.73;
    var ax = W * (0.12 + 0.1 * Math.sin(seed)), ay = H * 1.1;
    var bx = W * (0.9 - 0.08 * Math.cos(seed * 1.3)), by = -H * 0.2;
    var G0 = [58, 63, 74], G1 = [242, 241, 236];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var x = (c + 0.5) * S, y = (r + 0.5) * S;
        var d1 = Math.hypot(x - ax, y - ay), d2 = Math.hypot(x - bx, y - by);
        var v = (0.5 + 0.25 * Math.sin(d1 / 22 + ph) + 0.25 * Math.sin(d2 / 30 - ph * 1.7)) * (0.25 + 0.75 * Math.pow(x / W, 0.8));
        v = Math.max(0, Math.min(1, v));
        var size = S * (0.1 + 0.8 * Math.pow(v, 1.3));
        var col = v > 0.8 ? A : G0.map(function (g, i) { return Math.round(g + (G1[i] - g) * Math.min(1, v / 0.8)); });
        ctx.fillStyle = 'rgb(' + col.join(',') + ')';
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
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
        var entries = (g[1] || '').match(/[^,()]+(\([^)]*\))?/g) || [];
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
      $('#about-body').innerHTML = markdown(section(secs, 'about'));
      $('#live-body').innerHTML = markdown(section(secs, 'live'));
      drawPattern($('#pattern'), s.accent_color, parseFloat(s.pattern_seed) || 7);

      return loadWorks(list(s.works)).then(function (works) { renderGrid(works, s); });
    }).catch(function (e) { fail('main', e); });
  }

  function renderGrid(works, s) {
    var grid = $('#grid'), count = $('#count'), buttons = document.querySelectorAll('.filters button');
    function draw(filter) {
      grid.innerHTML = '';
      var shown = works.filter(function (w) { return filter === 'all' || catKey(w.fields.category) === filter; });
      shown.forEach(function (w) {
        var f = w.fields, src = f.thumbnail || f.main_image;
        grid.appendChild(el('a', { class: 'card', href: 'work.html?id=' + encodeURIComponent(w.id) }, [
          el('div', { class: 'thumb' }, [image(src ? 'works/' + w.id + '/' + src : '', '', 'Image coming soon', w.id)]),
          el('div', { class: 'card-meta' }, [
            el('span', { class: 'card-cat', text: f.category }),
            el('span', { class: 'card-title', text: f.title || 'Untitled' }),
            el('span', { class: 'card-artist', text: f.artist })
          ])
        ]));
      });
      if (filter === 'all') grid.appendChild(el('a', { class: 'live-card', href: '#live' }, [
        el('span', { class: 'eyebrow', text: 'Live session' }),
        el('strong', { text: 'Meet the creators at ' + (s.conference_name || 'the conference') }),
        el('span', { text: [s.session_date, s.venue].filter(Boolean).join(' · ') + ' →' })
      ]));
      if (!shown.length) grid.appendChild(el('p', { class: 'empty', text: 'No works in this category.' }));
      var n = shown.length;
      count.textContent = (n < 10 ? '0' : '') + n + (n === 1 ? ' work' : ' works');
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
        var pos = order.indexOf(id);
        document.title = (f.title || 'Work') + ' — ' + (f.artist ? f.artist + ' — ' : '') + (s.title || '');

        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        text('w-num', (pos >= 0 ? pad(pos + 1) : id) + ' / ' + pad(order.length));
        text('w-cat', f.category); text('w-title', f.title); text('w-artist', f.artist); text('w-aff', f.affiliation);
        text('w-year', [f.year, f.duration].filter(Boolean).join(' · '));

        var frame = $('#w-frame'), embed = videoEmbed(f.video);
        frame.innerHTML = '';
        if (embed) {
          frame.appendChild(el('iframe', { src: embed, title: (f.title || 'Work') + ' — video', allow: 'autoplay; fullscreen; picture-in-picture', loading: 'lazy' }));
        } else {
          frame.appendChild(image(f.main_image ? dir + f.main_image : '', f.title, 'Main image coming soon'));
        }
        text('w-caption', f.main_caption);
        if (!f.main_caption) $('#w-caption').remove();

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

        var gal = $('#gallery-grid'); gal.innerHTML = '';
        list(f.images).forEach(function (file, i) {
          var a = el('a', { href: dir + file, target: '_blank', rel: 'noopener', 'aria-label': 'Image ' + (i + 2) + ' (opens full size)' });
          a.appendChild(image(dir + file, (f.title || '') + ' — image ' + (i + 2), 'Image ' + (i + 2)));
          gal.appendChild(a);
        });
        if (!gal.children.length) $('#gallery').remove();

        // previous / next
        var prev = pos > 0 ? order[pos - 1] : null, next = pos >= 0 && pos < order.length - 1 ? order[pos + 1] : null;
        loadWorks([prev, next].filter(Boolean)).then(function (pn) {
          var byId = {}; pn.forEach(function (p) { byId[p.id] = p; });
          [['#prev', prev, '← Previous · '], ['#next', next, '']].forEach(function (x) {
            var a = $(x[0]), p = byId[x[1]];
            if (!p) { a.style.visibility = 'hidden'; return; }
            a.href = 'work.html?id=' + encodeURIComponent(p.id);
            var n = order.indexOf(p.id) + 1, num = (n < 10 ? '0' : '') + n;
            a.querySelector('.eyebrow').textContent = x[0] === '#prev' ? x[2] + num : num + ' · Next →';
            a.querySelector('strong').textContent = p.fields.title || 'Untitled';
            a.querySelector('span:last-child').textContent = p.fields.artist || '';
          });
        });
      });
    }).catch(function (e) { fail('main', e); });
  }

  window.Exhibition = { home: home, work: work, _parseDoc: parseDoc, _markdown: markdown, _videoEmbed: videoEmbed };
})();
