// 규칙으로만 가른다. 낱말과 순서는 모두 keywords.json · criteria.json 에서 읽는다.
(function (root) {
  function firstHit(text, words) {
    for (var i = 0; i < (words || []).length; i++) {
      if (text.indexOf(words[i]) !== -1) return words[i];
    }
    return null;
  }

  // text 는 이미 가린 문장이다.
  function classify(text, criteria, kw) {
    var cats = criteria.categories.slice().sort(function (a, b) { return a.order - b.order; });

    // 칸: 두 칸에 걸치면 앞 칸. 걸리는 낱말이 없으면 마지막 칸.
    var cat = null, catWord = null;
    for (var i = 0; i < cats.length; i++) {
      var g = kw.category[cats[i].name];
      var w = g ? firstHit(text, g.words) : null;
      if (w) { cat = cats[i].name; catWord = w; break; }
    }
    if (!cat) cat = cats[cats.length - 1].name;

    // 긴급도: 순서대로 보고 처음 걸리는 단계. 없으면 default.
    var u = kw.urgency, urg = null, urgWhy = null;
    for (var j = 0; j < u.order.length; j++) {
      var lv = u.order[j], ug = u[lv];
      if (ug.categories && ug.categories.indexOf(cat) !== -1) { urg = lv; urgWhy = "칸이 " + cat; break; }
      var uw = firstHit(text, ug.words);
      if (uw) { urg = lv; urgWhy = "'" + uw + "'"; break; }
    }
    if (!urg) { urg = u.default; urgWhy = "걸리는 낱말 없음"; }

    // 감정
    var e = kw.emotion, emo = null, emoWhy = null;
    for (var k = 0; k < e.order.length; k++) {
      var ew = firstHit(text, e[e.order[k]].words);
      if (ew) { emo = e.order[k]; emoWhy = "'" + ew + "'"; break; }
    }
    if (!emo) { emo = e.default; emoWhy = "걸리는 낱말 없음"; }

    var reason = "칸 " + cat + (catWord ? "('" + catWord + "')" : "(걸리는 낱말 없음)") +
      " · 긴급도 " + urg + "(" + urgWhy + ")" +
      " · 감정 " + emo + "(" + emoWhy + ")";
    return { category: cat, urgency: urg, emotion: emo, reason: reason };
  }

  var api = { classify: classify };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Rules = api;
})(this);
