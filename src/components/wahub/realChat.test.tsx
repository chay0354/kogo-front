import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { makeContact, makeMessage } from '@/lib/wahub/testFixtures';
import type { WahubContactDetail, WahubMessage } from '@/types/wahub';
import ChatList from './chats/ChatList';
import ChatThread from './chats/ChatThread';
import ContactPanel from './chats/ContactPanel';
import DemoComposer, { BotLine, ImagePreview, RecordingLine, SendField, type DemoReplyControls } from './chats/DemoComposer';
import { LIVE_TEST_LABEL, LIVE_TEST_WARNING, LiveTestView } from './chats/LiveTestBlock';
import MessageBubble, { MediaView, TypingBubble } from './chats/MessageBubble';
import type { ContactThread } from './hooks/useContactThread';
import { wahubKeys } from './hooks/useWahubQueries';
import { LiveTestList } from './settings/SettingsTab';
import s from './wahub.module.css';

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

const NOW = new Date('2026-10-11T12:00:00+03:00');
const noop = () => {};

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
}

function render(node: React.ReactElement, queryClient: QueryClient = client()): string {
  return renderToStaticMarkup(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

/**
 * The elements a component draws, without a browser: a component that keeps no
 * state is called as the function it is, and its tree is walked. Good for
 * pressing a button or a key and seeing what the component does with it.
 */
function elements(node: React.ReactNode): React.ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<{ children?: React.ReactNode }>;
  if (typeof element.type === 'function') {
    try {
      return elements((element.type as (props: unknown) => React.ReactNode)(element.props));
    } catch {
      // A component that keeps state cannot be called this way; what it draws is not walked.
      return [];
    }
  }
  return [element, ...elements(element.props.children)];
}

function find(node: React.ReactNode, match: (props: Record<string, unknown>, type: unknown) => boolean): React.ReactElement {
  const found = elements(node).find((element) => match(element.props as Record<string, unknown>, element.type));
  if (!found) throw new Error('element not found');
  return found;
}

const byLabel = (label: string) => (props: Record<string, unknown>) => props['aria-label'] === label;

function detail(overrides: Parameters<typeof makeContact>[1] = {}): WahubContactDetail {
  return { ...makeContact(12, overrides), messages: [], has_older: false, events: [] };
}

function thread(contact: WahubContactDetail, messages: WahubMessage[] = []): ContactThread {
  return {
    contactId: contact.id,
    contact,
    messages,
    hasOlder: false,
    status: 'ready',
    error: '',
    loadingOlder: false,
    sending: false,
    olderLoads: 0,
    stateRef: { current: {} as never },
    putContact: noop,
    onLiveContact: noop,
    putMessages: noop,
    settleMessage: noop,
    loadOlder: async () => {},
    send: async () => true,
    sendFlow: async () => true,
    refreshQuietly: async () => {},
    retry: noop,
  };
}

const threadProps = {
  now: NOW,
  visible: true,
  simulated: false,
  sendingOff: true,
  handoverBusy: false,
  resolveBusy: false,
  showBack: true,
  showDetailsButton: true,
  onBack: noop,
  onDetails: noop,
  onTakeover: noop,
  onRelease: noop,
  onResolveNeedsHuman: noop,
  onOpenSettings: noop,
};

const REPLY: DemoReplyControls = { auto: true, armed: false, inFlight: false, setAuto: noop, replyNow: noop };

function bubble(message: WahubMessage, queryClient?: QueryClient): string {
  return render(<MessageBubble message={message} arrived={false} />, queryClient);
}

// ---------------------------------------------------------------------------
// "כתוב כלקוח", like WhatsApp
// ---------------------------------------------------------------------------

describe('the customer\'s box of a demo conversation', () => {
  const key = (over: { key?: string; shiftKey?: boolean } = {}) => ({
    key: over.key ?? 'Enter',
    shiftKey: over.shiftKey ?? false,
    nativeEvent: { isComposing: false },
    preventDefault: vi.fn(),
  });

  it('Enter sends: the box hands the press over and swallows the line break', () => {
    const onSend = vi.fn();
    const field = SendField({ value: 'היי', label: 'כתוב כלקוח', placeholder: '', onChange: noop, onSend });
    const event = key();
    field.props.onKeyDown(event);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('Shift+Enter is a new line: nothing is sent', () => {
    const onSend = vi.fn();
    const field = SendField({ value: 'היי', label: 'כתוב כלקוח', placeholder: '', onChange: noop, onSend });
    const event = key({ shiftKey: true });
    field.props.onKeyDown(event);
    expect(onSend).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('the box is never disabled, so the cursor stays in it for the next message', () => {
    const field = SendField({ value: '', label: 'כתוב כלקוח', placeholder: 'כתבו כלקוח…', onChange: noop, onSend: noop });
    expect(field.type).toBe('textarea');
    expect(field.props.disabled).toBeUndefined();
    expect(field.props.readOnly).toBeUndefined();
    // Even while the new bot is answering, the whole box is drawn open.
    const html = render(
      <DemoComposer contact={makeContact(12, { is_demo: true })} onSend={async () => true} reply={{ ...REPLY, inFlight: true }} />,
    );
    expect(html).not.toMatch(/<textarea[^>]*disabled/);
  });

  it('typing reaches the caller as the words themselves', () => {
    const onChange = vi.fn();
    const field = SendField({ value: '', label: 'כתוב כלקוח', placeholder: '', onChange, onSend: noop });
    field.props.onChange({ target: { value: 'שלום' } });
    expect(onChange).toHaveBeenCalledWith('שלום');
  });

  it('the line carries a microphone, a picture button that takes pictures only, the box and send', () => {
    const html = render(<DemoComposer contact={makeContact(12, { is_demo: true })} onSend={async () => true} reply={REPLY} />);
    expect(html).toContain('aria-label="הקלט הודעה קולית"');
    expect(html).toContain('aria-label="צרף תמונה"');
    expect(html).toMatch(/<input[^>]*type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp,image\/heic/);
    expect(html).toContain('placeholder="כתבו כלקוח… Enter שולח"');
    expect(html).toContain('aria-label="הלקוח שלח"');
    expect(html).toContain('שום דבר לא נשלח בוואטסאפ');
  });

  it('while recording: the red dot, how long, a way to drop it, and stop-and-send', () => {
    const onCancel = vi.fn();
    const onStop = vi.fn();
    const line = <RecordingLine phase="recording" elapsedMs={7400} onCancel={onCancel} onStop={onStop} />;
    const html = render(line);
    expect(html).toContain(s.recDot);
    expect(html).toContain('מקליט…');
    expect(html).toContain('0:07');
    (find(line, byLabel('עצור ושלח את ההקלטה')).props as { onClick: () => void }).onClick();
    expect(onStop).toHaveBeenCalledTimes(1);
    (find(line, byLabel('בטל הקלטה')).props as { onClick: () => void }).onClick();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('until the browser hands the microphone over nothing counts, nothing can be sent, and it can still be dropped', () => {
    const onCancel = vi.fn();
    const line = <RecordingLine phase="starting" elapsedMs={0} onCancel={onCancel} onStop={noop} />;
    const html = render(line);
    expect(html).toContain('מחכה לאישור המיקרופון');
    expect(html).not.toContain('מקליט…');
    expect(html).not.toContain('0:00');
    expect(find(line, byLabel('עצור ושלח את ההקלטה')).props.disabled).toBe(true);
    (find(line, byLabel('בטל הקלטה')).props as { onClick: () => void }).onClick();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('a chosen picture is shown small before it goes, with its name, its size and a way to drop it', () => {
    const onRemove = vi.fn();
    const preview = <ImagePreview name="gate.png" size={320 * 1024} url="blob:preview-1" onRemove={onRemove} />;
    const html = render(preview);
    expect(html).toContain('src="blob:preview-1"');
    expect(html).toContain('gate.png');
    expect(html).toContain('320KB');
    expect(html).toContain('כיתוב');
    (find(preview, byLabel('הסר את התמונה')).props as { onClick: () => void }).onClick();
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// The new bot answers in the conversation
// ---------------------------------------------------------------------------

describe('the new bot\'s line', () => {
  it('the switch "הבוט החדש עונה בשיחה" starts on, and pressing it turns it off', () => {
    const setAuto = vi.fn();
    const line = <BotLine reply={{ ...REPLY, setAuto }} oldOpen={false} onToggleOld={noop} />;
    expect(render(line)).toMatch(/role="switch" aria-checked="true"[^>]*>[\s\S]*הבוט החדש עונה בשיחה/);
    (find(line, (props) => props.role === 'switch').props as { onClick: () => void }).onClick();
    expect(setAuto).toHaveBeenCalledWith(false);
  });

  it('"ענה עכשיו" asks for an answer now', () => {
    const replyNow = vi.fn();
    const line = <BotLine reply={{ ...REPLY, replyNow }} oldOpen={false} onToggleOld={noop} />;
    const button = find(line, (props, type) => type === 'button' && props.onClick === replyNow);
    expect(button.props.disabled).toBe(false);
    (button.props as { onClick: () => void }).onClick();
    expect(replyNow).toHaveBeenCalledTimes(1);
  });

  it('while the answer is on its way "ענה עכשיו" is held back and the line says "הבוט כותב…"', () => {
    const replyNow = vi.fn();
    const line = <BotLine reply={{ ...REPLY, inFlight: true, replyNow }} oldOpen={false} onToggleOld={noop} />;
    const html = render(line);
    expect(html).toContain('הבוט כותב…');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*ענה עכשיו/);
    expect(find(line, (props, type) => type === 'button' && props.onClick === replyNow).props.disabled).toBe(true);
  });

  it('during the three seconds it says the answer is a moment away', () => {
    expect(render(<BotLine reply={{ ...REPLY, armed: true }} oldOpen={false} onToggleOld={noop} />)).toContain('עונה בעוד רגע…');
  });

  it('"הבוט כותב…" stands at the end of a demo conversation while the call is out, and only then', () => {
    const demo = detail({ name: 'רונית לב', is_demo: true });
    const messages = [makeMessage(1, { text: 'יש חוג לבן 5?' })];
    const writing = render(
      <ChatThread {...threadProps} thread={thread(demo, messages)} onSimulate={async () => true} demoReply={{ ...REPLY, inFlight: true }} />,
    );
    expect(writing).toContain('aria-label="הבוט כותב"');
    expect(writing).toContain(s.typing);
    const idle = render(<ChatThread {...threadProps} thread={thread(demo, messages)} onSimulate={async () => true} demoReply={REPLY} />);
    expect(idle).not.toContain('הבוט כותב');
    // A real customer's conversation never shows it, whatever the flag says.
    const real = render(
      <ChatThread {...threadProps} thread={thread(detail({ name: 'דנה כהן' }), messages)} onSimulate={async () => true} demoReply={{ ...REPLY, inFlight: true }} />,
    );
    expect(real).not.toContain('הבוט כותב');
    expect(real).not.toContain('כתוב כלקוח');
  });

  it('the typing bubble is the new bot\'s own, in its colour — and named "בוט", it is the bot now (15.10.2026)', () => {
    const html = render(<TypingBubble />);
    expect(html).toContain(s.bNewBot);
    expect(html).toContain(`<span class="${s.newBotMark}">בוט</span>`);
    expect(html).not.toContain('בוט חדש');
    expect(html).toContain('כותב…');
  });
});

describe('the new bot\'s bubble', () => {
  const newBot = makeMessage(40, {
    direction: 'out',
    sender: 'bot',
    sender_label: 'בוט',
    new_bot: true,
    status: 'simulated',
    text: 'בטח! יש שיעור ניסיון בחינם.',
  });
  const oldBot = makeMessage(41, { direction: 'out', sender: 'bot', sender_label: 'בוט', status: 'sent', text: 'שלום' });

  it('is named "בוט" and has a colour of its own, whichever way it reached the screen', () => {
    // The same message, as the answer of reply/ hands it over and as the poll brings it: one payload, one look.
    // The owner, 15.10.2026: it is the bot now — "בוט", with no "חדש".
    const html = bubble(newBot);
    expect(html).toContain(`<span class="${s.newBotMark}">בוט</span>`);
    expect(html).not.toContain('בוט חדש');
    expect(html).toContain(s.bNewBot);
    expect(html).toContain(s.newBotMark);
    expect(html).not.toContain(s.bBot);
    expect(html).toContain('בטח! יש שיעור ניסיון בחינם.');
    // "בוט חדש" already says nothing went out; the gold "הדמיה" mark is the office's.
    expect(html).not.toContain(s.simMark);
  });

  it('the old bot keeps its lavender, and says it is the old one: "בוט ישן"', () => {
    const html = bubble(oldBot);
    expect(html).toContain(s.bBot);
    expect(html).not.toContain(s.bNewBot);
    expect(html).toContain('בוט ישן');
    expect(html).not.toContain('בוט חדש');
  });

  it('in a live test it went out for real: the same bubble, with the sent tick', () => {
    const html = bubble({ ...newBot, status: 'sent' });
    expect(html).toContain(s.bNewBot);
    expect(html).toContain('aria-label="נשלח"');
  });
});

// ---------------------------------------------------------------------------
// Media bubbles
// ---------------------------------------------------------------------------

describe('a recording or a picture in a conversation', () => {
  const SIGNED = 'https://storage.example.test/object/sign/wahub-media/demo/12/a.webm?token=abc';
  const withMedia = (id: number, url: string) => {
    const queryClient = client();
    queryClient.setQueryData(wahubKeys.media(id), { url, expires_in: 3600 });
    return queryClient;
  };

  it('a recording is a player, with its transcript under it', () => {
    const voice = makeMessage(50, { message_type: 'voice', text: '', media_url: 'demo/12/a.webm', has_media: true, transcript: 'יש חוג קפוארה לבן חמש?' });
    const html = bubble(voice, withMedia(50, SIGNED));
    expect(html).toMatch(/<audio[^>]*controls=""/);
    expect(html).toContain(`src="${SIGNED.replace(/&/g, '&amp;')}"`);
    expect(html).toContain('תמלול:');
    expect(html).toContain('יש חוג קפוארה לבן חמש?');
    // The bucket path is never printed, and never used as an address.
    expect(html).not.toContain('demo/12/a.webm"');
    expect(html).not.toContain('>demo/12/a.webm<');
  });

  it('a recording that was not transcribed says so', () => {
    const voice = makeMessage(51, { message_type: 'voice', text: '', media_url: 'demo/12/b.webm', has_media: true, transcript: '' });
    const html = bubble(voice, withMedia(51, SIGNED));
    expect(html).toContain('הקלטה — עוד לא תומללה');
    expect(html).not.toContain('תמלול:');
  });

  it('a picture is a thumbnail that opens large, with its caption under it', () => {
    const url = 'https://storage.example.test/object/sign/wahub-media/demo/12/p.jpg?token=abc';
    const image = makeMessage(52, { message_type: 'image', text: 'זה השער?', media_url: 'demo/12/p.jpg', has_media: true });
    const html = bubble(image, withMedia(52, url));
    expect(html).toContain('aria-label="פתח את התמונה בגדול"');
    expect(html).toContain(s.mediaThumb);
    expect(html).toMatch(/<img[^>]*src="https:\/\/storage\.example\.test[^"]*p\.jpg/);
    expect(html).toContain('זה השער?');
    expect(html).not.toContain('<audio');
  });

  it('until the address is in hand a grey shape of the same size holds the place', () => {
    const image = makeMessage(53, { message_type: 'image', text: '', media_url: 'demo/12/p.jpg', has_media: true });
    const html = bubble(image);
    expect(html).toContain(s.skeleton);
    expect(html).toContain(s.mediaImg);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('demo/12/p.jpg');
  });

  it('voice or image with no file: "🎤 הודעה קולית" / "🖼️ תמונה", never a raw address', () => {
    const voice = bubble(makeMessage(54, { message_type: 'voice', text: '' }));
    expect(voice).toContain('🎤 הודעה קולית');
    expect(voice).not.toContain('<audio');
    const address = 'https://cdn.example.com/media/x9';
    const image = bubble(makeMessage(55, { message_type: 'image', text: address }));
    expect(image).toContain('🖼️ תמונה');
    expect(image).not.toContain(`>${address}<`);
    // The address is still a press away.
    expect(image).toContain(`href="${address}"`);
    expect(image).toContain('פתח את הקובץ');
  });

  it('an old message kept as text with ManyChat\'s file address plays straight from it', () => {
    const ogg = 'https://manybot-files.s3.eu-central-1.amazonaws.com/1234/ig_messages/voice_1.ogg';
    const html = bubble(makeMessage(56, { message_type: 'text', text: ogg }));
    expect(html).toMatch(/<audio[^>]*controls=""/);
    expect(html).toContain(`src="${ogg}"`);
    expect(html).not.toContain(`>${ogg}<`);
    expect(html).toContain('הקלטה — עוד לא תומללה');

    const jpg = 'https://manybot-files.s3.eu-central-1.amazonaws.com/1234/wa/photo_2.jpg';
    const picture = bubble(makeMessage(57, { message_type: 'text', text: jpg }));
    expect(picture).toContain(`<img src="${jpg}"`);
    expect(picture).toContain('aria-label="פתח את התמונה בגדול"');
    expect(picture).not.toContain(`>${jpg}<`);
  });

  it('a link inside a sentence is still a sentence', () => {
    const text = 'תראו https://manybot-files.s3.eu-central-1.amazonaws.com/1/a.ogg';
    const html = bubble(makeMessage(58, { text }));
    expect(html).toContain(text);
    expect(html).not.toContain('<audio');
  });

  it('a recording that was not transcribed says why, in the server\'s words — and only on a customer\'s message', () => {
    const why = 'אין יתרה בחשבון OpenAI — התמלול לא עובד עד שמטעינים';
    const html = render(<MediaView kind="voice" url="https://files.test/a.ogg" state="ready" transcript="" problem={why} />);
    expect(html).toContain('לא תומללה:');
    expect(html).toContain(why);
    expect(html).not.toContain('עוד לא תומללה');
    // With a transcript the reason is history.
    const heard = render(<MediaView kind="voice" url="https://files.test/a.ogg" state="ready" transcript="היי" problem={why} />);
    expect(heard).toContain('תמלול:');
    expect(heard).not.toContain('לא תומללה');
    // No reason: still waiting.
    expect(render(<MediaView kind="voice" url="https://files.test/a.ogg" state="ready" transcript="" />)).toContain('הקלטה — עוד לא תומללה');
  });

  it('a file that could not be loaded says so, with a way to try again', () => {
    const onRetry = vi.fn();
    const view = <MediaView kind="voice" url={null} state="error" transcript="" onRetry={onRetry} />;
    const html = render(view);
    expect(html).toContain('לא הצלחנו לטעון את הקובץ');
    expect(html).not.toContain('<audio');
    (find(view, (props, type) => type === 'button' && props.children === 'נסו שוב').props as { onClick: () => void }).onClick();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a recording just "sent" shows as its placeholder, being sent, until the server\'s copy takes its place', () => {
    const typed = makeMessage(-7, { message_type: 'voice', text: '', local_state: 'sending' });
    const html = bubble(typed);
    expect(html).toContain('🎤 הודעה קולית');
    expect(html).toContain('נשלח…');
  });
});

// ---------------------------------------------------------------------------
// Live test
// ---------------------------------------------------------------------------

describe('the live-test switch in the contact\'s details', () => {
  const view = (over: Partial<Parameters<typeof LiveTestView>[0]> = {}) => (
    <LiveTestView name="דור סער" on={false} canEdit busy={false} asking={false} onAsk={noop} onCancel={noop} onToggle={noop} {...over} />
  );
  const isSwitch = (props: Record<string, unknown>) => props.role === 'switch';

  it('says what it does, with one line of warning', () => {
    const html = render(view());
    expect(html).toContain(LIVE_TEST_LABEL);
    expect(LIVE_TEST_LABEL).toBe('בדיקה חיה: הבוט החדש עונה לו באמת');
    expect(html).toContain(LIVE_TEST_WARNING);
    expect(LIVE_TEST_WARNING).toContain('הודעות יישלחו לאיש הקשר הזה בוואטסאפ');
    expect(html).toMatch(/role="switch" aria-checked="false"/);
  });

  it('turning it on asks first — real messages go out from that moment — and "הפעל" is what reaches the server', () => {
    const onAsk = vi.fn();
    const onToggle = vi.fn();
    (find(view({ onAsk, onToggle }), isSwitch).props as { onClick: () => void }).onClick();
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();

    const asking = view({ asking: true, onToggle });
    const html = render(asking);
    expect(html).toContain('להפעיל בדיקה חיה ל');
    expect(html).toContain('דור סער');
    const confirm = elements(asking).find(
      (element) => element.type === 'button' && elements(element).length > 0 && renderToStaticMarkup(element).includes('הפעל בדיקה חיה'),
    );
    (confirm!.props as { onClick: () => void }).onClick();
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('turning it off is done at once', () => {
    const onAsk = vi.fn();
    const onToggle = vi.fn();
    const on = view({ on: true, onAsk, onToggle });
    expect(render(on)).toMatch(/role="switch" aria-checked="true"/);
    expect(render(on)).toContain(s.liveBoxOn);
    (find(on, isSwitch).props as { onClick: () => void }).onClick();
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onAsk).not.toHaveBeenCalled();
  });

  it('while the server is asked the switch waits', () => {
    expect(find(view({ busy: true }), isSwitch).props.disabled).toBe(true);
  });

  it('whoever is not a manager sees the state and no switch', () => {
    const html = render(view({ canEdit: false, on: true }));
    expect(html).not.toContain('role="switch"');
    expect(html).toContain('פעילה');
  });

  const panelProps = {
    now: NOW,
    today: '2026-10-11',
    allTags: [],
    analyzing: false,
    rechecking: false,
    showBack: true,
    onBack: noop,
    onFollowup: noop,
    onTags: noop,
    onRename: noop,
    onRecheck: noop,
    onAnalyze: noop,
  };
  const liveTest = { canEdit: true, busy: false, onToggle: noop };

  it('the details carry it when the tab passes it — on a phone\'s details screen as beside the conversation', () => {
    // A folded section of the card: the title, and the switch a press away.
    const folded = render(<ContactPanel {...panelProps} contact={detail({ name: 'דור סער', live_test: false })} liveTest={liveTest} />);
    expect(folded).toContain('בדיקה חיה');
    expect(folded).not.toContain(LIVE_TEST_LABEL);
    const alone = render(
      <ContactPanel {...panelProps} contact={detail({ name: 'דור סער', live_test: false })} liveTest={liveTest} defaultOpen={['liveTest']} />,
    );
    expect(alone).toContain(LIVE_TEST_LABEL);
    expect(alone).toContain(LIVE_TEST_WARNING);
    const beside = render(
      <ContactPanel
        {...panelProps}
        showBack={false}
        contact={detail({ name: 'דור סער', live_test: true })}
        liveTest={liveTest}
        defaultOpen={['liveTest']}
      />,
    );
    expect(beside).toMatch(/role="switch" aria-checked="true"/);
  });

  it('while it is on, the folded title says so and the card carries the tag beside the name', () => {
    const html = render(
      <ContactPanel {...panelProps} showBack={false} contact={detail({ name: 'דור סער', live_test: true })} liveTest={liveTest} />,
    );
    expect(html).toContain('פעילה');
    // The tag in "מי": real messages go out to this person.
    expect(html).toContain('title="בדיקה חיה – הבוט החדש עונה לו באמת בוואטסאפ"');
    expect(html).not.toContain(LIVE_TEST_WARNING);
  });

  it('and do not when it is not passed: a demo contact, a server that does not know the live test', () => {
    const html = render(<ContactPanel {...panelProps} contact={detail({ name: 'רונית לב', is_demo: true })} />);
    expect(html).not.toContain('בדיקה חיה');
  });
});

describe('the "בדיקה חיה" tag', () => {
  const listProps = {
    status: 'ready' as const,
    error: '',
    hasMore: false,
    loadingMore: false,
    box: 'all' as const,
    counts: { all: 2, waiting: 0, needs_human: 0, unread: 0, human: 0, bot: 2 },
    search: '',
    selectedId: null,
    now: NOW,
    notConnected: false,
    onSearch: noop,
    onBox: noop,
    onOpen: noop,
    onLoadMore: noop,
    onRetry: noop,
    onOpenSettings: noop,
  };

  it('marks the row of whoever is in a live test, and nobody else', () => {
    const html = render(
      <ChatList {...listProps} items={[makeContact(1, { name: 'דור סער', live_test: true }), makeContact(2, { name: 'דנה כהן', live_test: false })]} />,
    );
    expect(html.match(/>בדיקה חיה</g)).toHaveLength(1);
    expect(render(<ChatList {...listProps} items={[makeContact(2, { name: 'דנה כהן' })]} />)).not.toContain('בדיקה חיה');
  });

  it('stands in the conversation\'s header, and in the phone\'s state line under the name', () => {
    const html = render(<ChatThread {...threadProps} thread={thread(detail({ name: 'דור סער', live_test: true }))} />);
    expect(html).toContain('>בדיקה חיה<');
    expect(html).toContain('בדיקה חיה · הבוט עונה');
    expect(render(<ChatThread {...threadProps} thread={thread(detail({ name: 'דנה כהן' }))} />)).not.toContain('בדיקה חיה');
  });

  it('the office\'s own box still follows the general switch: a live test opens the bot\'s answers, not this box', () => {
    const html = render(<ChatThread {...threadProps} sendingOff thread={thread(detail({ name: 'דור סער', live_test: true }))} />);
    expect(html).toContain('השליחה ללקוחות כבויה');
    expect(html).not.toContain('<textarea');
  });
});

describe('the live-test list in the settings', () => {
  const people = [makeContact(1, { name: 'דור סער', live_test: true }), makeContact(2, { name: '', live_test: true })];

  it('lists who the new bot answers for real, each with the way to the conversation and a way to stop', () => {
    const onOpenChat = vi.fn();
    const onStop = vi.fn();
    const list = <LiveTestList contacts={people} total={2} stoppingId={null} onOpenChat={onOpenChat} onStop={onStop} />;
    const html = render(list);
    expect(html).toContain('דור סער');
    expect(html).toContain('050-0000001');
    // No name: the phone stands in for it.
    expect(html).toContain('050-0000002');
    expect(html.match(/>בדיקה חיה</g)).toHaveLength(2);
    expect(html.match(/>לשיחה</g)).toHaveLength(2);

    (find(list, byLabel('כבה את הבדיקה החיה של דור סער')).props as { onClick: () => void }).onClick();
    expect(onStop).toHaveBeenCalledWith(people[0]);
    const open = elements(list).filter((element) => element.type === 'button' && element.props.children === 'לשיחה');
    (open[1].props as { onClick: () => void }).onClick();
    expect(onOpenChat).toHaveBeenCalledWith(2);
  });

  it('nobody in a live test: says so, and where it is turned on', () => {
    const html = render(<LiveTestList contacts={[]} total={0} stoppingId={null} onOpenChat={noop} onStop={noop} />);
    expect(html).toContain('אין אנשי קשר בבדיקה חיה');
    expect(html).toContain('מפרטי איש הקשר');
  });

  it('the server counts more than the list could read: the gap is said, not hidden', () => {
    const html = render(<LiveTestList contacts={[people[0]]} total={3} stoppingId={null} onOpenChat={noop} onStop={noop} />);
    expect(html).toContain('יש עוד 2 אנשי קשר בבדיקה חיה שלא מוצגים כאן.');
  });

  it('while one is being stopped the buttons wait', () => {
    const list = <LiveTestList contacts={people} total={2} stoppingId={1} onOpenChat={noop} onStop={noop} />;
    expect(find(list, byLabel('כבה את הבדיקה החיה של דור סער')).props.disabled).toBe(true);
  });
});
