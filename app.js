(function () {
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var FIELDS = [["칸", "category"], ["긴급도", "urgency"], ["감정", "emotion"]];
  var BATCH = 10;
  var AI_WAIT_MS = 65000; // 서버 함수가 60초까지 기다린다. 그보다 조금 더.
  var criteria, keywords, practice;

  function getJSON(path) {
    return fetch(path, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(path + " (" + r.status + ")");
      return r.json();
    });
  }

  function showError(e) {
    var s = $("#status");
    s.className = "status error";
    var local = location.protocol === "file:";
    s.innerHTML = "파일을 읽지 못했습니다: " + esc(e.message) +
      (local ? "<br>이 화면은 파일을 더블클릭해서 열면 안 됩니다. 폴더에서 <code>python -m http.server 8000</code> 을 실행하고 <code>http://localhost:8000</code> 으로 여세요." : "");
  }

  // ---- 탭 ----
  function selectTab(name) {
    ["classify", "score"].forEach(function (t) {
      var on = t === name;
      $("#tab-" + t).hidden = !on;
      $("#tabbtn-" + t).setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  // ---- AI 호출 (서버 함수 api/classify) ----
  // 가린 문장 목록을 보내고 {model, results:[{ok, category, urgency, emotion, reason | error}]} 를 받는다.
  // 실패하면 이유가 담긴 Error 로 거절한다.
  function callAI(maskedSentences) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, AI_WAIT_MS);
    return fetch("api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentences: maskedSentences }),
      signal: ctrl.signal
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, body: j }; },
        function () { return { status: r.status, body: null }; });
    }).then(function (x) {
      if (!x.body) {
        if (x.status === 404 || x.status === 501) throw new Error("이 주소에는 AI 서버 함수가 없습니다 (로컬 서버에서는 쓸 수 없고, Vercel 에 올려야 합니다).");
        throw new Error("서버 응답을 읽지 못했습니다 (" + x.status + ").");
      }
      if (!x.body.ok) throw new Error(x.body.error || "AI 서버 함수가 실패했습니다 (" + x.status + ").");
      return x.body;
    }, function (e) {
      if (e && e.name === "AbortError") throw new Error("AI 응답을 기다리다 시간이 지났습니다.");
      throw new Error("AI 서버 함수에 연결하지 못했습니다.");
    }).then(function (body) { clearTimeout(timer); return body; },
            function (e) { clearTimeout(timer); throw e; });
  }

  // ---- 분류 탭 ----
  function classifyOne(text) {
    var masked = Mask.mask(text);
    var out = Rules.classify(masked, criteria, keywords);
    out.masked = masked;
    return out;
  }

  function fillResult(r, src, note) {
    $("#r-cat").textContent = r.category;
    $("#r-urg").textContent = r.urgency;
    $("#r-emo").textContent = r.emotion;
    $("#r-reason").textContent = r.reason;
    $("#r-src").textContent = src;
    var n = $("#r-note");
    n.hidden = !note;
    n.textContent = note || "";
  }

  function runClassify() {
    var text = $("#input").value.trim();
    if (!text) return;
    var rule = classifyOne(text);
    var btn = $("#run");
    btn.disabled = true;
    btn.textContent = "AI 분류 중…";
    $("#result").hidden = false;
    $("#r-masked").textContent = rule.masked;
    ["#r-cat", "#r-urg", "#r-emo", "#r-reason", "#r-src"].forEach(function (s) { $(s).textContent = "…"; });
    $("#r-note").hidden = true;

    callAI([rule.masked]).then(function (body) {
      var a = body.results && body.results[0];
      if (!a || !a.ok) throw new Error((a && a.error) || "AI 가 이 문장에 답하지 않았습니다.");
      fillResult(a, "AI (" + body.model + ")", "");
    }).catch(function (e) {
      fillResult(rule, "규칙", "AI 없이 규칙으로 갈랐습니다. (AI 실패 이유: " + e.message + ")");
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "분류";
    });
  }

  function exampleLine(g) {
    var byId = {};
    practice.forEach(function (p) { byId[p.id] = p.text; });
    return (g.examples || []).map(function (id) {
      return esc(id) + " “" + esc(byId[id] || "(연습 문장에 없음)") + "”";
    }).join("<br>");
  }

  function group(title, g, extra) {
    var words = (g.words && g.words.length) ? g.words.map(esc).join(" · ") : "(낱말 없음 — 걸리는 것이 없으면 이 값)";
    return '<div class="kwgroup"><h3>' + esc(title) + '</h3>' +
      '<div class="words">' + words + (extra || "") + '</div>' +
      '<p class="ex">뽑은 연습 문장 ' + (g.examples || []).length + '개<br>' + exampleLine(g) + '</p></div>';
  }

  function renderKeywords() {
    var html = '<p class="hint">' + esc(keywords.source) + '. 칸은 ' +
      esc(criteria.tie_rule) + '</p>';
    html += "<h2>칸</h2>";
    criteria.categories.slice().sort(function (a, b) { return a.order - b.order; }).forEach(function (c) {
      html += group(c.order + ". " + c.name, keywords.category[c.name] || { words: [], examples: [] });
    });
    html += "<h2>긴급도</h2>";
    keywords.urgency.order.forEach(function (lv) {
      var g = keywords.urgency[lv];
      var extra = g.categories && g.categories.length ? '<br>칸이 ' + g.categories.map(esc).join(", ") + ' 이면 이 단계' : "";
      html += group(lv, g, extra);
    });
    html += '<p class="hint">위에서부터 처음 걸리는 단계. 아무것도 안 걸리면 ' + esc(keywords.urgency.default) + '</p>';
    html += "<h2>감정</h2>";
    keywords.emotion.order.concat([keywords.emotion.default]).forEach(function (em) {
      html += group(em, keywords.emotion[em]);
    });
    $("#kwlist").innerHTML = html;
  }

  // ---- 채점 공통 ----
  function gradeOnce(answers) {
    return answers.map(function (a) {
      var r = classifyOne(a.text);
      return { a: a, r: r };
    });
  }

  function topCategory() {
    return criteria.categories.slice().sort(function (a, b) { return a.order - b.order; })[0].name;
  }

  var pct = function (v, n) { return Math.round(v / n * 1000) / 10 + "%"; };

  // pred(row) 가 null 이면 «답을 못 받음» → 오답으로 센다.
  function summarize(rows, pred) {
    var top = topCategory();
    var s = { n: rows.length, hit: { category: 0, urgency: 0, emotion: 0 }, both: 0, all: 0, missed: 0, unanswered: 0, wrong: [] };
    rows.forEach(function (x) {
      var p = pred(x), ok = { category: false, urgency: false, emotion: false };
      if (p) FIELDS.forEach(function (f) { ok[f[1]] = x.a[f[0]] === p[f[1]]; });
      else s.unanswered++;
      FIELDS.forEach(function (f) { if (ok[f[1]]) s.hit[f[1]]++; });
      if (ok.category && ok.urgency) s.both++;
      if (ok.category && ok.urgency && ok.emotion) s.all++;
      if (x.a["칸"] === top && !(p && p.category === top)) s.missed++;
      if (!(ok.category && ok.urgency && ok.emotion)) s.wrong.push({ x: x, p: p, ok: ok });
    });
    return s;
  }

  function wrongList(s, title, errOf) {
    var html = '<h2>' + esc(title) + ' ' + s.wrong.length + '개 (정답 → 판정)</h2>';
    s.wrong.forEach(function (w) {
      var a = w.x.a;
      var diffs;
      if (!w.p) {
        diffs = '<i>답을 못 받음</i>' + (errOf && errOf(w.x) ? ' — ' + esc(errOf(w.x)) : '');
      } else {
        diffs = FIELDS.filter(function (f) { return !w.ok[f[1]]; }).map(function (f) {
          return f[0] + ' <i>' + esc(a[f[0]]) + ' → ' + esc(w.p[f[1]]) + '</i>';
        }).join(" · ");
      }
      html += '<div class="wrong"><span class="id">' + esc(a.id) + '</span>' +
        (a.note ? '<span class="tag">' + esc(a.note) + '</span>' : '') +
        '<div class="txt">' + esc(a.text) + '</div><div class="diff">' + diffs + '</div></div>';
    });
    return html;
  }

  function loadAnswers() { return getJSON("data/answer.json"); }

  // ---- 규칙으로 채점 ----
  function runScore() {
    var btns = [$("#score"), $("#ai-score")];
    btns.forEach(function (b) { b.disabled = true; });
    $("#scoreprog").textContent = "";
    loadAnswers().then(function (answers) {
      var run1 = gradeOnce(answers);
      var run2 = gradeOnce(answers);
      var same = JSON.stringify(run1.map(function (x) { return x.r; })) ===
                 JSON.stringify(run2.map(function (x) { return x.r; }));
      renderRuleScore(run1, same);
    }).catch(showError).then(function () { btns.forEach(function (b) { b.disabled = false; }); });
  }

  function renderRuleScore(rows, twiceSame) {
    var s = summarize(rows, function (x) { return x.r; });
    var n = s.n, top = topCategory();
    var html = '<div class="nums">' +
      '<div class="num"><b>' + pct(s.hit.category, n) + '</b><span>칸 정확도 (' + s.hit.category + '/' + n + ')</span></div>' +
      '<div class="num"><b>' + pct(s.hit.urgency, n) + '</b><span>긴급도 정확도 (' + s.hit.urgency + '/' + n + ')</span></div>' +
      '<div class="num"><b>' + pct(s.hit.emotion, n) + '</b><span>감정 정확도 (' + s.hit.emotion + '/' + n + ')</span></div>' +
      '<div class="num"><b>' + s.both + '개</b><span>칸 · 긴급도 둘 다 맞은 수 (셋 다: ' + s.all + '개)</span></div>' +
      '</div>';
    html += '<p class="cond ' + (s.missed ? 'bad' : '') + '">정답이 ' + esc(top) + '인데 다른 칸으로 놓친 문장: ' + s.missed + '개</p>';
    html += '<p class="cond">잰 조건: 규칙(keywords.json v' + esc(keywords.version) + ', 낱말 출처 ' + esc(keywords.source) + ') · 가린 문장 기준 · data/answer.json ' + n + '문장 · ' +
      (twiceSame ? '같은 채점을 두 번 했을 때 결과가 같음(흔들림 없음)' : '두 번 했을 때 결과가 달랐음') + '</p>';
    html += wrongList(s, "틀린 문장");
    $("#scoreout").innerHTML = html;
  }

  // ---- AI로 채점 ----
  function runAIScore() {
    var btns = [$("#score"), $("#ai-score")];
    var prog = $("#scoreprog");
    btns.forEach(function (b) { b.disabled = true; });
    $("#scoreout").innerHTML = "";

    loadAnswers().then(function (answers) {
      var n = answers.length;
      var rules = gradeOnce(answers);
      var ai = new Array(n);          // 각 칸: {ok:true, ...판정} 또는 {ok:false, error}
      var model = null;
      var chain = Promise.resolve();
      prog.textContent = "AI 채점 중… 0/" + n;

      function sendBatch(start) {
        var end = Math.min(start + BATCH, n);
        var masked = rules.slice(start, end).map(function (x) { return x.r.masked; });
        return callAI(masked).then(function (body) {
          model = body.model || model;
          for (var i = start; i < end; i++) {
            var r = body.results && body.results[i - start];
            ai[i] = (r && r.ok) ? r : { ok: false, error: (r && r.error) || "AI 가 이 문장에 답하지 않았습니다." };
          }
        }, function (e) {
          for (var i = start; i < end; i++) ai[i] = { ok: false, error: e.message };
        }).then(function () {
          prog.textContent = "AI 채점 중… " + end + "/" + n;
        });
      }

      for (var start = 0; start < n; start += BATCH) {
        (function (st) { chain = chain.then(function () { return sendBatch(st); }); })(start);
      }

      return chain.then(function () {
        prog.textContent = "AI 채점 끝 (" + n + "/" + n + ")";
        renderCompare(rules, ai, model);
      });
    }).catch(showError).then(function () { btns.forEach(function (b) { b.disabled = false; }); });
  }

  function renderCompare(rules, ai, model) {
    var n = rules.length, top = topCategory();
    var rs = summarize(rules, function (x) { return x.r; });
    var idx = new Map(); rules.forEach(function (x, i) { idx.set(x, i); });
    var as = summarize(rules, function (x) { var a = ai[idx.get(x)]; return a && a.ok ? a : null; });
    var failures = ai.filter(function (a) { return !a.ok; });

    function cell(v, bad) { return '<td' + (bad ? ' class="warn"' : '') + '>' + v + '</td>'; }
    function row(label, r, a, warn) {
      return '<tr><th>' + label + '</th>' + cell(r, false) + cell(a, warn) + '</tr>';
    }
    var html = '<table class="cmp"><tr><th></th><th>규칙</th><th>AI</th></tr>' +
      row("칸 정확도", pct(rs.hit.category, n) + " (" + rs.hit.category + "/" + n + ")", pct(as.hit.category, n) + " (" + as.hit.category + "/" + n + ")") +
      row("긴급도 정확도", pct(rs.hit.urgency, n) + " (" + rs.hit.urgency + "/" + n + ")", pct(as.hit.urgency, n) + " (" + as.hit.urgency + "/" + n + ")") +
      row("감정 정확도", pct(rs.hit.emotion, n) + " (" + rs.hit.emotion + "/" + n + ")", pct(as.hit.emotion, n) + " (" + as.hit.emotion + "/" + n + ")") +
      row("칸 · 긴급도 둘 다 맞은 수", rs.both + "개", as.both + "개") +
      row("셋 다 맞은 수", rs.all + "개", as.all + "개") +
      row(esc(top) + " 놓친 수", rs.missed + "개", as.missed + "개", as.missed > 0) +
      row("답을 못 받은 문장", "—", as.unanswered + "개", as.unanswered > 0) +
      '</table>';

    html += '<p class="cond">잰 조건: AI ' + esc(model || "(모델 이름 없음)") + ' · 규칙 keywords.json v' + esc(keywords.version) +
      ' · 가린 문장 기준 · data/answer.json ' + n + '문장을 ' + BATCH + '개씩 ' + Math.ceil(n / BATCH) + '번 보냄 · 한 번 잰 값(두 번 재서 흔들림을 보지는 않았음). ' +
      '답을 못 받은 문장은 오답으로 셈.</p>';

    html += '<button class="dl" id="dl">AI 채점 결과 내려받기</button>';
    html += wrongList(as, "AI가 틀린 문장", function (x) { var a = ai[idx.get(x)]; return a && a.error; });
    $("#scoreout").innerHTML = html;

    $("#dl").addEventListener("click", function () {
      var out = {
        measured_at: new Date().toISOString(),
        model: model,
        conditions: "가린 문장 기준 · data/answer.json " + n + "문장 · " + BATCH + "개씩 " + Math.ceil(n / BATCH) + "번 · 한 번 잰 값 · 답을 못 받은 문장은 오답",
        summary: {
          rules: { 칸: rs.hit.category, 긴급도: rs.hit.urgency, 감정: rs.hit.emotion, 칸_긴급도_둘다: rs.both, 셋다: rs.all, 개인정보_놓침: rs.missed, 전체: n },
          ai: { 칸: as.hit.category, 긴급도: as.hit.urgency, 감정: as.hit.emotion, 칸_긴급도_둘다: as.both, 셋다: as.all, 개인정보_놓침: as.missed, 답_못_받음: as.unanswered, 전체: n }
        },
        items: rules.map(function (x, i) {
          var a = ai[i];
          return {
            id: x.a.id,
            sent_text: x.r.masked,
            answer: { 칸: x.a["칸"], 긴급도: x.a["긴급도"], 감정: x.a["감정"] },
            rules: { 칸: x.r.category, 긴급도: x.r.urgency, 감정: x.r.emotion },
            ai: a.ok ? { 칸: a.category, 긴급도: a.urgency, 감정: a.emotion, 이유: a.reason } : null,
            ai_error: a.ok ? null : a.error
          };
        })
      };
      var blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url; link.download = "ai_채점결과.json";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }

  // ---- 시작 ----
  $("#tabbtn-classify").addEventListener("click", function () { selectTab("classify"); });
  $("#tabbtn-score").addEventListener("click", function () { selectTab("score"); });
  $("#run").addEventListener("click", runClassify);
  $("#input").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!$("#run").disabled) runClassify(); }
  });
  $("#score").addEventListener("click", runScore);
  $("#ai-score").addEventListener("click", runAIScore);

  Promise.all([getJSON("criteria.json"), getJSON("keywords.json"), getJSON("data/practice.json")])
    .then(function (v) {
      criteria = v[0]; keywords = v[1]; practice = v[2];
      renderKeywords();
      $("#run").disabled = false;
      $("#score").disabled = false;
      $("#ai-score").disabled = false;
    })
    .catch(showError);
})();
