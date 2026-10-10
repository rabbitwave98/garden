const { Plugin, MarkdownRenderer, Component, TFile, Notice, Modal, Platform, moment, arrayBufferToBase64 } = require('obsidian');

// 인라인 SVG 아이콘 — 이모지를 쓰지 않는다. 이모지는 OS 폰트가 그리므로 윈도우·맥·안드로이드에서
// 모양과 색이 제각각이고, 인쇄하면 컬러 비트맵으로 나간다. SVG 는 currentColor 를 따라 테마와 함께 돈다.
// 작은따옴표를 쓰지 않는다 — 아래 클라이언트 스크립트가 이 문자열을 '…' 로 감싸 넣는다.
const ICON_MOON = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
const ICON_SUN = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
const ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

// 모바일 공유용 임시 사본을 두는 앱 캐시 안의 폴더. 폴더로 묶어야 다음 실행에서 통째로 치울 수 있다.
const EXPORT_CACHE_DIR = 'single-html-export';

// 공유 시트를 띄울 수 없는 기기에서 산출물을 떨어뜨리는 공용 폴더. 다운로드 폴더 안에 한 겹
// 더 두는 것은 파일 관리자에서 찾는 비용 때문이다 — 다운로드 루트에 섞이면 다시 못 찾는다.
const PUBLIC_DROP_DIR = 'Download/Obsidian HTML';

// 본문 서체 스택 — 내보낸 페이지의 CSS 와 임시 렌더링 컨테이너가 **같은 값**을 써야 한다.
// Mermaid 는 렌더 시점에 글자 폭을 재서 노드 상자 크기를 SVG 에 굽는데, 잰 폰트와 그리는 폰트가
// 다르면 그 상자가 실제 글자보다 좁아져 글자가 상자 선을 넘는다(한글은 폭 차이가 커서 특히 심하다).
const BODY_FONT_STACK =
  '"Pretendard Local", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", "Malgun Gothic", Roboto, "Noto Sans KR", sans-serif';

/**
 * 문자열 — 옵시디언 앱 언어를 따라간다. 값이 함수면 인자를 받는 문장이다.
 *
 * 사전을 «영어 먼저» 로 적는다. 없는 키는 영어로 떨어지므로(`t()`), 새 문장을 한국어만 넣고
 * 잊으면 영어 사용자에게 한국어가 나간다 — 영어를 기준으로 두면 그 사고가 구조적으로 막힌다.
 * 내보낸 HTML 안의 문구(`doc*`)도 같은 표를 쓴다. 문서를 만든 사람의 언어를 따르는 것이 맞다 —
 * 그 파일은 손을 떠나 어디서 열릴지 모르므로 열리는 쪽 언어를 알 방법이 없다.
 */
const STRINGS = {
  en: {
    cmdExport: 'Export to single HTML',
    cmdDiagnose: 'Diagnose export options',
    cmdSweep: 'Clean up exported HTML in the vault',
    converting: (name) => `Rendering '${name}' to HTML…`,
    exportFailed: (msg) => `HTML export failed: ${msg}`,
    snippetsBundled: (list) => `Bundled CSS snippets that this note actually uses: ${list}`,
    snippetExternalDropped: (list) =>
      `Dropped rules with external references from ${list} — the exported file has to stand alone.`,

    noTargets: 'This environment has no way to export a file. Use the preview only.',
    processing: 'Working…',
    cancelled: 'Cancelled.',
    done: 'Done.',
    failed: (msg) => `Failed: ${msg}`,

    btnShare: 'Share',
    btnSave: 'Save…',
    btnPublic: 'Save to shared folder',
    btnCopyPath: 'Copy path',
    btnRevealMac: 'Show in Finder',
    btnReveal: 'Show in folder',

    sharedNoTrace: 'Handed to the share sheet. Nothing was written to your vault.',
    shared: 'Handed to the share sheet.',
    noShareBridge: 'This app does not expose a share sheet.',
    shareTempFailed: (why) => `Could not create the temporary file to share (${why}).`,
    shareFailed: (why) => `Could not open the share sheet (${why}).`,

    saved: 'Saved.',
    revealed: 'Opened in your file manager.',
    revealFailed: (why) => `Could not open the file manager (${why}). Open the path above yourself.`,
    savedAndCopied: 'Saved, and the path is on your clipboard. Open it in your file manager to share.',
    savedNoClipboard: 'Saved. The clipboard is unavailable, so select the path below by hand.',
    publicWriteFailed: (why) => `Could not write to the shared folder (${why}).`,
    pathCopied: 'Path copied.',
    clipboardUnavailable: 'The clipboard is unavailable.',

    sweepScanFailed: (why) => `Stopped — could not scan the vault: ${why}`,
    sweepNone: 'No exported HTML to clean up.',
    sweepNoneTail: (n) => `\n(${n} .html file(s) not made by this plugin were left alone)`,
    sweepMoved: (n) => `Moved ${n} exported HTML file(s) to the vault trash (.trash):`,
    sweepMore: (n) => `… and ${n} more`,
    sweepSkipped: (n) => `${n} .html file(s) not made by this plugin were left alone.`,
    sweepFailed: (n, list) => `${n} failed: ${list}`,

    saveDialogUnavailable: 'This device cannot show a save dialog, and there is no safe place to write. Use Share or the shared folder instead.',
    saveDialogTitle: 'Export to single HTML',
    filterHtml: 'HTML files',
    filterAll: 'All files',

    present: 'yes',
    absent: 'no',
    emptyList: '(empty)',
    probeNoObject: 'no object',
    probeNoCanShare: 'no canShare (older version?)',
    probeThrew: (why) => `canShare threw (${why})`,
    copiedToClipboard: '(copied to clipboard)',
    copyFailed: (why) => `(clipboard copy failed: ${why})`,

    logNoFilesystemBridge: 'no Capacitor Filesystem bridge',
    logWriteFailed: (dir, why) => `${dir} write failed (${why})`,

    docLang: 'en',
    docExportedAt: 'Exported',
    docThemeToggle: 'Toggle theme',
    docToDark: 'Switch to dark mode',
    docToLight: 'Switch to light mode',
    docInternalLink: (name) => `Obsidian internal link: ${name}`,
    docCopyCode: 'Copy code',
    docCopyEmpty: 'Nothing to copy',
    docCopied: 'Copied',
    docSelectedTouch: 'Selected · long-press to copy',
    docSelectedKeys: 'Selected · Cmd+C',
    docCopyFailed: 'Copy failed'
  },

  ko: {
    cmdExport: 'HTML로 내보내기',
    cmdDiagnose: '모바일 공유 수단 진단',
    cmdSweep: '볼트에 남은 내보낸 HTML 정리',
    converting: (name) => `'${name}' HTML 변환 중…`,
    exportFailed: (msg) => `HTML 내보내기 실패: ${msg}`,
    snippetsBundled: (list) => `이 문서가 실제로 쓰는 CSS 스니펫을 함께 실었습니다: ${list}`,
    snippetExternalDropped: (list) =>
      `${list} 에서 외부 참조가 든 규칙을 걷어냈습니다 — 내보낸 파일은 혼자 서야 합니다.`,

    noTargets: '이 환경에는 파일을 내보낼 수단이 없습니다. 미리보기로만 확인하세요.',
    processing: '처리 중…',
    cancelled: '취소했습니다.',
    done: '완료했습니다.',
    failed: (msg) => `실패: ${msg}`,

    btnShare: '공유',
    btnSave: '저장…',
    btnPublic: '공용 폴더에 저장',
    btnCopyPath: '경로 복사',
    btnRevealMac: 'Finder 에서 보기',
    btnReveal: '폴더에서 보기',

    sharedNoTrace: '공유 시트로 넘겼습니다. 볼트에는 아무것도 남지 않았습니다.',
    shared: '공유 시트로 넘겼습니다.',
    noShareBridge: '이 앱은 공유 시트를 열어 주지 않습니다.',
    shareTempFailed: (why) => `공유용 임시 파일을 만들지 못했습니다 (${why}).`,
    shareFailed: (why) => `공유 시트를 띄우지 못했습니다 (${why}).`,

    saved: '저장했습니다.',
    revealed: '파일 관리자에서 열었습니다.',
    revealFailed: (why) => `파일 관리자를 열지 못했습니다 (${why}). 위 경로를 직접 여세요.`,
    savedAndCopied: '저장하고 경로를 복사했습니다. 파일 관리자에서 열어 공유하세요.',
    savedNoClipboard: '저장했습니다. 클립보드를 쓸 수 없어 경로는 아래에서 직접 고르세요.',
    publicWriteFailed: (why) => `공용 폴더에 쓰지 못했습니다 (${why}).`,
    pathCopied: '경로를 복사했습니다.',
    clipboardUnavailable: '클립보드를 쓸 수 없습니다.',

    sweepScanFailed: (why) => `정리 중단 — 볼트를 훑지 못했습니다: ${why}`,
    sweepNone: '정리할 내보낸 HTML 이 없습니다.',
    sweepNoneTail: (n) => `\n(내보낸 것이 아닌 .html ${n}개는 건드리지 않았습니다)`,
    sweepMoved: (n) => `내보낸 HTML ${n}개를 휴지통(.trash)으로 옮겼습니다:`,
    sweepMore: (n) => `… 그리고 ${n}개 더`,
    sweepSkipped: (n) => `내보낸 것이 아닌 .html ${n}개는 그대로 뒀습니다.`,
    sweepFailed: (n, list) => `실패 ${n}개: ${list}`,

    saveDialogUnavailable: '이 기기에서는 저장 위치를 물을 수 없고, 안전하게 쓸 자리도 없습니다. 공유나 공용 폴더를 쓰세요.',
    saveDialogTitle: 'HTML로 내보내기',
    filterHtml: 'HTML 파일',
    filterAll: '모든 파일',

    present: '있음',
    absent: '없음',
    emptyList: '(빈 목록)',
    probeNoObject: '객체 없음',
    probeNoCanShare: 'canShare 없음(구버전 가능)',
    probeThrew: (why) => `canShare 예외(${why})`,
    copiedToClipboard: '(클립보드에 복사했습니다)',
    copyFailed: (why) => `(클립보드 복사 실패: ${why})`,

    logNoFilesystemBridge: 'Capacitor Filesystem 브리지 없음',
    logWriteFailed: (dir, why) => `${dir} 쓰기 실패(${why})`,

    docLang: 'ko',
    docExportedAt: '내보낸 시각',
    docThemeToggle: '테마 전환',
    docToDark: '다크 모드로 전환',
    docToLight: '라이트 모드로 전환',
    docInternalLink: (name) => `옵시디언 내부 링크: ${name}`,
    docCopyCode: '코드 복사',
    docCopyEmpty: '내용 없음',
    docCopied: '복사됨',
    docSelectedTouch: '선택함 · 길게 눌러 복사',
    docSelectedKeys: '선택함 · Cmd+C',
    docCopyFailed: '복사 실패'
  }
};

/**
 * 옵시디언 앱의 표시 언어. 매번 다시 읽는다 — 사용자가 설정에서 바꾸면 다음 문장부터 따라간다.
 *
 * 옵시디언이 앱 언어에 맞춰 설정해 두는 `moment` 로케일을 먼저 본다. 예전에는 `localStorage`
 * 의 언어 키를 읽었는데, **그 자리를 쓰는 것만으로 「플러그인이 localStorage 에 데이터를
 * 보관한다」로 읽힌다** — 우리는 저장하는 것이 아니라 앱 설정을 읽을 뿐이라, 오해를 살 필요가
 * 없는 쪽으로 옮겼다. 로케일을 못 읽는 판을 위해 옛 경로를 대비책으로 남긴다.
 */
function currentLang() {
  let lang = '';
  try {
    lang = String(moment.locale() || '');
  } catch (e) {
    lang = '';
  }
  if (!lang) {
    try {
      lang = window.localStorage.getItem('language') || '';
    } catch (e) {
      lang = '';
    }
  }
  return lang.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

/** 문자열 하나. 인자가 있으면 문장 함수에 넘긴다. */
function t(key, ...args) {
  const value = STRINGS[currentLang()][key] ?? STRINGS.en[key] ?? key;
  return typeof value === 'function' ? value(...args) : value;
}

/**
 * 내보내기 결과 팝업 — 만든 문서를 보여주고, 무엇을 할지 여기서 고른다.
 *
 * 순서가 설계의 핵심이다: **만들기 → 보여주기 → (선택) 저장·공유.** 저장을 먼저 하면 「보기만
 * 하고 안 남기기」가 불가능해져서, 확인차 눌러 본 것까지 파일로 쌓인다.
 *
 * 버튼 구성은 OS 목록이 아니라 **할 수 있는가**로 정한다(`plugin.exportTargets()`). 눌러도
 * 아무 일 없는 버튼은 아예 만들지 않는다 — 이 프로젝트의 `html.js` 게이팅과 같은 규칙이다.
 */
class ExportPreviewModal extends Modal {
  constructor(plugin, opts) {
    super(plugin.app);
    this.plugin = plugin;
    this.opts = opts;
  }

  onOpen() {
    const el = this.contentEl;
    this.modalEl.addClass('she-modal');
    el.addClass('she-body');

    const head = el.createDiv({ cls: 'she-head' });
    head.createDiv({ cls: 'she-title', text: this.opts.title });
    head.createDiv({
      cls: 'she-sub',
      text: `${this.opts.file.basename}.html · ${this.formatSize(this.opts.fullHtml.length)}`
    });

    // 미리보기는 접어 두지 않고 처음부터 보여준다 — 이 팝업의 본문이 그것이다.
    // 저장된 파일을 다시 읽지 않고 방금 만든 문서를 그대로 띄운다(경로를 웹뷰가 읽을 수 있게
    // 바꾸는 일은 플랫폼마다 다르고, 보여줄 내용은 이미 손에 있다).
    // iframe 을 감싸는 상자를 둔다. 이 상자가 «남는 높이를 먹는 칸»이자 테두리·모서리를
    // 담당하고, iframe 은 그것을 100% 로 채운다 — iframe 에 직접 유연 높이를 주면 대체
    // 요소(replaced element)라 브라우저마다 계산이 갈린다.
    const frameWrap = el.createDiv({ cls: 'she-frame-wrap' });
    const frame = frameWrap.createEl('iframe', { cls: 'she-frame' });
    // 우리가 만든 문서지만 sandbox 를 씌운다. 안 씌우면 문서의 테마 스크립트가 옵시디언 앱과
    // 같은 저장소에 키를 쓴다. 스크립트는 허용하므로 토글·복사 버튼은 살아 있고 저장소 접근만
    // 막힌다(문서 쪽이 try/catch 로 감싸 둬서 조용히 넘어간다).
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.srcdoc = this.opts.fullHtml;

    this.pathEl = el.createDiv({ cls: 'she-path' });
    this.pathEl.hide();
    this.statusEl = el.createDiv({ cls: 'she-status' });

    const actions = el.createDiv({ cls: 'she-actions' });
    const targets = this.plugin.exportTargets();
    // 버튼을 못 만드는 환경도 있다(공유·저장 수단이 둘 다 없는 웹뷰). 그때 빈 자리만 두면
    // 「고장」으로 읽히므로 왜 없는지 적는다 — 미리보기는 그래도 쓸 수 있다.
    if (targets.length === 0) {
      this.statusEl.setText(t('noTargets'));
    }
    targets.forEach((target, i) => {
      const btn = actions.createEl('button', { text: target.label });
      // 첫 항목이 그 환경의 기본 행동이다 — 순서는 판정 쪽이 정하고 여기서는 그대로 쓴다.
      if (i === 0) btn.addClass('mod-cta');
      btn.onclick = () => this.run(target, btn);
    });
  }

  /** 버튼 하나를 실행하고 결과를 이 팝업 안에 반영한다 — 사라지는 알림으로 흘려보내지 않는다 */
  async run(target, btn) {
    const label = btn.textContent;
    btn.disabled = true;
    btn.setText(t('processing'));
    try {
      const result = await target.run(this.opts);
      if (!result) {
        this.statusEl.setText(t('cancelled'));
      } else if (result.error) {
        this.statusEl.setText(result.error);
        // 실패한 수단이 대안을 알려줄 수 있다. 막다른 골목으로 두지 않는다.
        if (result.followUp) this.addFollowUp(result.followUp);
      } else {
        this.statusEl.setText(result.message || t('done'));
        if (result.displayPath) {
          this.pathEl.setText(result.displayPath);
          this.pathEl.show();
        }
        // 저장이 끝난 뒤에야 뜻이 생기는 버튼(폴더 열기·경로 복사)은 그때 붙인다.
        if (result.followUp) this.addFollowUp(result.followUp);
      }
    } catch (e) {
      this.statusEl.setText(t('failed', e?.message || e?.name || 'Error'));
    } finally {
      btn.disabled = false;
      btn.setText(label);
    }
  }

  addFollowUp(followUp) {
    const actions = this.contentEl.querySelector('.she-actions');
    if (!actions || actions.querySelector(`[data-she-follow="${followUp.id}"]`)) return;
    const btn = actions.createEl('button', { text: followUp.label });
    btn.dataset.sheFollow = followUp.id;
    btn.onclick = () => this.run(followUp, btn);
  }

  formatSize(chars) {
    const kb = chars / 1024;
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
  }

  onClose() {
    this.contentEl.empty();
  }
}

/**
 * SingleHtmlExportPlugin
 * 옵시디언 마크다운 문서를 Jelly-UI 테마가 적용된 오프라인 단일 HTML 파일로 내보내는 플러그인
 *
 * 기능이 다 살아 있나를 가르는 것은 **OS 가 아니라 여는 뷰어**다 — 그 뷰어가 JS 를 돌리는가.
 * 브라우저(맥·윈도우·안드로이드 크롬)에서는 전 기능이 뜨고, JS 를 돌리지 않는 내장 웹뷰
 * (iOS 파일 앱 미리보기, 안드로이드의 HTML 뷰어 앱들)에서는 정적 문서로 뜬다. iOS 는 그 위에
 * 브라우저의 file:// 접근까지 막아서 미리보기가 유일한 창구다. 그래서 JS 가 있어야 뜻이 있는
 * 컨트롤(테마 토글·코드 복사)은 기본 숨김이고 html.js 로만 드러낸다 — 죽은 버튼을 보이지 않는다.
 *
 * 이 파일의 주석은 «왜 이 제약이 있나»만 담는다. 대부분은 실제로 한 번 밟은 자리이므로,
 * 근거 없이 「정리」하면 그 결함이 그대로 돌아온다.
 */
class SingleHtmlExportPlugin extends Plugin {
  async onload() {
    // 1. 파일 탐색기 / 탭 우클릭 메뉴 등록
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && file.extension === 'md') {
          menu.addItem((item) => {
            item
              .setTitle(t('cmdExport'))
              .setIcon('file-code')
              .onClick(async () => {
                await this.exportFileToHtml(file);
              });
          });
        }
      })
    );

    // 2. 에디터 내부 우클릭 및 '...' (More options) 메뉴 등록
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor, view) => {
        const file = view?.file;
        if (file instanceof TFile && file.extension === 'md') {
          menu.addItem((item) => {
            item
              .setTitle(t('cmdExport'))
              .setIcon('file-code')
              .onClick(async () => {
                await this.exportFileToHtml(file);
              });
          });
        }
      })
    );

    // 3. 커맨드 팔레트 등록
    this.addCommand({
      id: 'export-current-file-to-single-html',
      name: t('cmdExport'),
      checkCallback: (checking) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === 'md') {
          if (!checking) {
            this.exportFileToHtml(activeFile);
          }
          return true;
        }
        return false;
      }
    });

    // 4. 공유 수단 진단 — 폰에서는 콘솔을 볼 수 없어 커맨드로 띄운다. 「왜 시트가 안 뜨나」는
    //    기기마다 답이 달라서(앱이 노출한 브리지에 달렸다) 추측 대신 그 기기에서 읽어야 한다.
    this.addCommand({
      id: 'report-share-capabilities',
      name: t('cmdDiagnose'),
      callback: async () => {
        await this.reportShareCapabilities();
      }
    });

    // 5. 볼트에 떨어진 산출물 회수 — 공유가 막힌 기기에서는 대비책이 볼트에 .html 을 쓰는데,
    //    옵시디언 파일 탐색기는 .html 을 표시하지 않아서 사용자가 그것을 지울 수단이 없다.
    //    (Sync 는 「기타 파일 형식」을 기본으로 나르지 않으므로 그 파일은 그 기기에만 있다)
    this.addCommand({
      id: 'sweep-exported-html',
      name: t('cmdSweep'),
      callback: async () => {
        await this.sweepExportedHtml();
      }
    });
  }

  /**
   * 마크다운 문서 하나를 의존성 없는 단일 HTML 로 만들어 **결과 팝업까지** 띄운다.
   *
   * 여기서 파일을 만들지는 않는다 — 저장·공유는 팝업의 버튼이 맡는다(`exportTargets`).
   * 이 메서드의 책임은 «문서 문자열을 만드는 것»에서 끝난다.
   */
  async exportFileToHtml(file) {
    new Notice(t('converting', file.basename));

    // 저장 위치를 **먼저 묻지 않는다.** 만들어 보여준 뒤에 무엇을 할지 고르는 순서라야
    // 「보기만 하고 저장하지 않는다」가 가능하다(그전에는 내보내는 순간 파일이 생겨서,
    // 확인만 하려던 경우에도 산출물이 남았다).
    let container = null;
    let comp = null;

    try {
      // 1. 파일 내용 읽기
      // vault.read 는 YAML 프론트매터까지 준다. 렌더러에 그대로 넘기면 그 블록이 본문 맨 앞에
      // 요소 하나로 남아, «맨 앞이 H1 인가» 판정이 그 요소에 막힌다(제목이 두 번 찍혔다).
      // 메타데이터는 metadataCache 로 따로 읽어 칩 바가 그리므로 본문에서는 걷어낸다.
      const content = this.stripFrontmatter(await this.app.vault.read(file));

      // 2. 임시 렌더링 컨테이너 생성 및 마운트 (BBox 측정 및 Mermaid/MathJax 렌더링에 필수)
      container = document.createElement('div');
      container.className = 'markdown-rendered single-html-export-temp';
      container.style.visibility = 'hidden';
      container.style.position = 'fixed';
      container.style.top = '-9999px';
      container.style.left = '-9999px';
      container.style.width = Platform.isMobile ? '100%' : '860px';
      // Mermaid 가 글자 폭을 재기 전에 내보낼 페이지와 같은 서체·크기를 씌운다. 옵시디언의 본문
      // 폰트로 재고 다른 폰트로 그리면 노드 상자가 글자보다 좁아진다(실측: 「Jelly-UI CSS & 토글러
      // 결합」의 마지막 글자가 상자 선을 넘었다). 재는 조건과 그리는 조건을 맞추는 것이 요점이다.
      container.style.fontFamily = BODY_FONT_STACK;
      container.style.fontSize = '14px';
      container.style.lineHeight = '1.72';
      document.body.appendChild(container);

      comp = new Component();
      comp.load();
      await MarkdownRenderer.render(this.app, content, container, file.path, comp);

      // 3. 비동기 렌더링 요소 대기 및 Mermaid SVG 보정
      await this.waitForAsyncRenders(container);
      await this.processMermaidDiagrams(container);

      // 4. 본문 최상단 H1 제목 추출 및 중복 제거
      const documentTitle = this.extractAndStripTitle(container, file.basename);

      // 5. 이미지 Base64 Data URI 변환 · 링크 정돈 · 넓은 표 감싸기
      await this.processImages(container, file.path);
      this.processLinks(container);
      this.wrapTables(container);

      // 6. 메타데이터 (프론트매터) 파싱
      const fileCache = this.app.metadataCache.getFileCache(file);
      const frontmatter = fileCache?.frontmatter || null;

      // 7. 이 문서에 실제로 걸리는 볼트 CSS 스니펫 수집
      //    컨테이너가 살아 있는 지금만 «선택자가 실제로 걸리나»를 물을 수 있다(아래 finally
      //    에서 떼어낸다). innerHTML 문자열로는 클래스와 값 문자열을 구분하지 못한다.
      const snippets = await this.collectSnippetCss(container, frontmatter);

      // 8. 전체 Standalone HTML 문서 조합
      const fullHtml = this.generateFullHtmlDoc(documentTitle, container.innerHTML, frontmatter, snippets.css);

      // 9. 결과를 보여주고, 무엇을 할지는 그 화면에서 고른다(플랫폼별 분기는 팝업 안에서
      //    «할 수 있는가»를 물어 정한다 — 여기서 OS 로 갈라 두면 또 목록이 된다).
      new ExportPreviewModal(this, { file: file, title: documentTitle, fullHtml: fullHtml }).open();
    } catch (err) {
      console.error('[SingleHtmlExport] Export error:', err);
      new Notice(t('exportFailed', err.message), 8000);
    } finally {
      // 리소스 및 임시 DOM 정리
      if (comp) comp.unload();
      if (container && container.parentNode) container.parentNode.removeChild(container);
    }
  }

  /**
   * 본문 앞의 YAML 프론트매터 블록을 떼어낸다. 파일 맨 앞의 `---` 로 열고 닫는 한 덩이만 본다.
   */
  stripFrontmatter(raw) {
    if (!raw.startsWith('---')) return raw;
    const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/);
    return m ? raw.slice(m[0].length) : raw;
  }

  /**
   * 문서 제목을 정하고, 그 제목이 본문 맨 앞의 H1 이었을 때만 본문에서 걷어낸다.
   *
   * 제거 대상은 «머리말 중복»뿐이라 **선두일 때로 한정한다** — 무조건 첫 h1 을 지우면 본문
   * 중간에서 h1 을 쓰는 문서(H1~H6 계층을 시연하는 견본 등)의 소제목이 사라진다.
   *
   * 단 «선두»를 firstElementChild 하나로 재면 안 된다. 앞에 빈 컨테이너가 하나 끼기만 해도
   * 판정이 막혀 제목이 두 번 찍힌다. 보이는 것이 없는 요소는 건너뛰고 판정한다.
   */
  extractAndStripTitle(container, fallbackTitle) {
    let firstEl = container.firstElementChild;
    while (firstEl && this.isInvisibleLead(firstEl)) {
      firstEl = firstEl.nextElementSibling;
    }
    if (!firstEl || firstEl.tagName !== 'H1') return fallbackTitle;

    const h1Text = firstEl.textContent?.trim();
    firstEl.remove();
    return h1Text || fallbackTitle;
  }

  /** 글자도 그림도 없는 선행 요소인가 — 건너뛰어도 «맨 앞»의 뜻이 달라지지 않는 것 */
  isInvisibleLead(el) {
    if (el.tagName === 'HR' || el.tagName === 'BR') return true;
    if (el.querySelector('img, svg, canvas, video')) return false;
    return !el.textContent?.trim();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 결과 처리 — 무엇을 할 수 있고, 누르면 무엇이 일어나는가
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * 이 환경에서 **할 수 있는 것**의 목록. 첫 항목이 그 환경의 기본 행동이 된다.
   *
   * OS 로 분기하지 않는다 — 「iOS 면 공유」로 적으면 시트가 막힌 iOS 에서 죽은 버튼이 남고,
   * 「안드로이드면 폴더 저장」으로 적으면 브리지가 열리는 날 그대로 낡는다. 수단의 존재를
   * 직접 물으면 결과적으로 같은 배치가 나오면서(iOS=공유 · 데스크톱=저장·폴더 열기 ·
   * 안드로이드=공용 폴더+경로) 환경이 바뀌어도 따라간다.
   *
   * **볼트 저장은 목록에 없다**(2026-08-23 제거). 어디서나 되기는 하지만 파일 탐색기가
   * `.html` 을 표시하지 않아 사용자가 다시 찾지도 지우지도 못하고, Sync 도 나르지 않아
   * 그 기기에만 남는다 — 「가능하다」가 「쓸 만하다」는 뜻이 아니고, 회수 커맨드를 따로
   * 만들어야 했던 것이 그 증거다. 수단이 하나도 없는 환경에서는 버튼 없이 미리보기만 남는다.
   */
  exportTargets() {
    const targets = [];
    const canShare = this.canUseNativeShare();

    if (canShare) {
      targets.push({ id: 'share', label: t('btnShare'), run: (o) => this.actionShare(o) });
    }
    if (this.isDesktop()) {
      targets.push({ id: 'save-dialog', label: t('btnSave'), run: (o) => this.actionSaveWithDialog(o) });
    }
    // 공용 폴더는 **시트가 없을 때의 우회로**다. 시트가 되는 환경에서 같이 내놓으면 더 나쁜
    // 길(파일 관리자에서 직접 찾아 다시 공유)을 나란히 권하는 셈이고, iOS 처럼 사용자가
    // 접근할 수 있는 공용 폴더가 아예 없는 환경에서는 눌러도 소용없는 버튼이 된다
    // (실측 2026-08-23 — 아이폰에서 저장은 되지만 그 파일에 닿을 방법이 없다).
    if (!canShare && this.hasPublicFolder()) {
      targets.push({ id: 'public', label: t('btnPublic'), run: (o) => this.actionSaveToPublic(o) });
    }
    return targets;
  }

  /** 파일을 붙여 시트를 띄울 수단이 있나 (iOS 의 WKWebView · Capacitor Share 브리지) */
  canUseNativeShare() {
    try {
      if (typeof navigator !== 'undefined' && navigator.canShare && typeof File !== 'undefined') {
        // 빈 파일로 물어본다 — 실제 문서를 만들지 않고도 «파일 공유가 되는가»를 알 수 있다.
        if (navigator.canShare({ files: [new File([''], 'probe.html', { type: 'text/html' })] })) return true;
      }
    } catch (e) {
      // canShare 는 인수를 못 다루면 던진다. 던지면 없는 것으로 본다.
    }
    return typeof this.capacitorPlugins()?.Share?.share === 'function';
  }

  /** 저장 다이얼로그와 파일 관리자를 부를 수 있는 환경인가 */
  isDesktop() {
    return Platform.isDesktopApp && typeof window.require === 'function';
  }

  /** 다른 앱이 볼 수 있는 자리에 쓸 수단이 있나 */
  hasPublicFolder() {
    return typeof this.capacitorPlugins()?.Filesystem?.writeFile === 'function';
  }

  /** 공유 — 메모리의 File 을 그대로 넘긴다. 성공하면 어디에도 파일이 남지 않는다 */
  async actionShare({ file, title, fullHtml }) {
    const fileName = `${file.basename}.html`;
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });

    try {
      if (typeof navigator !== 'undefined' && navigator.canShare && typeof File !== 'undefined') {
        const shareFile = new File([blob], fileName, { type: 'text/html' });
        if (navigator.canShare({ files: [shareFile] })) {
          await navigator.share({ title: title, files: [shareFile] });
          return { message: t('sharedNoTrace') };
        }
      }
    } catch (e) {
      // 시트를 닫은 것과 실패한 것을 Web Share API 는 구분해 주지 않는다. 브리지로 한 번 더 본다.
      // 사용자가 그냥 닫은 것일 수 있어 경고로 올리지 않는다 — 콘솔은 기본적으로 오류만 보여야 한다.
      console.debug('[SingleHtmlExport] navigator.share:', e);
    }

    const Share = this.capacitorPlugins()?.Share;
    if (typeof Share?.share !== 'function') {
      return { error: t('noShareBridge'), followUp: this.publicFolderFallback() };
    }

    // 파일을 붙이려면 다른 앱이 읽을 수 있는 URI 가 필요하다. 캐시는 Capacitor 가 기본으로
    // 공유를 허용하는 자리다. 넘긴 사본은 **다음 내보내기 시작에** 지운다 — 공유 직후에
    // 지우면 아직 복사 중인 수신 앱의 첨부가 깨진다(시트가 닫힌 것이 전송이 끝난 것은 아니다).
    const log = [];
    await this.purgeCapacitorCacheDir(EXPORT_CACHE_DIR);
    const uri = await this.writeToCapacitorDir(`${EXPORT_CACHE_DIR}/${fileName}`, fullHtml, 'CACHE', log);
    if (!uri) {
      return { error: t('shareTempFailed', log.join(' / ')), followUp: this.publicFolderFallback() };
    }

    // files 는 Share 플러그인 6 이후에만 있다. 없는 판은 url 만 받으므로 둘 다 두드린다.
    for (const payload of [{ title, files: [uri] }, { title, url: uri }]) {
      try {
        await Share.share(payload);
        return { message: t('shared') };
      } catch (e) {
        log.push(e?.message || e?.name || 'Error');
      }
    }
    return { error: t('shareFailed', log.join(' / ')), followUp: this.publicFolderFallback() };
  }

  /**
   * 공유가 실패했을 때 붙여 줄 대안 버튼. 없으면 undefined.
   *
   * 목록에서는 이 수단을 감춰 두지만(시트가 되는 환경에서는 열등한 우회로다) **막다른 골목을
   * 만들지는 않는다** — 시트가 실제로 실패한 그 자리에서는 차선이 최선이 된다.
   */
  publicFolderFallback() {
    if (!this.hasPublicFolder()) return undefined;
    return { id: 'public', label: t('btnPublic'), run: (o) => this.actionSaveToPublic(o) };
  }

  /** 데스크톱 저장 — 위치를 묻고, 저장한 뒤에야 「폴더에서 보기」가 뜻을 갖는다 */
  async actionSaveWithDialog({ file, fullHtml }) {
    const asked = await this.promptSavePath(`${file.basename}.html`);
    // 「사용자가 닫았다」와 「물어볼 수단이 없다」를 구별한다. 둘을 null 하나로 합쳐 두면
    // 다이얼로그를 못 띄운 환경에서 **사용자가 취소한 것으로 보고**하게 된다(0.9.1 까지 그랬다).
    if (asked.status === 'cancelled') return null;
    if (asked.status === 'unavailable') return { error: t('saveDialogUnavailable') };

    const savePath = asked.path;
    const fs = window.require('fs');
    await fs.promises.writeFile(savePath, fullHtml, 'utf8');
    return {
      message: t('saved'),
      displayPath: savePath,
      followUp: {
        id: 'reveal',
        // 맥은 Finder, 윈도우는 탐색기 — 이름을 맞춰 준다(없으면 중립 표현).
        label: (typeof process !== 'undefined' && process.platform) === 'darwin' ? t('btnRevealMac') : t('btnReveal'),
        run: () => this.actionReveal(savePath)
      }
    };
  }

  /** 저장한 파일을 파일 관리자에서 선택된 채로 띄운다 */
  async actionReveal(savePath) {
    try {
      window.require('electron').shell.showItemInFolder(savePath);
      return { message: t('revealed'), displayPath: savePath };
    } catch (e) {
      // 옵시디언 내부 경로로 한 번 더 — 판이 바뀌어 electron 모듈 모양이 달라질 수 있다.
      if (typeof this.app.showInFolder === 'function') {
        this.app.showInFolder(savePath);
        return { message: t('revealed'), displayPath: savePath };
      }
      return { error: t('revealFailed', e?.message || e?.name) };
    }
  }

  /** 공용 폴더 저장 — 시트가 없는 환경(안드로이드)의 기본 행동. 경로가 유일한 손잡이라 복사까지 한다 */
  async actionSaveToPublic({ file, fullHtml }) {
    const fileName = `${file.basename}.html`;
    const log = [];

    // 앞의 것이 막히면 다음 것으로 — 기기·안드로이드 버전에 따라 허용되는 자리가 다르다.
    for (const dir of ['EXTERNAL_STORAGE', 'EXTERNAL', 'DOCUMENTS']) {
      const uri = await this.writeToCapacitorDir(`${PUBLIC_DROP_DIR}/${fileName}`, fullHtml, dir, log);
      if (!uri) continue;

      const fullPath = this.toPlainPath(uri);
      const copied = await this.copyToClipboard(fullPath);
      return {
        message: copied
          ? t('savedAndCopied')
          : t('savedNoClipboard'),
        displayPath: this.shortenPath(fullPath),
        followUp: { id: 'copy', label: t('btnCopyPath'), run: () => this.actionCopyPath(fullPath) }
      };
    }
    return { error: t('publicWriteFailed', [...new Set(log)].join(' / ')) };
  }

  async actionCopyPath(path) {
    const ok = await this.copyToClipboard(path);
    return ok ? { message: t('pathCopied'), displayPath: this.shortenPath(path) } : { error: t('clipboardUnavailable') };
  }

  /** 기기 공통 접두는 어느 파일에나 붙어서 알려주는 바가 없다 — 화면에서는 걷어낸다 */
  shortenPath(path) {
    return path.replace(/^\/storage\/emulated\/0\//, '').replace(/^\/sdcard\//, '');
  }

  /**
   * `file:///storage/emulated/0/Download/Obsidian%20HTML/…` → `/storage/emulated/0/Download/Obsidian HTML/…`
   *
   * 퍼센트 인코딩은 기계가 읽는 표기다. 한글 파일명이 `%EB%A0%8C…` 로 깨져 나오면 **사람은 그것이
   * 자기 문서인지조차 알아볼 수 없고**, 파일 관리자에 그대로 붙여도 맞지 않는다.
   */
  toPlainPath(uri) {
    let path = String(uri).replace(/^file:\/\//, '');
    try {
      path = decodeURIComponent(path);
    } catch (e) {
      // 인코딩이 깨진 문자열이면 원문을 그대로 쓴다 — 읽기 어려운 것이 없는 것보다 낫다.
    }
    return path;
  }

  /** 클립보드 복사 — 웹뷰에 따라 없거나 막혀 있어 성공 여부를 돌려준다 */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Capacitor 의 Clipboard 브리지가 열려 있으면 그쪽으로 한 번 더 시도한다.
      // 옵셔널 체이닝의 결과를 그냥 await 하면 브리지가 «없을 때»도 성공으로 읽힌다(undefined
      // 를 await 하면 예외 없이 통과한다). 그래서 함수 존재를 먼저 확인한다.
      const Clipboard = this.capacitorPlugins()?.Clipboard;
      if (typeof Clipboard?.write !== 'function') return false;
      try {
        await Clipboard.write({ string: text });
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  /** 지난 공유 사본 치우기 — 없어서 실패하는 것이 정상 경로라 결과를 보지 않는다 */
  async purgeCapacitorCacheDir(dir) {
    const Filesystem = this.capacitorPlugins()?.Filesystem;
    if (!Filesystem?.rmdir) return;
    try {
      await Filesystem.rmdir({ path: dir, directory: 'CACHE', recursive: true });
    } catch (e) {
      // 첫 실행이면 폴더가 없다. 지우지 못해도 다음 쓰기가 같은 이름을 덮으므로 그냥 넘어간다.
    }
  }

  /** Capacitor Filesystem 으로 한 자리에 쓰고 그 URI 를 돌려준다. 실패는 log 에 남기고 null */
  async writeToCapacitorDir(path, data, directory, log) {
    const Filesystem = this.capacitorPlugins()?.Filesystem;
    if (!Filesystem?.writeFile) {
      log.push(t('logNoFilesystemBridge'));
      return null;
    }
    try {
      const written = await Filesystem.writeFile({
        path: path,
        data: data,
        directory: directory,
        encoding: 'utf8',
        recursive: true
      });
      if (written?.uri) return written.uri;
      const got = await Filesystem.getUri({ path: path, directory: directory });
      return got?.uri || null;
    } catch (e) {
      log.push(t('logWriteFailed', directory, e?.message || e?.name || 'Error'));
      return null;
    }
  }

  /** 앱이 노출한 Capacitor 플러그인 묶음. 없는 환경(데스크톱·브라우저)에서는 undefined */
  capacitorPlugins() {
    return typeof window === 'undefined' ? undefined : window.Capacitor?.Plugins;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 유지보수 커맨드 — 남은 산출물 회수 · 환경 진단
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * 볼트를 훑어 **이 플러그인이 만든** .html 만 걷어낸다.
   *
   * 남의 파일을 지우지 않는 근거는 이름이 아니라 내용이다 — 내보낸 문서는 머리에
   * `<meta name="generator" content="single-html-export …">` 를 달고 있어서, 그 표시가 없는
   * .html(직접 만든 페이지·클리핑 첨부)은 손대지 않는다. 지우는 것도 삭제가 아니라 볼트 안
   * 로컬 휴지통으로 옮기는 것이라, 잘못 걸려도 되돌릴 수 있다.
   */
  async sweepExportedHtml() {
    const adapter = this.app.vault.adapter;
    const found = [];
    const skipped = [];

    const walk = async (dir) => {
      const listing = await adapter.list(dir);
      for (const path of listing.files || []) {
        if (!path.toLowerCase().endsWith('.html')) continue;
        const body = await adapter.read(path);
        if (body.includes('name="generator" content="single-html-export')) found.push(path);
        else skipped.push(path);
      }
      for (const sub of listing.folders || []) {
        // 점 폴더(.obsidian·.trash·.backup)와 사용자 전용 구역은 들어가지 않는다.
        const name = sub.split('/').pop();
        if (name.startsWith('.') || name === '_Scratch') continue;
        await walk(sub);
      }
    };

    try {
      await walk('/');
    } catch (e) {
      new Notice(t('sweepScanFailed', e?.message || e?.name), 8000);
      return;
    }

    if (found.length === 0) {
      const tail = skipped.length ? t('sweepNoneTail', skipped.length) : '';
      new Notice(t('sweepNone') + tail, 6000);
      return;
    }

    const moved = [];
    const failed = [];
    for (const path of found) {
      try {
        // 로컬 휴지통은 볼트 안 .trash 다 — 점 폴더라 Sync 도 백업도 나르지 않는다.
        if (adapter.trashLocal) await adapter.trashLocal(path);
        else await adapter.remove(path);
        moved.push(path);
      } catch (e) {
        failed.push(`${path} (${e?.message || e?.name})`);
      }
    }

    console.log('[SingleHtmlExport] swept\n' + moved.join('\n'));
    const lines = [t('sweepMoved', moved.length), ...moved.slice(0, 8)];
    if (moved.length > 8) lines.push(t('sweepMore', moved.length - 8));
    if (skipped.length) lines.push(t('sweepSkipped', skipped.length));
    if (failed.length) lines.push(t('sweepFailed', failed.length, failed.join(', ')));
    new Notice(lines.join('\n'), 15000);
  }

  /**
   * 이 기기에서 어떤 공유 수단이 살아 있나 — 폰에서는 콘솔을 볼 수 없어 알림으로 띄운다.
   * 결과를 클립보드에도 넣어 문서에 붙일 수 있게 한다.
   */
  /** Share 브리지를 실제로 두드려 본다 — 시트를 띄우지 않는 `canShare` 만 부른다 */
  async probeShareBridge(plugins) {
    const Share = plugins?.Share;
    if (!Share) return t('probeNoObject');
    if (typeof Share.canShare !== 'function') return t('probeNoCanShare');
    try {
      const r = await Share.canShare();
      return `canShare → ${JSON.stringify(r)}`;
    } catch (e) {
      return t('probeThrew', e?.message || e?.name || 'Error');
    }
  }

  async reportShareCapabilities() {
    const plugins = this.capacitorPlugins();
    const lines = [
      `platform: ${window.Capacitor?.getPlatform?.() || (Platform.isMobile ? 'mobile' : 'desktop')}`,
      `navigator.share: ${typeof navigator?.share}` + ` / canShare: ${typeof navigator?.canShare}`,
      `window.Capacitor: ${window.Capacitor ? t('present') : t('absent')}`,
      `Capacitor plugins: ${plugins ? Object.keys(plugins).sort().join(', ') || t('emptyList') : t('absent')}`,
      `Share.share: ${typeof plugins?.Share?.share} / Filesystem.writeFile: ${typeof plugins?.Filesystem?.writeFile}`,
      // typeof 만 보면 안 된다 — Capacitor 의 Plugins 는 프록시라서 **네이티브에 없는 플러그인도**
      // 함수처럼 보이고, 없다는 사실은 부를 때 예외로만 드러난다. 그래서 실제로 한 번 부른다.
      `Share 실호출: ${await this.probeShareBridge(plugins)}`,
      `adapter.getFullPath: ${typeof this.app.vault.adapter?.getFullPath}`
    ];
    const text = lines.join('\n');
    console.log('[SingleHtmlExport] share capabilities\n' + text);
    try {
      await navigator.clipboard.writeText(text);
      lines.push(t('copiedToClipboard'));
    } catch (e) {
      lines.push(t('copyFailed', e?.name || 'Error'));
    }
    new Notice(lines.join('\n'), 30000);
  }


  // ───────────────────────────────────────────────────────────────────────────
  // 렌더링 보정 — 옵시디언이 만든 DOM 을 «파일 하나로 떼어낼 수 있는» 상태로 만든다
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * 비동기 렌더링(Mermaid 다이어그램 등) 완료 대기
   */
  async waitForAsyncRenders(container) {
    for (let i = 0; i < 12; i++) {
      const pendingMermaid = container.querySelectorAll(
        '.block-language-mermaid:not(:has(svg)), .language-mermaid:not(:has(svg))'
      );
      if (pendingMermaid.length === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }

  /**
   * 미변환 Mermaid 블록 직접 SVG 변환 처리
   */
  async processMermaidDiagrams(container) {
    // 세 셀렉터는 서로 겹친다 — code.language-mermaid 는 pre.language-mermaid 안에 있고
    // 그 pre 는 다시 .block-language-mermaid 안에 있다. 바깥 것을 replaceWith 로 갈아치우면
    // 안쪽 것들은 container 에서 떨어져 나가는데, 배열에는 그대로 남아 있어서 같은 다이어그램을
    // 두세 번 더 렌더한다(떨어진 노드라 querySelector('svg') 도 null 이라 걸러지지 않는다).
    // 그래서 «다른 후보에 담기지 않은 것»만 남긴다.
    const candidates = Array.from(
      container.querySelectorAll('.block-language-mermaid, pre.language-mermaid, code.language-mermaid')
    );
    const mermaidBlocks = candidates.filter(
      (el) => !candidates.some((other) => other !== el && other.contains(el))
    );

    for (let i = 0; i < mermaidBlocks.length; i++) {
      const block = mermaidBlocks[i];
      if (block.querySelector('svg')) continue;

      const code = block.textContent?.trim();
      if (!code) continue;

      try {
        if (typeof window !== 'undefined' && window.mermaid) {
          const id = `mermaid-export-${Date.now()}-${i}`;
          const renderResult = await window.mermaid.render(id, code);
          const svgHtml = typeof renderResult === 'string' ? renderResult : renderResult.svg;
          if (svgHtml) {
            const wrapper = document.createElement('div');
            wrapper.className = 'mermaid-rendered';
            // mermaid 가 돌려준 자기 SVG 문자열이다. 사용자 입력이 아니고, 이 노드는
            // 화면에 붙지 않는 임시 컨테이너 안에서 **문자열로 직렬화되기 위해서만** 산다.
            wrapper.innerHTML = svgHtml;
            block.replaceWith(wrapper);
          }
        }
      } catch (e) {
        console.warn('[SingleHtmlExport] Mermaid direct render fallback error:', e);
      }
    }
  }

  /**
   * 저장 경로 선택 다이얼로그 (Electron dialog 연동).
   *
   * 세 결과를 **구별해서** 돌려준다 — `ok`(경로 있음) · `cancelled`(사용자가 닫음) ·
   * `unavailable`(물어볼 수단이 없음). 뒤의 둘을 하나로 합치면 호출부가 「취소했습니다」로
   * 뭉쳐 보고하게 되고, 사용자는 자기가 누른 적 없는 취소를 통보받는다.
   */
  async promptSavePath(defaultFileName) {
    try {
      if (typeof window.require === 'function') {
        const electron = window.require('electron');
        const dialog = electron.remote ? electron.remote.dialog : electron.dialog;
        if (dialog && typeof dialog.showSaveDialog === 'function') {
          const result = await dialog.showSaveDialog({
            title: t('saveDialogTitle'),
            defaultPath: defaultFileName,
            filters: [
              { name: t('filterHtml'), extensions: ['html'] },
              { name: t('filterAll'), extensions: ['*'] }
            ]
          });
          if (result.canceled || !result.filePath) return { status: 'cancelled' };
          return { status: 'ok', path: result.filePath };
        }
      }
    } catch (e) {
      console.warn('[SingleHtmlExport] Electron dialog error:', e);
    }

    // 대비책: 다이얼로그를 못 띄웠으니 볼트 루트 경로를 쓴다. `getFullPath` 가 없으면
    // 상대경로가 되는데, 그때 fs 가 쓰는 기준 디렉터리는 옵시디언의 작업 디렉터리라
    // 어디에 생길지 알 수 없다 — 그런 저장은 하지 않고 「수단 없음」으로 올린다.
    const adapter = this.app.vault.adapter;
    if (typeof adapter.getFullPath !== 'function') return { status: 'unavailable' };
    return { status: 'ok', path: adapter.getFullPath(defaultFileName) };
  }

  /**
   * 이미지 파일 Base64 Data URI 인라인 변환 (오프라인 지원)
   */
  async processImages(container, sourcePath) {
    const images = Array.from(container.querySelectorAll('img'));
    for (const img of images) {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) continue;

      try {
        const targetFile = this.resolveImageFile(src, img.getAttribute('alt'), sourcePath);

        if (targetFile instanceof TFile) {
          const buffer = await this.app.vault.readBinary(targetFile);
          const base64 = arrayBufferToBase64(buffer);
          const mimeType = this.getMimeType(targetFile.extension);
          img.setAttribute('src', `data:${mimeType};base64,${base64}`);
          img.removeAttribute('srcset');
        } else if (!/^https?:\/\//.test(src)) {
          // 볼트 안 이미지인데 못 찾았다 = 내보낸 파일에서 깨진다. 조용히 넘기지 않는다.
          console.warn('[SingleHtmlExport] could not resolve a vault image, left as-is:', src);
        }
      } catch (err) {
        console.warn(`[SingleHtmlExport] Failed to embed image (${src}):`, err);
      }
    }
  }

  /**
   * 링크 속성 정돈 (외부 링크 새창, 위키링크 칩 스타일 부여)
   */
  processLinks(container) {
    const links = Array.from(container.querySelectorAll('a'));
    for (const a of links) {
      const href = a.getAttribute('href');
      if (!href) continue;

      if (href.startsWith('http://') || href.startsWith('https://')) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      } else if (a.classList.contains('internal-link')) {
        // href 는 볼트 안에서만 뜻이 있는 app:// 주소이거나 문서 이름이다. 내보낸 파일에서
        // 누르면 오류 페이지로 가거나 아무 일도 안 일어난다 — 링크처럼 보이는데 죽어 있는
        // 것보다 «가리키는 대상»만 남기는 편이 낫다. 칩 스타일은 클래스가 그대로 유지한다.
        const dataHref = a.getAttribute('data-href') || href;
        a.setAttribute('title', t('docInternalLink', dataHref));
        a.classList.add('obsidian-internal-link');
        a.removeAttribute('href');
      }
    }
  }

  /**
   * 표를 스크롤 상자로 감싼다 — 열이 많은 표가 **페이지 전체를 가로로 밀지 않게.**
   *
   * CSS 만으로는 못 한다. 표 자신에게 `overflow` 를 걸려면 `display: block` 이어야 하는데
   * 그러면 셀 정렬이 표가 아니게 되고, 테두리·둥근 모서리도 스크롤과 함께 흘러가 상자가
   * 깨진다. 감싸는 요소가 하나 있어야 **상자는 제자리, 내용만 스크롤**이 된다.
   *
   * 옵시디언 판에 따라 이미 감싸 주기도 해서(`.table-wrapper` 등), 감싼 것이 있으면 그 자리에
   * 클래스만 얹는다 — 두 겹으로 감싸면 안쪽 상자에 테두리가 두 번 그려진다.
   */
  wrapTables(container) {
    for (const table of Array.from(container.querySelectorAll('table'))) {
      const parent = table.parentElement;
      if (!parent) continue;

      if (parent.classList.contains('jelly-table-scroll')) continue;

      // 옵시디언이 이미 만든 **표 전용** 래퍼일 때만 재활용한다. 「자식이 표 하나뿐인 div」로
      // 판정하면 안 된다 — 표만 든 콜아웃 본문이 그 조건에 걸려, 콜아웃 안에 표 테두리가
      // 한 겹 더 그려진다. 이름으로 확인되는 것만 재활용하고 나머지는 새로 감싼다.
      if (parent.classList.contains('table-wrapper') || parent.classList.contains('markdown-table-wrapper')) {
        parent.classList.add('jelly-table-scroll');
        continue;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'jelly-table-scroll';
      table.replaceWith(wrapper);
      wrapper.appendChild(table);
    }
  }

  /**
   * 이미지 src(또는 alt)로 볼트 안 원본 파일을 찾는다.
   *
   * **URL 스킴을 나열해서 거르지 않는다.** 스킴은 플랫폼마다 다르고(데스크톱 app:// ·
   * iOS capacitor:// · 안드로이드 https://localhost) 앱 버전마다 또 바뀌므로, 목록에 없는
   * 값이 오면 아무 시도도 없이 원본 URL 이 남아 이미지가 통째로 깨진다.
   *
   * 두 갈래로 찾는다 — 경로는 **긴 쪽부터** 잘라 가며(짧은 쪽부터 하면 같은 이름의 다른
   * 파일에 먼저 걸린다), 그다음 alt(위키링크 임베드는 여기에 볼트 링크경로가 온다).
   */
  resolveImageFile(src, alt, sourcePath) {
    // 한글은 조합형(NFC)과 분해형(NFD)이 «같은 글자, 다른 바이트»다. iOS 가 주는 파일 URL 은
    // NFD, 옵시디언 내부 이름은 NFC 라 정규화 없이는 한글 파일명이 하나도 안 잡힌다.
    const dest = (p) => {
      if (!p) return null;
      for (const form of [p.normalize('NFC'), p.normalize('NFD'), p]) {
        const f = this.app.metadataCache.getFirstLinkpathDest(form, sourcePath);
        if (f instanceof TFile) return f;
      }
      return null;
    };

    let path = src.split('?')[0].split('#')[0];
    try {
      path = decodeURIComponent(path);
    } catch (e) {
      // 인코딩이 깨진 URL — 원문 그대로 두고 계속한다
    }

    const parts = path.split('/').filter(Boolean);
    for (let n = parts.length; n >= 1; n--) {
      const f = dest(parts.slice(parts.length - n).join('/'));
      if (f instanceof TFile) return f;
    }

    // 위키링크 임베드(`![[foo.png]]`)는 alt 에 볼트 링크경로가 그대로 들어온다.
    // URL 스킴이 무엇이든 이 값은 같아서, 경로 해석이 실패해도 여기서 잡힌다.
    const byAlt = dest(alt);
    if (byAlt instanceof TFile) return byAlt;

    return null;
  }

  getMimeType(ext) {
    const map = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      webp: 'image/webp',
      bmp: 'image/bmp',
      avif: 'image/avif',
      ico: 'image/x-icon'
    };
    return map[ext?.toLowerCase()] || 'image/png';
  }

  /**
   * 프론트매터 칩 HTML 생성
   */
  buildMetaChipsHtml(frontmatter) {
    if (!frontmatter) return '';
    let chips = '';

    if (frontmatter.type) {
      chips += `<span class="jelly-chip jelly-chip-type">${this.escapeHtml(String(frontmatter.type))}</span>`;
    }
    if (frontmatter.status) {
      chips += `<span class="jelly-chip jelly-chip-status">${this.escapeHtml(String(frontmatter.status))}</span>`;
    }
    if (frontmatter.confidence) {
      chips += `<span class="jelly-chip jelly-chip-confidence">${this.escapeHtml(String(frontmatter.confidence))}</span>`;
    }

    const topics = Array.isArray(frontmatter.topic)
      ? frontmatter.topic
      : frontmatter.topic
      ? [frontmatter.topic]
      : [];
    // 인자 이름을 `t` 로 두지 않는다 — 문자열 함수 `t()` 를 가려서, 이 안에서 번역이
    // 필요해지는 날 조용히 «주제 문자열을 호출»하게 된다.
    topics.forEach((topic) => {
      chips += `<span class="jelly-chip jelly-chip-topic">#${this.escapeHtml(String(topic))}</span>`;
    });

    const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
    tags.forEach((tag) => {
      chips += `<span class="jelly-chip jelly-chip-tag">#${this.escapeHtml(String(tag))}</span>`;
    });

    return chips ? `<div class="doc-chips-bar">${chips}</div>` : '';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 볼트 CSS 스니펫 — 「이 문서에 실제로 걸리는 것」만 싣는다
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * 이 문서에 실제로 적용되는 스니펫 CSS 를 모아 하나의 문자열로 돌려준다.
   *
   * 켜 둔 스니펫을 전부 싣지 않는 이유: 대부분의 스니펫은 **옵시디언 화면**을 손보는 것이라
   * (파일 탐색기·탭·상태바) 내보낸 문서에는 걸릴 자리조차 없다. 다 실으면 산출물만 수십 KB
   * 커지고, 그중 몇 줄이 본문 요소에 우연히 걸려 화면에서 보던 것과 다르게 나온다.
   *
   * 그래서 판정은 **선택자 대 실제 DOM** 으로 한다 — 스니펫이 지목하는 클래스·id 가 렌더된
   * 본문에 하나라도 있으면 그 스니펫을 싣고, 없으면 건너뛴다. 문서에 아무 표시도 안 해도
   * 「카드가 있는 문서」에서만 카드 CSS 가 따라오고 평소에는 아무것도 붙지 않는다.
   *
   * 요소 이름만 건드리는 스니펫(p·h3 같은 것)은 **의도적으로 못 걸리게 두었다.** 그건 어느
   * 문서에나 걸려서 판정이 「항상 참」이 되고, 그 순간 이 기능은 「전부 싣기」와 같아진다.
   *
   * 자동 판정을 못 믿을 때를 위한 손잡이는 프론트매터 하나뿐이다(설정 화면을 만들지 않았다):
   *   html-export-css: false          → 이 문서는 스니펫을 싣지 않는다
   *   html-export-css: [hero-siege-card]  → 판정을 건너뛰고 그 스니펫을 반드시 싣는다
   *
   * @param {HTMLElement} container 렌더가 끝난 임시 컨테이너(= 내보낼 본문 그 자체)
   * @returns {Promise<{css: string, names: string[]}>}
   */
  async collectSnippetCss(container, frontmatter) {
    const empty = { css: '', names: [] };
    const wanted = frontmatter ? frontmatter['html-export-css'] : undefined;
    if (wanted === false || wanted === 'false' || wanted === 'none' || wanted === 'off') return empty;

    const asName = (value) => String(value).trim().replace(/\.css$/i, '');
    let forced = null;
    if (Array.isArray(wanted)) forced = wanted.map(asName).filter(Boolean);
    else if (typeof wanted === 'string' && wanted !== 'auto' && wanted !== 'true') forced = [asName(wanted)];

    const dir = `${this.app.vault.configDir}/snippets`;
    let candidates = forced;
    if (!candidates) {
      // 꺼 둔 스니펫은 화면에도 안 걸리므로 산출물에도 없어야 한다. 그 목록을 못 읽는 판을
      // 위해 폴더를 훑는 길을 남기되, 거기서는 켜고 끈 상태를 모른 채 후보만 넓힌다 —
      // 「본문에 걸리는가」가 한 번 더 거르므로 결과가 크게 벌어지지는 않는다.
      const enabled = this.app.customCss && this.app.customCss.enabledSnippets;
      if (enabled && typeof enabled.forEach === 'function') {
        candidates = Array.from(enabled).map(asName);
      } else {
        try {
          const listing = await this.app.vault.adapter.list(dir);
          candidates = (listing?.files || [])
            .filter((path) => path.toLowerCase().endsWith('.css'))
            .map((path) => asName(path.slice(path.lastIndexOf('/') + 1)));
        } catch (err) {
          candidates = [];
        }
      }
    }
    if (!candidates.length) return empty;

    const present = this.collectPresentSelectorTokens(container);
    const blocks = [];
    const names = [];
    const withExternal = [];
    const imageSelectors = [];

    for (const name of candidates) {
      let raw = '';
      try {
        raw = await this.app.vault.adapter.read(`${dir}/${name}.css`);
      } catch (err) {
        // 목록에는 있는데 파일이 없는 경우(이름을 바꿨거나 지웠다). 내보내기를 세우지 않는다.
        continue;
      }
      const clean = this.stripCssComments(raw);
      if (!forced && !this.cssTargetsDocument(clean, present)) continue;

      const { css, dropped } = this.makeCssSelfContained(clean);
      if (!css.trim()) continue;
      if (dropped) withExternal.push(`${name}.css`);
      names.push(name);
      imageSelectors.push(...this.collectImageSelectors(css));
      blocks.push(`    /* ── ${name}.css ── */\n${css}`);
    }

    if (!blocks.length) return empty;

    // 액자 벗기기는 스니펫 **앞에** 둔다 — 무게가 같으므로 뒤에 오는 스니펫이 이긴다.
    const reset = this.buildImageResetCss(Array.from(new Set(imageSelectors)));
    if (reset) blocks.unshift(reset);
    if (withExternal.length) new Notice(t('snippetExternalDropped', withExternal.join(', ')), 8000);
    new Notice(t('snippetsBundled', names.map((name) => `${name}.css`).join(', ')));

    return { css: blocks.join('\n\n'), names: names };
  }

  /**
   * 렌더된 본문에 **실제로 존재하는** 클래스·id 를 전부 모은다.
   *
   * 컨테이너 자신의 클래스는 세지 않는다 — 거기 붙은 `markdown-rendered` 는 내용이 아니라
   * 렌더러가 요구한 발판이라, 그것까지 세면 그 클래스를 건드리는 스니펫이 전부 걸린다.
   */
  collectPresentSelectorTokens(container) {
    const present = new Set();
    container.querySelectorAll('*').forEach((el) => {
      if (el.id) present.add(`#${el.id}`);
      el.classList.forEach((cls) => present.add(`.${cls}`));
    });
    return present;
  }

  /** CSS 주석 제거. 이 뒤의 판정·정리는 전부 주석이 없는 것을 전제한다. */
  stripCssComments(css) {
    return String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  }

  /** 이 스니펫에 이 문서로 걸리는 규칙이 하나라도 있나. 규칙 하나의 판정은 `selectorListMatches`. */
  cssTargetsDocument(css, present) {
    let hit = false;
    this.forEachSelectorList(css, (selectorList) => {
      if (this.selectorListMatches(selectorList, present)) {
        hit = true;
        return true;
      }
      return false;
    });
    return hit;
  }

  /**
   * 규칙이 올 수 있는 자리의 선택자 목록만 골라 하나씩 넘긴다. 콜백이 true 를 주면 멈춘다.
   *
   * 선언부(중괄호 안)의 글자는 넘기지 않는다 — 색 이름이나 url 안의 점을 클래스로 읽으면
   * 아무 스니펫이나 걸린다. 그래서 **중괄호 깊이**를 따라가며 맨 바깥과 @media 같은
   * at-rule 안에서 모은 것만 선택자로 본다.
   */
  forEachSelectorList(css, fn) {
    const stack = [];
    let buffer = '';
    for (const ch of css) {
      if (ch === '{') {
        const selector = buffer.trim();
        buffer = '';
        const isAtRule = selector.startsWith('@');
        const inRuleArea = stack.length === 0 || stack[stack.length - 1];
        stack.push(isAtRule);
        if (inRuleArea && selector && !isAtRule && fn(selector) === true) return;
        continue;
      }
      if (ch === '}') {
        stack.pop();
        buffer = '';
        continue;
      }
      if (stack.length === 0 || stack[stack.length - 1]) buffer += ch;
    }
  }

  /**
   * 선택자 목록 하나(콤마로 갈린 것 포함)가 이 문서에 걸리나 — **판정 규칙의 원본.**
   *
   * 콤마로 갈린 것은 서로 다른 규칙이라 하나씩 따로 본다. 선택자 하나 안의 클래스·id 는
   * **전부** 있어야 하고(AND), `:is()`·`:where()` 안만 하나만 맞으면 된다(OR).
   */
  selectorListMatches(selectorList, present) {
    // 속성 선택자·따옴표 안·:not() 은 지운 뒤에 본다. [data-path$="/x.md"] 의 `.md` 가
    // 클래스로 읽히는 것과, :not(.foo) 의 foo 를 «있어야 하는 것»으로 세는 것을 막는다.
    const bare = selectorList
      .replace(/\[[^\]]*\]/g, '')
      .replace(/(['"])(?:\\.|(?!\1)[^\\])*\1/g, '')
      .replace(/:not\([^)]*\)/g, '');

    const tokensOf = (text) => {
      const re = /([.#])(-?[_a-zA-Z][\w-]*)/g;
      const found = [];
      let m;
      while ((m = re.exec(text)) !== null) found.push(m[1] + m[2]);
      return found;
    };

    for (const selector of this.splitTopLevelCommas(bare)) {
      // :is()/:where() 안은 「하나만 맞아도 되는」 목록이라 밖과 규칙이 반대다. 떼어내
      // 따로 본다(중첩 괄호가 있으면 안 떼어지고 밖의 규칙을 그대로 받는다 — 더 깐깐한
      // 쪽이라 실으면 안 될 것을 싣지는 않는다).
      const anyOf = [];
      const outer = selector.replace(/:(?:is|where|matches|any)\(([^()]*)\)/gi, (m, inner) => {
        anyOf.push(tokensOf(inner));
        return '';
      });

      const required = tokensOf(outer);
      // 요소 이름만 쓰는 선택자(p·h3)는 근거로 세지 않는다 — 어느 문서에나 걸려서
      // 판정이 「항상 참」이 된다.
      if (!required.length && !anyOf.some((group) => group.length)) continue;

      // 밖의 토큰은 **전부** 있어야 한다. 하나만 걸려도 통과시켰더니
      // `.hs-card a.external-link` 한 줄 때문에 링크가 있는 아무 문서에나 도감 CSS 가
      // 통째로 실렸다(실측).
      if (!required.every((token) => present.has(token))) continue;
      if (!anyOf.every((group) => !group.length || group.some((token) => present.has(token)))) continue;
      return true;
    }
    return false;
  }

  /**
   * 스니펫이 **직접 img 를 지목한** 선택자들.
   *
   * 이 파일은 본문의 모든 그림에 액자를 씌운다(테두리·그림자·둥근 모서리·가운데 블록 배치).
   * 문서에 툭 놓인 스크린샷에는 그게 맞지만, **스니펫이 배치까지 짜 놓은 그림**(카드 안의
   * 아이콘 같은 것)에 겹치면 옵시디언에서 보던 것과 달라진다 — 어두운 카드 안에 밝은
   * 테두리가 둘린 채로 나갔다(실측 2026-09-01).
   *
   * 그래서 「스니펫이 img 를 건드렸다」를 **그 그림은 스니펫이 책임진다**는 신호로 읽고,
   * 그 선택자에 한해 액자를 벗긴다. 스니펫 이름을 아는 것이 아니라 선택자만 보므로 어느
   * 스니펫에나 같게 걸린다.
   */
  collectImageSelectors(css) {
    const found = new Set();
    this.forEachSelectorList(css, (selectorList) => {
      for (const selector of this.splitTopLevelCommas(selectorList)) {
        const trimmed = selector.trim().replace(/\s+/g, ' ');
        if (!trimmed) continue;
        // 스타일이 실제로 걸리는 것은 **마지막 조각**이다. `.hs-card img` 는 해당하고
        // `img .cap` (그림 안의 무엇)은 해당하지 않는다.
        const last = trimmed.split(/[\s>+~]+/).filter(Boolean).pop() || '';
        if (/^img\b/i.test(last)) found.add(trimmed);
      }
      return false;
    });
    return Array.from(found);
  }

  /**
   * 위에서 고른 선택자의 그림에서 이 파일의 기본 액자를 벗기는 규칙.
   *
   * 접두를 `:where(.markdown-body)` 로 감싸는 것이 요점이다 — 특정도에 0 을 보태므로
   * 결과가 **스니펫 자신의 선택자와 같은 무게**가 되고, 이 블록이 스니펫보다 앞에 오니
   * 스니펫이 테두리를 다시 지정하면 그쪽이 이긴다. 그냥 `.markdown-body` 로 두면 접두가
   * 무게를 더해 **스니펫이 지정한 값까지 눌러 버린다.**
   */
  buildImageResetCss(selectors) {
    if (!selectors.length) return '';
    const list = selectors.map((selector) => `    :where(.markdown-body) ${selector}`).join(',\n');
    return `    /* 스니펫이 배치까지 책임지는 그림 — 이 파일의 기본 액자를 벗긴다 */
${list} {
      border: 0;
      box-shadow: none;
      border-radius: 0;
      margin: 0;
      display: revert;
    }`;
  }

  /** 콤마로 갈린 선택자 목록을 하나씩 나눈다. 괄호 안의 콤마는 `:is(.a, .b)` 처럼 한 덩이다. */
  splitTopLevelCommas(text) {
    const parts = [];
    let depth = 0;
    let buffer = '';
    for (const ch of text) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) {
        parts.push(buffer);
        buffer = '';
        continue;
      }
      buffer += ch;
    }
    parts.push(buffer);
    return parts;
  }

  /**
   * 스니펫 CSS 를 산출물에 실어도 되는 형태로 만든다.
   *
   * 이 플러그인의 존재 이유가 「외부 참조 0」이라, 스니펫이 들고 온 참조도 예외가 아니다.
   * 남겨 두면 인터넷 없는 곳에서 조용히 깨진 채로 뜬다 — 그럴 바에는 그 규칙이 없는 편이
   * 「무엇이 빠졌나」가 눈에 보여서 낫다. data: URI 는 파일 안에 있으므로 그대로 둔다.
   */
  makeCssSelfContained(css) {
    let dropped = false;
    let out = String(css).replace(/@import[^;]*;/gi, () => {
      dropped = true;
      return '';
    });
    // 따옴표를 먼저 «선택적으로» 먹고 나서 data: 를 부정하면, 정규식이 따옴표를 안 먹은 쪽으로
    // 물러나 data: URI 까지 외부 참조로 읽는다(실측). 부정 안에 따옴표를 넣어야 그 길이 막힌다.
    out = out.replace(/[^;{}]*url\(\s*(?!['"]?data:)[^)]*\)[^;{}]*(;|(?=\}))/gi, () => {
      dropped = true;
      return '';
    });
    // 스니펫 안의 </style 이 산출물의 스타일 블록을 끊는 것을 막는다. 남의 파일을 그대로
    // 문서에 심는 자리라, 문법이 아니라 **문서 구조**가 깨지는 쪽을 먼저 막아야 한다.
    return { css: out.replace(/<\/(style)/gi, '<\\/$1'), dropped };
  }

  /**
   * 옵시디언 테마 변수를 Jelly 토큰에 잇는 다리.
   *
   * 스니펫은 앱 안에서 도는 물건이라 --text-muted 같은 이름을 당연히 쓴다. 그 이름이 없는
   * 곳에 그대로 실으면 색이 상속값으로 떨어져 「검은 글씨에 검은 배경」이 난다. 값을 새로
   * 만들지 않고 **이름만 잇는다** — 그래야 테마 토글이 스니펫 부분까지 함께 돈다.
   */
  getObsidianVarBridge() {
    return `    :root {
      --background-primary: var(--jelly-bg-card);
      --background-primary-alt: var(--jelly-bg-subtle);
      --background-secondary: var(--jelly-bg-subtle);
      --background-secondary-alt: var(--jelly-bg-muted);
      --background-modifier-border: var(--jelly-border-default);
      --background-modifier-border-hover: var(--jelly-border-subtle);
      --background-modifier-hover: var(--jelly-bg-subtle);
      --background-modifier-active-hover: var(--jelly-bg-muted);
      --divider-color: var(--jelly-border-default);

      --text-normal: var(--jelly-text-default);
      --text-muted: var(--jelly-text-muted);
      --text-faint: var(--jelly-text-subtle);
      --text-accent: var(--jelly-accent-text);
      --text-accent-hover: var(--jelly-accent-default);
      --text-on-accent: var(--jelly-bg-card);
      --text-highlight-bg: var(--jelly-mark-bg);
      --text-selection: var(--jelly-accent-subtle);

      --interactive-accent: var(--jelly-accent-default);
      --interactive-accent-hover: var(--jelly-accent-text);
      --interactive-normal: var(--jelly-bg-subtle);
      --interactive-hover: var(--jelly-bg-muted);

      --code-background: var(--jelly-code-bg);
      --code-normal: var(--jelly-code-text);

      --radius-s: var(--jelly-radius-xs);
      --radius-m: var(--jelly-radius-sm);
      --radius-l: var(--jelly-radius-md);

      --font-text: ${BODY_FONT_STACK};
      --font-interface: ${BODY_FONT_STACK};
      --font-monospace: ui-monospace, SFMono-Regular, "SF Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace;
    }`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 산출물 조립 — 여기서 나온 문자열이 곧 내보낼 파일이다(외부 참조 0)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Standalone HTML 전체 문서 조립
   */
  generateFullHtmlDoc(title, bodyContent, frontmatter = null, snippetCss = '') {
    // 시각 표기도 문서 언어를 따른다 — 본문이 영어인데 날짜만 「2026. 8. 23. 오전 11:12:36」로
    // 나오면 그 자리에서 만든 사람의 언어가 새어 나온다.
    const now = new Date().toLocaleString(currentLang() === 'ko' ? 'ko-KR' : 'en-US');
    const metaChipsHtml = this.buildMetaChipsHtml(frontmatter);
    // 만든 판을 산출물에 박아 둔다. 이게 없으면 «지금 보는 이 파일이 어느 빌드인가»를
    // 알 길이 없어, 고친 뒤에도 옛 산출물을 보고 판정하게 된다(실제로 두 번 그랬다).
    // 기기마다 플러그인 사본이 따로 사는 것도 이 표기로만 드러난다.
    const version = this.manifest?.version || 'unknown';

    // 스니펫 CSS 는 **뒤에** 오는 별도 블록이다 — 앞에 두면 특정도가 같은 자리에서 이 파일의
    // 기본 스타일이 이기고, 화면에서 보던 모습이 산출물에서만 사라진다.
    const snippetStyleBlock = snippetCss
      ? `\n  <style>\n${this.getObsidianVarBridge()}\n\n${snippetCss}\n  </style>`
      : '';
    // 스니펫을 실을 때만 옵시디언의 본문 컨테이너 클래스를 함께 붙인다. 읽기 모드를 겨냥해
    // 쓴 규칙(.markdown-rendered:has(...) 같은 것)이 여기서도 걸리게 하려는 것이고,
    // 실을 것이 없을 때는 붙이지 않는다 — 없어도 되는 이름을 산출물에 남기지 않는다.
    const bodyClass = snippetCss ? 'markdown-body markdown-rendered' : 'markdown-body';

    return `<!DOCTYPE html>
<html lang="${t('docLang')}" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="single-html-export v${this.escapeHtml(version)}">
  <!-- Third-party notices for what is inlined in this file:
       · Lucide (ISC) https://lucide.dev — icon artwork. (c) Lucide Icons and Contributors;
         Feather-derived parts (c) Cole Bemis (MIT).
       · jelly-ui (MIT) https://jelly-ui.com — design tokens and component vocabulary.
       고지를 저장소 README 에만 두지 않는 이유: 이 파일은 손을 떠나 **혼자 돌아다니는 사본**이고,
       두 라이선스 다 「사본에 고지를 포함하라」 고 요구한다. 저장소를 못 보는 사본이 기본값이다. -->
  <title>${this.escapeHtml(title)}</title>
  <style>
${this.getJellyStyles()}
  </style>${snippetStyleBlock}
</head>
<body>
  <div class="jelly-container">
    <header class="doc-header">
      <div class="doc-header-top">
        <h1 class="doc-title">${this.escapeHtml(title)}</h1>
        <button class="jelly-theme-toggle" id="theme-toggle" type="button" aria-label="${t('docThemeToggle')}" title="${t('docToDark')}">${ICON_MOON}</button>
      </div>
      <div class="doc-meta">
        <span>${t('docExportedAt')}: ${now}</span>
        <span class="doc-generator">single-html-export v${this.escapeHtml(version)}</span>
      </div>
      ${metaChipsHtml}
    </header>
    <main class="${bodyClass}">
      ${bodyContent}
    </main>
  </div>

  <script>
${this.getClientScripts()}
  </script>
</body>
</html>`;
  }

  /**
   * Jelly-UI CSS 스타일시트 반환
   */
  getJellyStyles() {
    // 네트워크를 타는 폰트 참조를 두지 않는다 — 이 파일의 존재 이유가 오프라인 독립이다.
    // Pretendard 가 깔린 기기에서는 local() 로 잡히고, 없으면 OS 한글 폰트로 내려간다.
    return `    @font-face {
      font-family: "Pretendard Local";
      src: local("Pretendard Variable"), local("PretendardVariable"), local("Pretendard");
      font-weight: 45 920;
      font-display: swap;
    }

    /* Jelly-UI 디자인 시스템 토큰 */
    :root, [data-theme="light"] {
      --jelly-bg-page: transparent;
      --jelly-bg-card: #ffffff;
      --jelly-bg-subtle: #f1f5f9;
      --jelly-bg-muted: #e2e8f0;
      
      --jelly-text-default: #0f172a;
      --jelly-text-muted: #64748b;
      --jelly-text-subtle: #94a3b8;
      
      --jelly-border-default: transparent;
      --jelly-border-subtle: transparent;
      
      --jelly-accent-default: #3b82f6;
      --jelly-accent-subtle: #eff6ff;
      --jelly-accent-border: #bfdbfe;
      --jelly-accent-text: #1d4ed8;
      
      --jelly-code-bg: #f8fafc;
      --jelly-code-border: #e2e8f0;
      --jelly-code-text: #0f172a;
      
      --jelly-mark-bg: #fef08a;
      --jelly-mark-text: #854d0e;
      
      --jelly-radius-xs: 4px;
      --jelly-radius-sm: 8px;
      --jelly-radius-md: 12px;
      --jelly-radius-lg: 18px;
      --jelly-radius-pill: 9999px;
      
      --jelly-shadow-card: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03);
      --jelly-shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
      --jelly-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.07);
    }

    /* 다크 토큰은 화면 전용이다 — 인쇄에서는 :root 의 라이트 값이 그대로 이겨서,
       다크로 보던 문서를 인쇄해도 흰 종이에 흰 글씨가 나오지 않는다. 값을 복사해
       @media print 에 다시 적지 않는 이유이기도 하다(사본은 갈라진다). */
    @media screen {
    [data-theme="dark"] {
      --jelly-bg-page: transparent;
      --jelly-bg-card: #151d2f;
      --jelly-bg-subtle: #1e293b;
      --jelly-bg-muted: #334155;
      
      --jelly-text-default: #f8fafc;
      --jelly-text-muted: #94a3b8;
      --jelly-text-subtle: #64748b;
      
      --jelly-border-default: #243048;
      --jelly-border-subtle: #334155;
      
      --jelly-accent-default: #60a5fa;
      --jelly-accent-subtle: #172554;
      --jelly-accent-border: #1e3a8a;
      --jelly-accent-text: #93c5fd;
      
      --jelly-code-bg: #0f172a;
      --jelly-code-border: #243048;
      --jelly-code-text: #f1f5f9;
      
      --jelly-mark-bg: #854d0e;
      --jelly-mark-text: #fef08a;
      
      --jelly-shadow-card: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
      --jelly-shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.3);
      --jelly-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
    }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: transparent;
      color: var(--jelly-text-default);
      font-family: ${BODY_FONT_STACK};
      font-size: 14px;
      line-height: 1.72;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
      transition: background-color 0.25s ease, color 0.25s ease;
      -webkit-font-smoothing: antialiased;
    }

    /* 메인 Jelly 카드 컨테이너 */
    .jelly-container {
      max-width: 860px;
      width: 100%;
      background: transparent;
      border: none;
      border-radius: var(--jelly-radius-lg);
      box-shadow: none;
      padding: 44px 40px;
      transition: background-color 0.25s ease, border-color 0.25s ease;
    }

    @media (max-width: 640px) {
      body { padding: 8px 4px; }
      .jelly-container { padding: 5px 5px; border-radius: var(--jelly-radius-md); }
    }

    /* 문서 헤더 & 메타 */
    header.doc-header {
      margin-bottom: 2rem;
      padding-bottom: 1.2rem;
      border-bottom: 1px solid var(--jelly-border-default);
    }

    .doc-header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 0.5rem;
    }

    h1.doc-title {
      font-size: 1.8rem;
      font-weight: 800;
      line-height: 1.3;
      color: var(--jelly-text-default);
      letter-spacing: -0.025em;
      word-break: break-word;
    }

    .doc-meta {
      font-size: 0.8rem;
      color: var(--jelly-text-muted);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }

    /* 생성기 판 표기 — 읽는 데 방해되지 않게 흐리게 두되, 눈으로도 찾을 수 있어야 한다.
       기계는 <meta name="generator"> 를 보고 사람은 이 줄을 본다. */
    .doc-meta .doc-generator {
      font-size: 0.72rem;
      color: var(--jelly-text-subtle);
      font-variant-numeric: tabular-nums;
    }

    .doc-chips-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 0.8rem;
    }

    /* Jelly 태그/메타 칩 */
    .jelly-chip {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: var(--jelly-radius-pill);
      font-size: 0.74rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      border: none;
      background: var(--jelly-bg-subtle);
      color: var(--jelly-text-muted);
    }

    .jelly-chip-type { background: var(--jelly-accent-subtle); color: var(--jelly-accent-text); border-color: var(--jelly-accent-border); }
    .jelly-chip-status { background: rgba(16, 185, 129, 0.1); color: #059669; border-color: rgba(16, 185, 129, 0.25); }
    .jelly-chip-confidence { background: rgba(245, 158, 11, 0.1); color: #d97706; border-color: rgba(245, 158, 11, 0.25); }
    .jelly-chip-topic, .jelly-chip-tag { background: var(--jelly-bg-subtle); color: var(--jelly-text-muted); }

    /* Jelly 테마 전환 아이콘 버튼 */
    /* 아래 둘(테마 토글·코드 복사)은 JS 가 있어야만 뜻이 있는 컨트롤이라 기본이 숨김이고,
       스크립트가 실제로 실행됐을 때만 html.js 로 드러난다.
       (이 주석 안에서는 백틱을 쓰지 않는다 — 이 CSS 전체가 템플릿 문자열이라 거기서 끊긴다.)

       iOS 파일 앱의 미리보기 같은 내장 웹뷰는 JavaScript 를 아예 돌리지 않는다. 거기서는
       이 버튼들이 «눌러도 아무 일 없는 장식»이 되는데, 없는 것보다 나쁘다 — 사용자는 기능이
       고장 났다고 읽는다. 플랫폼을 목록으로 짐작하지 않고(오늘 그 방식으로 세 번 틀렸다)
       «JS 가 도는가»라는 실제 조건을 본다. 이미지·다이어그램·구문 강조는 정적이라 그대로 나온다. */
    .jelly-theme-toggle {
      background: var(--jelly-bg-subtle);
      color: var(--jelly-text-default);
      border: 1px solid var(--jelly-border-default);
      width: 34px;
      height: 34px;
      border-radius: var(--jelly-radius-md);
      font-size: 1rem;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      user-select: none;
      padding: 0;
      flex-shrink: 0;
    }

    .jelly-theme-toggle:hover {
      background: var(--jelly-bg-muted);
      transform: scale(1.06);
    }

    /* 본문 마크다운 타이포그래피 */
    .markdown-body h1, .markdown-body h2, .markdown-body h3, 
    .markdown-body h4, .markdown-body h5, .markdown-body h6 {
      margin-top: 1.8rem;
      margin-bottom: 0.75rem;
      font-weight: 700;
      line-height: 1.35;
      color: var(--jelly-text-default);
      letter-spacing: -0.02em;
      word-break: break-word;
    }

    .markdown-body h1 { font-size: 1.48rem; border-bottom: 1px solid var(--jelly-border-default); padding-bottom: 0.3rem; }
    .markdown-body h2 { font-size: 1.25rem; border-bottom: 1px solid var(--jelly-border-default); padding-bottom: 0.3rem; }
    .markdown-body h3 { font-size: 1.08rem; }
    .markdown-body h4 { font-size: 0.98rem; }
    .markdown-body h5 { font-size: 0.88rem; }
    .markdown-body h6 { font-size: 0.80rem; color: var(--jelly-text-muted); }

    .markdown-body p {
      margin-bottom: 1.05rem;
    }

    /* 링크 스타일 */
    .markdown-body a {
      color: var(--jelly-accent-default);
      text-decoration: none;
      font-weight: 500;
      transition: color 0.15s ease;
    }

    .markdown-body a:hover {
      text-decoration: underline;
    }

    /* 옵시디언 위키링크 ([[노트명]]) -> Jelly 알약 칩 스타일 */
    .markdown-body a.obsidian-internal-link,
    .markdown-body a.internal-link {
      display: inline-flex;
      align-items: center;
      background: var(--jelly-accent-subtle);
      color: var(--jelly-accent-text);
      padding: 1px 8px;
      margin: 0 2px;
      border-radius: var(--jelly-radius-sm);
      font-size: 0.9em;
      font-weight: 600;
      text-decoration: none;
      border: 1px solid var(--jelly-accent-border);
      vertical-align: baseline;
      transition: all 0.15s ease;
    }

    .markdown-body a.obsidian-internal-link:hover,
    .markdown-body a.internal-link:hover {
      background: transparent;
      color: #ffffff;
      border-color: var(--jelly-accent-default);
      text-decoration: none;
      transform: translateY(-1px);
      box-shadow: none;
    }

    /* 형광펜 (Highlight: ==text==) */
    .markdown-body mark {
      background-color: transparent;
      color: var(--jelly-mark-text);
      padding: 2px 5px;
      border-radius: var(--jelly-radius-xs);
      font-weight: 500;
    }

    /* 목록 */
    .markdown-body ul, .markdown-body ol {
      margin-bottom: 1.15rem;
      padding-left: 1.6rem;
    }

    .markdown-body li {
      margin-bottom: 0.35rem;
    }

    .markdown-body li > ul, .markdown-body li > ol {
      margin-top: 0.35rem;
      margin-bottom: 0.35rem;
      padding-left: 1.6rem;
    }

    /* 체크박스 / 태스크 목록 */
    .markdown-body ul.contains-task-list {
      padding-left: 0.2rem;
      list-style: none;
    }

    .markdown-body ul.contains-task-list ul.contains-task-list,
    .markdown-body ul.contains-task-list ul,
    .markdown-body li.task-list-item ul {
      padding-left: 1.75rem;
      margin-top: 0.4rem;
      margin-bottom: 0.4rem;
    }

    .markdown-body .task-list-item,
    .markdown-body li:has(input[type="checkbox"]) {
      list-style-type: none;
      margin-left: 0;
      margin-bottom: 0.4rem;
      line-height: 1.6;
    }

    .markdown-body input[type="checkbox"] {
      appearance: none;
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      min-width: 14px;
      min-height: 14px;
      border: 1.5px solid var(--jelly-border-subtle);
      border-radius: 4px;
      background: var(--jelly-bg-card);
      cursor: pointer;
      display: inline-grid;
      place-content: center;
      vertical-align: middle;
      margin: 0 6px 0 0 !important;
      position: relative;
      top: -1px;
      transition: all 0.15s ease;
    }

    .markdown-body input[type="checkbox"]:checked {
      background: var(--jelly-accent-default);
      border-color: var(--jelly-accent-default);
    }

    .markdown-body input[type="checkbox"]:checked::before {
      content: "";
      width: 7px;
      height: 3.5px;
      border-left: 1.8px solid #fff;
      border-bottom: 1.8px solid #fff;
      transform: rotate(-45deg) translate(0.5px, -0.5px);
    }

    /* Jelly 인용구 */
    .markdown-body blockquote {
      margin: 1.3rem 0;
      padding: 0.85rem 1.3rem;
      border-left: 4px solid var(--jelly-accent-default);
      background-color: transparent;
      border-radius: 0 var(--jelly-radius-sm) var(--jelly-radius-sm) 0;
      color: var(--jelly-text-muted);
      font-style: normal;
    }

    .markdown-body blockquote p {
      margin-bottom: 0.55rem;
    }

    .markdown-body blockquote > :last-child {
      margin-bottom: 0 !important;
    }

    .markdown-body blockquote > :first-child {
      margin-top: 0 !important;
    }

    .markdown-body blockquote blockquote {
      margin: 0.75rem 0;
      padding: 0.6rem 1rem;
    }

    /* Jelly 코드 & 코드 블록 */
    .markdown-body code {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 0.88em;
      background-color: transparent;
      color: var(--jelly-code-text);
      padding: 0.2em 0.45em;
      border-radius: var(--jelly-radius-sm);
      border: 1px solid var(--jelly-code-border);
    }

    /* 넘칠 수 있는 것 셋 — **페이지가 아니라 자기 상자가 감당한다.**
       내보낸 문서는 어느 폭에서 열릴지 알 수 없는데, 넘치는 것을 페이지가 감당하면 본문 전체가
       가로로 밀려 글줄까지 잘린다. 셋을 한자리에 묶어 두는 것은 **하나가 빠지면 그 하나에서
       페이지가 밀리기 때문**이다(실제로 표만 빠져 있었다). 인쇄에서 푸는 예외도 같은 셋이다. */
    .markdown-body pre,
    .markdown-body .jelly-table-scroll,
    .markdown-body .mermaid-rendered {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .markdown-body pre {
      position: relative;
      background-color: transparent;
      padding: 1.2rem 1.3rem;
      border-radius: var(--jelly-radius-md);
      margin: 1.4rem 0;
      border: none;
      box-shadow: none;
    }

    .markdown-body pre code {
      background: none;
      padding: 0;
      border: none;
      font-size: 0.9rem;
      line-height: 1.6;
    }

    /* 코드 블록 복사 버튼 */
    html.js .jelly-theme-toggle { display: none; }
    html.js .markdown-body .copy-code-button { display: inline-flex; }

    .markdown-body .copy-code-button {
      display: none;
      position: absolute;
      top: 9px;
      right: 9px;
      background: var(--jelly-bg-card);
      color: var(--jelly-text-muted);
      border: 1px solid var(--jelly-border-default);
      border-radius: var(--jelly-radius-sm);
      padding: 3px 8px;
      font-size: 0.76rem;
      font-weight: 600;
      cursor: pointer;
      align-items: center;
      gap: 4px;
      opacity: 0.6;
      transition: all 0.15s ease;
      z-index: 10;
    }

    .markdown-body pre:hover .copy-code-button {
      opacity: 1;
    }

    .markdown-body .copy-code-button:hover {
      background: var(--jelly-accent-default);
      color: #fff;
      border-color: var(--jelly-accent-default);
      transform: translateY(-1px);
    }

    /* 구문 강조 (Syntax Highlighting Tokens) */
    .token.comment, .token.prolog, .token.doctype, .token.cdata { color: #64748b; font-style: italic; }
    .token.punctuation { color: #94a3b8; }
    .token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol { color: #d97706; }
    .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin, .token.inserted { color: #059669; }
    .token.operator, .token.entity, .token.url { color: #0284c7; }
    .token.atrule, .token.attr-value, .token.keyword { color: #7c3aed; font-weight: 600; }
    .token.function, .token.class-name { color: #2563eb; }
    .token.regex, .token.important, .token.variable { color: #ea580c; }

    @media screen {
    [data-theme="dark"] .token.comment, [data-theme="dark"] .token.prolog, [data-theme="dark"] .token.doctype, [data-theme="dark"] .token.cdata { color: #64748b; }
    [data-theme="dark"] .token.punctuation { color: #64748b; }
    [data-theme="dark"] .token.property, [data-theme="dark"] .token.tag, [data-theme="dark"] .token.boolean, [data-theme="dark"] .token.number, [data-theme="dark"] .token.constant, [data-theme="dark"] .token.symbol { color: #fbbf24; }
    [data-theme="dark"] .token.selector, [data-theme="dark"] .token.attr-name, [data-theme="dark"] .token.string, [data-theme="dark"] .token.char, [data-theme="dark"] .token.builtin, [data-theme="dark"] .token.inserted { color: #34d399; }
    [data-theme="dark"] .token.operator, [data-theme="dark"] .token.entity, [data-theme="dark"] .token.url { color: #38bdf8; }
    [data-theme="dark"] .token.atrule, [data-theme="dark"] .token.attr-value, [data-theme="dark"] .token.keyword { color: #c084fc; }
    [data-theme="dark"] .token.function, [data-theme="dark"] .token.class-name { color: #60a5fa; }
    [data-theme="dark"] .token.regex, [data-theme="dark"] .token.important, [data-theme="dark"] .token.variable { color: #fb923c; }
    }

    /* Jelly 테이블 — **상자와 표를 나눈다.**
       열이 많은 표는 내용이 요구하는 만큼 넓어지는데, 그것을 페이지가 감당하면 본문 전체가
       가로로 밀려 글줄까지 잘려 나간다. 그래서 스크롤은 표를 감싼 상자가 맡고 테두리·모서리·
       그림자도 그 상자가 갖는다 — 표에 걸면 스크롤할 때 테두리가 같이 흘러가 상자가 깨진다.
       mermaid 도 같은 구조다(.mermaid-rendered). */
    .markdown-body .jelly-table-scroll {
      margin: 1.5rem 0;
      border-radius: var(--jelly-radius-md);
      border: none;
      background: transparent;
      box-shadow: none;
    }

    .markdown-body table {
      /* 좁은 표는 지금까지처럼 폭을 채우고, 넓은 표는 필요한 만큼 넘어간다(상자가 스크롤한다). */
      min-width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin: 0;
      font-size: 0.88rem;
      background: var(--jelly-bg-card);
    }

    .markdown-body th {
      background-color: transparent;
      color: var(--jelly-text-default);
      font-weight: 700;
      padding: 9px 12px;
      border-bottom: 1px solid var(--jelly-border-default);
      border-right: 1px solid var(--jelly-border-default);
      text-align: center !important;
      vertical-align: middle;
      letter-spacing: -0.01em;
    }

    .markdown-body th:last-child {
      border-right: none;
    }

    .markdown-body td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--jelly-border-default);
      border-right: 1px solid var(--jelly-border-default);
      color: var(--jelly-text-default);
      vertical-align: middle;
    }

    .markdown-body td:last-child {
      border-right: none;
    }

    .markdown-body tr:last-child td {
      border-bottom: none;
    }

    .markdown-body tr:nth-child(even) td {
      background-color: transparent;
    }

    .markdown-body tr:hover td {
      background-color: transparent;
    }

    /* 이미지 */
    .markdown-body img {
      max-width: 100%;
      height: auto;
      border-radius: var(--jelly-radius-md);
      margin: 1.3rem auto;
      display: block;
      border: none;
      box-shadow: none;
    }

    /* 옵시디언 Callout (Jelly Card 스펙) */
    .markdown-body .callout {
      margin: 1.3rem 0;
      padding: 1rem 1.25rem;
      border-left: 4px solid var(--jelly-accent-default);
      background-color: transparent;
      border-radius: var(--jelly-radius-md);
      border-top: none;
      border-right: none;
      border-bottom: none;
      box-shadow: none;
    }

    .markdown-body .callout-title {
      font-weight: 700;
      display: flex;
      /* center 로 두면 제목이 여러 줄로 접힐 때(좁은 폰 화면) 아이콘이 제목 «블록» 기준으로
         가운데에 내려앉는다. 아이콘이 붙어야 하는 곳은 첫 줄이므로 위로 정렬한다. */
      align-items: flex-start;
      gap: 6px;
      margin-bottom: 0.45rem;
      color: var(--jelly-text-default);
      font-size: 0.94rem;
      line-height: 1.4;
    }

    .markdown-body .callout-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 0.95em;
      /* 상자 높이를 첫 줄 상자와 같게(= .callout-title 의 line-height) 잡고 그 안에서 가운데
         정렬한다. margin-top 에 보정값을 박는 것보다 낫다 — line-height 를 고쳐도 따라온다. */
      height: 1.4em;
      max-width: 14px;
      color: inherit;
    }

    .markdown-body .callout-icon svg,
    .markdown-body .svg-icon {
      width: 0.95em;
      height: 0.95em;
      max-width: 14px;
      max-height: 14px;
      display: block;
      stroke-width: 2;
    }

    .markdown-body .callout-title-inner {
      font-weight: 700;
      display: inline;
    }

    .markdown-body .callout-content {
      font-size: 0.90rem;
      color: var(--jelly-text-default);
    }

    .markdown-body .callout-content > :last-child {
      margin-bottom: 0;
    }

    /* Callout 유형별 Jelly 테마 */
    .markdown-body .callout[data-callout="info"], .markdown-body .callout[data-callout="todo"] {
      border-left-color: #3b82f6;
      background-color: rgba(59, 130, 246, 0.05);
      border-color: rgba(59, 130, 246, 0.2);
    }
    .markdown-body .callout[data-callout="warning"], .markdown-body .callout[data-callout="warn"], .markdown-body .callout[data-callout="caution"] {
      border-left-color: #f59e0b;
      background-color: rgba(245, 158, 11, 0.06);
      border-color: rgba(245, 158, 11, 0.2);
    }
    .markdown-body .callout[data-callout="danger"], .markdown-body .callout[data-callout="error"], .markdown-body .callout[data-callout="failure"] {
      border-left-color: #ef4444;
      background-color: rgba(239, 68, 68, 0.06);
      border-color: rgba(239, 68, 68, 0.2);
    }
    .markdown-body .callout[data-callout="success"], .markdown-body .callout[data-callout="check"], .markdown-body .callout[data-callout="done"] {
      border-left-color: #10b981;
      background-color: rgba(16, 185, 129, 0.06);
      border-color: rgba(16, 185, 129, 0.2);
    }
    .markdown-body .callout[data-callout="tip"], .markdown-body .callout[data-callout="hint"], .markdown-body .callout[data-callout="important"] {
      border-left-color: #06b6d4;
      background-color: rgba(6, 182, 212, 0.06);
      border-color: rgba(6, 182, 212, 0.2);
    }
    .markdown-body .callout[data-callout="quote"], .markdown-body .callout[data-callout="cite"] {
      border-left-color: #8b5cf6;
      background-color: rgba(139, 92, 246, 0.06);
      border-color: rgba(139, 92, 246, 0.2);
    }
    .markdown-body .callout[data-callout="question"], .markdown-body .callout[data-callout="help"], .markdown-body .callout[data-callout="faq"] {
      border-left-color: #ec4899;
      background-color: rgba(236, 72, 153, 0.06);
      border-color: rgba(236, 72, 153, 0.2);
    }
    .markdown-body .callout[data-callout="bug"] {
      border-left-color: #f43f5e;
      background-color: rgba(244, 63, 94, 0.06);
      border-color: rgba(244, 63, 94, 0.2);
    }
    .markdown-body .callout[data-callout="example"] {
      border-left-color: #6366f1;
      background-color: rgba(99, 102, 241, 0.06);
      border-color: rgba(99, 102, 241, 0.2);
    }

    /* 머메이드(Mermaid) 다이어그램 카드 */
    .markdown-body .mermaid,
    .markdown-body .block-language-mermaid,
    .markdown-body .mermaid-rendered {
      display: flex;
      justify-content: center;
      margin: 1.6rem 0;
      background-color: transparent;
      padding: 1.6rem;
      border-radius: var(--jelly-radius-md);
      border: none;
      box-shadow: none;
    }

    .markdown-body .mermaid svg,
    .markdown-body .block-language-mermaid svg,
    .markdown-body .mermaid-rendered svg {
      max-width: 100%;
      height: auto;
      display: block;
    }

    /* 구분선 */
    .markdown-body hr {
      border: none;
      height: 1px;
      background-color: transparent;
      margin: 2.2rem 0;
    }

    /* 키캡 (<kbd>) */
    .markdown-body kbd {
      background: var(--jelly-bg-subtle);
      border: 1px solid var(--jelly-border-subtle);
      border-bottom-width: 2px;
      border-radius: var(--jelly-radius-xs);
      padding: 2px 6px;
      font-size: 0.82em;
      font-family: inherit;
    }

    /* 인쇄 최적화 */
    @media print {
      body { background: transparent !important; padding: 0; margin: 0; padding: 0; overflow: hidden; height: 100%;} /* edit: body background */
      .jelly-container { box-shadow: none; border: none; padding: 0; max-width: 100%; }
      .jelly-theme-toggle, .copy-code-button { display: none !important; }
      /* 종이는 스크롤이 없다 — 스크롤 상자를 그대로 두면 넘치는 열이 **잘린 채 인쇄된다.**
         넘치게 두면 적어도 프린터의 축소·분할이 그것을 볼 수 있다. */
      .markdown-body .jelly-table-scroll,
      .markdown-body .mermaid-rendered,
      .markdown-body pre { overflow: visible !important; }
    }`;
  }

  /**
   * 브라우저 클라이언트 JS 스크립트 반환
   *
   * 주의: 반환값 전체가 **템플릿 문자열**이다. 그 안에서 백틱을 쓰면 — 주석 안이라도 —
   * 문자열이 그 자리에서 끊겨 `main.js` 자체가 문법 오류가 된다(두 번 밟았다).
   * 코드나 셀렉터를 인용할 때 백틱 대신 그냥 쓰거나 «» 를 쓴다. `${}` 도 같은 이유로
   * 의도한 보간이 아니면 쓰지 않는다. `getJellyStyles()` 도 같은 제약이다.
   */
  getClientScripts() {
    return `    (function() {
      // 0. «JS 가 돈다»는 표시부터 남긴다 — 이 클래스가 붙어야 테마 토글과 복사 버튼이 보인다.
      // JS 를 안 돌리는 뷰어에서는 붙지 않으므로 눌러도 소용없는 버튼이 애초에 안 뜬다.
      // 맨 앞에 두는 이유는 뒤에서 무엇이 잘못돼도 이 표시만은 남게 하려는 것이다.
      document.documentElement.classList.add('js');

      // 1. 테마 토글 핸들러
      const toggleBtn = document.getElementById('theme-toggle');
      const root = document.documentElement;

      const ICON_SUN = '${ICON_SUN}';
      const ICON_MOON = '${ICON_MOON}';

      function updateToggleText(theme) {
        if (toggleBtn) {
          toggleBtn.innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
          toggleBtn.setAttribute('title', theme === 'dark' ? '${t('docToLight')}' : '${t('docToDark')}');
        }
      }

      function setTheme(theme) {
        root.setAttribute('data-theme', theme);
        try {
          localStorage.setItem('single-html-theme', theme);
        } catch (e) {}
        updateToggleText(theme);
      }

      let savedTheme = 'light';
      try {
        savedTheme = localStorage.getItem('single-html-theme') || 'light';
      } catch (e) {}

      setTheme(savedTheme);

      if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
          const current = root.getAttribute('data-theme') || 'light';
          setTheme(current === 'dark' ? 'light' : 'dark');
        });
      }

      // ── 2. 코드 블록 복사 ──────────────────────────────────────────────
      //
      // 복사 방법이 셋인데 **환경을 보고 하나를 «고르지» 않는다.** 되는 것이 나올 때까지
      // 순서대로 시도한다 — 환경 판정은 틀리면 되는 길까지 막는다(그 방식으로 세 번 틀렸다).
      //   1. 숨긴 필드 + execCommand   — iOS 에서도 되는 유일한 길. 동기적이라 매달릴 수 없다
      //   2. 본문 노드 선택 + execCommand — 데스크톱 폴백. iOS 는 편집 가능한 선택만 복사한다
      //   3. navigator.clipboard        — 매달릴 수 있어 마지막이고 타임아웃을 건다
      // 셋 다 실패하면 호출부가 본문을 «선택»해 주고 사용자가 직접 복사하게 한다 —
      // 「복사 실패」가 막다른 길이 되지 않아야 한다.

      const CLIPBOARD_TIMEOUT_MS = 3000;

      function selectNodeContents(el) {
        try {
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(el);
          sel.removeAllRanges();
          sel.addRange(range);
          return sel;
        } catch (e) {
          console.warn('selectNodeContents failed:', e);
          return null;
        }
      }

      // 화면 밖으로 보내면 iOS 에서 선택이 풀리므로 화면 안에 투명하게 둔다. 글자 16px 는
      // iOS 가 그보다 작은 입력에 포커스가 가면 화면을 확대해 버리기 때문이다.
      // focus() 와 select() 가 **둘 다** 있어야 한다 — execCommand('copy') 가 복사하는 것은
      // 「문서 선택」이라, 포커스 없는 필드에 setSelectionRange 만 하면 빈 것을 복사한다.
      function copyViaHiddenField(text) {
        let ta = null;
        try {
          ta = document.createElement('textarea');
          ta.value = text;
          ta.readOnly = false;
          ta.contentEditable = 'true';
          ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          ta.setSelectionRange(0, text.length);
          return document.execCommand('copy');
        } catch (e) {
          console.warn('hidden-field copy failed:', e);
          return false;
        } finally {
          if (ta && ta.parentNode) ta.parentNode.removeChild(ta);
        }
      }

      function copyViaNodeSelection(el) {
        const sel = selectNodeContents(el);
        if (!sel) return false;
        try {
          const ok = document.execCommand('copy');
          if (ok) sel.removeAllRanges();   // 실패하면 선택을 남긴다 — 그게 수동 복사 경로다
          return ok;
        } catch (e) {
          console.warn('node-selection copy failed:', e);
          return false;
        }
      }

      async function copyViaClipboardApi(text) {
        if (!navigator.clipboard) return false;
        try {
          const outcome = await Promise.race([
            navigator.clipboard.writeText(text).then(function() { return 'done'; }),
            new Promise(function(resolve) {
              setTimeout(function() { resolve('timeout'); }, CLIPBOARD_TIMEOUT_MS);
            })
          ]);
          if (outcome === 'done') return true;
          console.warn('clipboard.writeText did not settle within ' + CLIPBOARD_TIMEOUT_MS + 'ms');
        } catch (e) {
          console.warn('clipboard.writeText failed:', e);
        }
        return false;
      }

      async function copyText(text, codeEl) {
        if (copyViaHiddenField(text)) return true;
        if (codeEl && copyViaNodeSelection(codeEl)) return true;
        return copyViaClipboardApi(text);
      }

      // 버튼은 **옵시디언이 이미 구워 넣은 것에 동작을 매단다.** MarkdownRenderer 의 코드블록
      // 후처리가 .copy-code-button 까지 함께 굽기 때문이다. 없을 때만 만드는 것은 옵시디언
      // 버전이 달라 안 구워 주는 경우의 대비책이다 — 「있으면 건너뛴다」로 두면 그 버튼들에
      // 핸들러가 하나도 붙지 않아, 보이는데 눌러도 아무 일 없는 상태가 된다.
      document.querySelectorAll('.markdown-body pre').forEach(function(pre) {
        const codeEl = pre.querySelector('code');
        if (!codeEl) return;

        let btn = pre.querySelector('.copy-code-button');
        if (!btn) {
          btn = document.createElement('button');
          btn.className = 'copy-code-button';
          btn.innerHTML = '${ICON_COPY}';
          pre.appendChild(btn);
        }
        if (btn.dataset.copyBound) return;
        btn.dataset.copyBound = '1';
        btn.type = 'button';
        btn.setAttribute('aria-label', '${t('docCopyCode')}');

        // 조용히 끝나는 경로를 남기지 않는다 — 누르면 무엇이든 반드시 표시된다.
        // 예전에는 본문이 비면 아무 표시 없이 return 했고, clipboard 프라미스가 매달리면
        // 그대로 멈췄다. «눌렀는데 아무 일도 안 일어남» 은 사용자가 원인을 좁힐 수 없는 상태다.
        btn.addEventListener('click', async function() {
          const origHtml = btn.innerHTML;
          const textToCopy = codeEl.innerText || codeEl.textContent || '';
          let label;
          if (!textToCopy) {
            label = '${t('docCopyEmpty')}';
          } else if (await copyText(textToCopy, codeEl)) {
            label = '${t('docCopied')}';
          } else if (selectNodeContents(codeEl)) {
            // 안내 문구를 입력 방식에 맞춘다 — 폰에 «Cmd+C» 를 띄우면 길이 없는 안내가 된다.
            const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
            label = touch ? '${t('docSelectedTouch')}' : '${t('docSelectedKeys')}';
          } else {
            label = '${t('docCopyFailed')}';
          }
          btn.textContent = label;
          setTimeout(function() { btn.innerHTML = origHtml; }, 2500);
        });
      });
    })();`;
  }

  escapeHtml(str) {
    // `if (!str) return ''` 로 두면 0 과 false 가 빈 문자열이 된다 — 프론트매터 값은
    // 무엇이든 들어올 수 있으므로 «비어 있음»만 걸러내고 나머지는 문자열로 만들어 이스케이프한다.
    if (str === null || str === undefined || str === '') return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

module.exports = SingleHtmlExportPlugin;

/* nosourcemap */