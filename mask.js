// 이름 · 전화번호 · 사번을 가린다. 분류는 가린 문장으로 한다.
(function (root) {
  var SURNAMES = "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모";
  var TITLES = "고객님|님|씨|대리|과장|부장|팀장|입니다|이에요|예요|올림|드림";
  // 성씨로 시작하는 흔한 낱말(이름으로 오해하지 않게). 이름 말투(입니다 등) 앞에서만 쓴다.
  var NOT_NAME = "이벤트|이중|이번|이미|이름|전화|정말|정상|정확|주문|주소|주세요|배송|배경|안내|신청|문의|구매|한번|한 번|고객|오늘|오류|여기|연락|연장|유효|응모|참여|제품|결제|환불|당첨|인증|인정|전체|제외|장소|방법|문자|마감|민원|사용|서비스|상품|상담|선물|설명|수령";

  // 전화번호: 숫자 · * · X · ○ 로 가린 것도 포함
  var PHONE = /(?<![0-9A-Za-z])0\d{1,2}[-.\s]?[\d*xX○]{3,4}[-.\s]?[\d*xX○]{4}(?![0-9A-Za-z])/g;
  // 사번: 「사번 123456」 「사원번호: A12345」 「사번 XXXX」 와 단독 「A123456」
  var EMP_LABELED = /(사번|사원번호)\s*[:：]?\s*[A-Za-z0-9*○]{3,10}/g;
  var EMP_BARE = /(?<![0-9A-Za-z])[A-Za-z]{1,2}-?\d{5,8}(?![0-9A-Za-z])/g;

  // 이름 1: 000 · ○○○ · XXX · ㅇㅇㅇ · ***  처럼 자리 표시로 쓴 이름
  var NAME_PLACEHOLDER = /(?<![0-9A-Za-z])(?:0{3}|[Oo]{2,4}|[Xx]{2,4}|[○◯]{2,4}|ㅇ{3,4}|[*＊]{2,4})(?![0-9A-Za-z])/g;
  // 이름 2: 김00 · 박OO · 이○○ 처럼 성씨 + 가린 글자
  var NAME_PARTIAL = new RegExp("(?<![가-힣])[" + SURNAMES + "][0○◯OoXxㅇ*＊]{2}(?![0-9A-Za-z])", "g");
  // 이름 3: 「이름은 홍길동」 「성함 홍길동」
  var NAME_AFTER_LABEL = /((?:이름|성함)(?:은|이|:|：)?\s*)[가-힣]{2,3}/g;
  // 이름 4: 성씨로 시작하는 2~3글자 + 님 · 씨 · 직함 · 입니다 · 올림 ...
  var NAME_BEFORE_TITLE = new RegExp(
    "(?<![가-힣])(?!(?:" + NOT_NAME + "))[" + SURNAMES + "](?!객님)[가-힣]{1,2}(?=\\s?(?:" + TITLES + "))", "g");

  // 이름 5: 「저는 김세현인데요」 「전 김세현이에요」 「제가 김세현이고」 — 자기소개 말투
  var SELF_END = "인데|이에요|예요|입니다|이라고|라고|이고|이구요|이거든";
  var NAME_SELF = new RegExp(
    "((?<![가-힣])(?:저는|제가|(?:전|저)\\s)\\s*)(?!(?:" + NOT_NAME + "))[가-힣]{2,3}(?=(?:" + SELF_END + "))", "g");
  // 이름 6: 성씨 + 두 글자 + 인데 · 이에요 ...  (세 글자 이름만. 두 글자 낱말은 건드리지 않는다)
  var NAME_SURNAME3 = new RegExp(
    "(?<![가-힣])(?!(?:" + NOT_NAME + "))[" + SURNAMES + "][가-힣]{2}(?=(?:" + SELF_END + "))", "g");

  function mask(text) {
    return String(text)
      .replace(EMP_LABELED, "[사번]")
      .replace(PHONE, "[전화번호]")
      .replace(EMP_BARE, "[사번]")
      .replace(NAME_AFTER_LABEL, "$1[이름]")
      .replace(NAME_PARTIAL, "[이름]")
      .replace(NAME_PLACEHOLDER, "[이름]")
      .replace(NAME_BEFORE_TITLE, "[이름]")
      .replace(NAME_SELF, "$1[이름]")
      .replace(NAME_SURNAME3, "[이름]");
  }

  var api = { mask: mask };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Mask = api;
})(this);
