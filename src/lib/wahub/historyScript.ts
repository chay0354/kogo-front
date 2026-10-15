/**
 * The few lines the owner pastes into ManyChat once (the owner, 14.10.2026: "אני צריך את כל השיחות שהיו שיהיה
 * לי אותם"). ManyChat gives no way to read a conversation from outside it, so his own session there reads every
 * WhatsApp conversation through the inbox's own calls — the same ones its screen makes — and hands him one file
 * (kogo-manychat-history.json), which he picks on Kogo's import page (lib/wahub/historyFile.ts).
 *
 * Read only: nothing in ManyChat is sent, changed or deleted. The address of the session stays in the page — the
 * file holds the conversations and nothing else.
 *
 * What ManyChat's inbox answers (read 6.10.2026): `im/loadThreads` (POST, 100 a page, `limiter` for the next one)
 * lists every conversation — `user_id`, `user.name`, `user.wa_id`, `last_lc_event_channel`; `im/loadMessages`
 * (20 events a page, newest first, `limiter` for the earlier ones) gives `type` — `msgin_*` the customer's,
 * `msgout_lc_*` the office's, `msgout_*` the bot's and the templates — `timestamp`, `message_id` and `model`.
 *
 * Plain old JavaScript, as the console of any browser takes it.
 */
export const HISTORY_FILE_NAME = 'kogo-manychat-history.json';
export const HISTORY_FILE_KIND = 'kogo-manychat-history';

export const MANYCHAT_SCRIPT = `(async function () {
  var ACCOUNT = '/fb5259597';
  var say = function (text) { console.log('%cKogo%c ' + text, 'color:#fff;background:#5b4bd5;padding:2px 6px;border-radius:4px', ''); };
  if (location.origin !== 'https://app.manychat.com' || location.pathname.indexOf(ACCOUNT) !== 0) {
    say('צריך להריץ את זה בתוך ManyChat, בחשבון של קוגומלו');
    return;
  }
  var wait = function (ms) { return new Promise(function (done) { setTimeout(done, ms); }); };
  var init = window.__INIT__ || {};
  var csrf = init['app.csrf_token'] || (init.app && init.app.csrf_token) || '';
  var bundleKey = Object.keys(init).filter(function (key) { return /bundle/i.test(key); })[0];
  var bundle = bundleKey ? String(init[bundleKey]) : '';
  var set = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (/^x-csrf-token$/i.test(name) && !csrf) csrf = value;
    if (/^x-frontend-bundle$/i.test(name)) bundle = value;
    return set.apply(this, arguments);
  };
  for (var tries = 0; tries < 20 && (!csrf || !bundle); tries++) await wait(500);
  XMLHttpRequest.prototype.setRequestHeader = set;
  if (!csrf) {
    say('לא מצאתי את החיבור של ManyChat. ללחוץ על שיחה כלשהי, ולהדביק שוב');
    return;
  }
  var ask = async function (url, options) {
    options = options || {};
    for (var attempt = 0; attempt < 4; attempt++) {
      try {
        var headers = Object.assign({
          'Accept': 'application/json, text/plain, */*',
          'Use-New-Error-Format': 'True',
          'X-Requested-With': 'XMLHttpRequest',
          'X-Csrf-Token': csrf,
          'X-Frontend-Bundle': bundle || '1478'
        }, options.headers || {});
        var answer = await fetch(url, { method: options.method || 'GET', body: options.body, headers: headers, credentials: 'include' });
        if (answer.ok) return await answer.json();
        if (answer.status === 401 || answer.status === 403) return null;
      } catch (error) {}
      await wait(2000 * (attempt + 1));
    }
    return null;
  };

  var body = JSON.stringify({ limit: 100, sorting: 'newest', filter: { operator: 'AND', groups: [{ operator: 'OR', items: [{ type: 'thread:status', field: 'thread:status', operator: 'IS', value: 'all' }] }] } });
  var threads = [];
  var seen = {};
  var limiter = null;
  for (var page = 0; page < 400; page++) {
    var list = await ask(ACCOUNT + '/im/loadThreads' + (limiter ? '?limiter=' + encodeURIComponent(limiter) + '&limiter_type=early' : ''), { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' } });
    if (!list) {
      say('ManyChat לא החזיר את רשימת השיחות. לרענן את הדף ולהדביק שוב');
      return;
    }
    (list.threads || []).forEach(function (thread) {
      var id = String(thread.user_id || '');
      if (thread.last_lc_event_channel !== 'whatsapp' || !id || seen[id]) return;
      seen[id] = true;
      var user = thread.user || {};
      threads.push({ id: id, name: user.name || '', phone: String(user.wa_id || '') });
    });
    if (!(list.threads || []).length || !list.limiter) break;
    limiter = list.limiter;
  }
  say('נמצאו ' + threads.length + ' שיחות וואטסאפ. קורא אותן — כמה דקות…');

  var kind = function (type) {
    type = String(type || '');
    if (!type || type === 'text') return 'text';
    if (/image|photo|sticker|gif/.test(type)) return 'image';
    if (/audio|voice/.test(type)) return 'voice';
    return 'other';
  };
  var lines = function (events) {
    var out = [];
    events.forEach(function (event) {
      var type = String(event.type || '');
      var model = event.model || {};
      var at = event.timestamp;
      var id = String(event.message_id || event.id || (type + ':' + at));
      if (type.indexOf('msgin') === 0) {
        out.push({ id: id, at: at, from: 'customer', text: model.text || model.caption || model.title || '', type: kind(model.type) });
      } else if (type.indexOf('msgout') === 0) {
        var office = type.indexOf('msgout_lc') === 0;
        var parts = model.messages && model.messages.length ? model.messages : [{ type: model.type, content: model }];
        parts.forEach(function (part, index) {
          var content = part.content || {};
          var template = !content.text && !!content.body;
          out.push({
            id: id + ':' + index, at: at, from: template ? 'system' : (office ? 'office' : 'bot'),
            text: content.text || content.body || content.caption || '', type: template ? 'template' : kind(part.type)
          });
        });
      }
    });
    return out;
  };
  var moment = function (line) { var number = Number(line.at); return isFinite(number) ? number : (Date.parse(line.at) || 0) / 1000; };
  var read = async function (thread) {
    var all = [];
    var before = null;
    for (var page = 0; page < 80; page++) {
      var answer = await ask(ACCOUNT + '/im/loadMessages?user_id=' + thread.id + '&limit=50&type=whatsapp' + (before ? '&limiter=' + encodeURIComponent(before) : ''));
      if (!answer) return null;
      all = all.concat(lines(answer.messages || []));
      if (!(answer.messages || []).length || !answer.limiter) break;
      before = answer.limiter;
    }
    all.sort(function (a, b) { return moment(a) - moment(b); });
    return all.slice(-600);
  };

  var conversations = [];
  var failed = 0;
  var next = 0;
  var done = 0;
  var worker = async function () {
    while (next < threads.length) {
      var thread = threads[next++];
      var messages = await read(thread);
      if (messages === null) failed++;
      else if (messages.length) conversations.push({ subscriber_id: thread.id, phone: thread.phone, name: thread.name, messages: messages });
      done++;
      if (done % 100 === 0) say('נקראו ' + done + ' מתוך ' + threads.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  var file = { kind: '${HISTORY_FILE_KIND}', version: 1, made_at: new Date().toISOString(), found: threads.length, failed: failed, conversations: conversations };
  var link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
  link.download = '${HISTORY_FILE_NAME}';
  document.body.appendChild(link);
  link.click();
  link.remove();
  say('הקובץ ירד (' + conversations.length + ' שיחות' + (failed ? ', ' + failed + ' לא נקראו' : '') + '). לחזור ל-Kogo ולבחור אותו');
})();`;
