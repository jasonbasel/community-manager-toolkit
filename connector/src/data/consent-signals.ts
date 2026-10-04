/**
 * Opt-out and removal wording in ledger notes (guardrails §12), as data for src/text/consent.ts.
 * Detection is broad and conservative: a false positive holds two people until the manager confirms;
 * a false negative would drop an opt-out. Every pattern runs on one clause at a time, lowercased, with
 * accents and apostrophes removed and punctuation turned into single spaces ("don't" → "dont",
 * "opt-out" → "opt out"), padded with a space at each end.
 *
 * Two layers: standalone phrases that always signal (DNC, unsubscribed, opted out, "reported as spam",
 * GDPR, "delete my data" …) and a lexical net — a CONTACT term and a REFUSAL term in the same clause
 * ("does not wish to be contacted", "asked to not be emailed", "no more intros", "don't reach out").
 * Descriptive negations are exempt from the net when the clause only reports what happened ("no reply
 * to my email", "stopped replying to messages", "never contacted") and nothing in it expresses a wish.
 */

/** Work cap per note: longer notes are read up to here and reported as truncated. */
export const MAX_NOTE_CHARS = 10_000;
export const MAX_NOTE_CLAUSES = 500;

/**
 * Clause boundaries: . , ; : ! ? — – ( ) [ ] / , a hyphen that is not inside a word (so "opt-out",
 * "e-mail" and "2026-09-30" stay whole), and the words "and", "but" and "then". A negation never
 * reaches across one of these ("Not a fit (DNC)", "No reply and unsubscribed").
 */
export const CLAUSE_SPLIT = /[.,;:!?()[\]/—–]|(?<![\p{L}\p{N}])-|-(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])(?:and|but|then)(?![\p{L}\p{N}])/gu;

/** Rewrites applied to the folded note before clause splitting: abbreviations whose dots would split them, compounds made one token. */
export const NOTE_REWRITES: readonly (readonly [RegExp, string])[] = [
  [/\bd\s?\.?\s?n\s?\.?\s?c\b\.?/g, " dnc "], // D.N.C., D N C, d.n.c
  [/\bno[- ]shows?\b/g, " noshow "], // attendance, not a refusal
  [/\bfollow[- ]?(ups?|ing up|ed up)\b/g, " followup "],
  [/\breach(?:ed|es|ing)?[- ]out\b/g, " reachout "],
  [/\be[- ]mail(s|ed|ing)?\b/g, " email$1 "],
];

/** "STOP" in capitals in the raw note (the WhatsApp/SMS keyword) always signals; checked before folding. */
export const STOP_KEYWORD = /(?<![A-Z])STOP(?![A-Z])/;

export interface SignalRule { id: string; re: RegExp }

/**
 * The only negations that cancel a phrase, and only the phrase they directly precede: "not opted out",
 * "no longer opted out", "never unsubscribed", "don't forget" (forget only). Everything else that
 * mentions a signal phrase counts, however it is qualified ("No longer interested — DNC").
 */
const NEG = String.raw`(?:not|never|no longer|didnt|did not|hasnt|has not|havent|have not|hadnt|had not|doesnt|does not|dont|do not|wont|will not|isnt|is not|arent|are not|wasnt|was not|werent|were not)`;
/** "stopped replying", "stopped coming": reports what happened, not a request to stop contact. */
export const STOPPED_REPORTING = /\b(?:stop(?:ped|s|ping)?|no further|no longer|doesnt|does not|didnt|did not|never|hasnt|has not|havent|have not|wont|will not)\s+(?:(?!(?:want|wants|wanted|wish|wishes|wished|like|care|prefer|intend|plan|mean)\b)\w+\s+){0,2}?(?:repl(?:y|ies|ied|ying)|respon(?:d|ds|ded|ding|se|ses)|answer(?:s|ed|ing)?|engag\w*|coming|attending|showing up|turning up|works?|working|valid|active|bounc\w*|deliver\w*)\b/g;

export const SIGNAL_CANCELLERS: readonly RegExp[] = [
  new RegExp(String.raw`\b${NEG}\s+(?:yet\s+|actually\s+|formally\s+|ever\s+|been\s+|officially\s+)*opt(?:ed|s|ing)?\s?out\b`, "g"),
  new RegExp(String.raw`\b${NEG}\s+(?:yet\s+|actually\s+|formally\s+|ever\s+|been\s+|officially\s+)*unsub(?:scrib\w*|bed|s|bing)?\b`, "g"),
  /\b(?:dont|do not|never|not|didnt|did not|wont|will not|cant|cannot|couldnt|could not|mustnt|must not|shouldnt|should not|lets not)\s+(?:ever\s+)?forget\b/g,
  STOPPED_REPORTING,
];

/** Opt-out of messages: standalone phrases that always signal. */
export const OPT_OUT_SIGNALS: readonly SignalRule[] = [
  { id: "dnc", re: /\bdnc\b/ },
  // no consent given at all: "has not consented to contact", "no consent", "never opted in"
  { id: "no_consent", re: /\b(?:has not|hasnt|have not|havent|had not|hadnt|did not|didnt|never|not|no)\s+(?:yet\s+|actually\s+|formally\s+)?(?:given\s+)?(?:consent(?:ed)?|agreed to (?:be )?contact\w*|opted in)\b/ },
  { id: "opt_out", re: /\bopt(?:ed|s|ing)?\s?out\b/ },
  { id: "unsubscribe", re: /\bunsub(?:scrib\w*|bed|s|bing)?\b/ },
  { id: "stop_keyword", re: /\b(?:replied|replies|texted|texts|sent|said|typed|answered|responded|wrote|messaged|messages)\s+(?:with\s+|back\s+)?(?:the word\s+|a\s+)?stop\b/ },
  { id: "spam", re: /\b(?:reported|marked|flagged|filed|treated|classed|classified)\s+(?:us|it|me|this|them|the message|the email)?\s*as spam\b|\bspam (?:complaint|report|folder|button)\b|\bmarked spam\b/ },
  { id: "blocked", re: /\bblock(?:ed|s)?\s+(?:us|me|our (?:number|messages|emails|account)|the (?:number|sender|account)|my number|on whatsapp|on linkedin|on telegram|everyone)\b/ },
  { id: "no_contact", re: /\bno contact\b(?! (?:details?|info|information|number|email|address|data|yet|so far|on file|on record|since|for|in|after|from|with|at|until|before))/ },
  { id: "asked_to_stop", re: /\b(?:asked|asks|wants?|wanted|told|requested|would like|begged)(?:\s+\w+){0,3}?\s+to\s+stop\b/ },
  { id: "remove_from", re: /\b(?:remove|take|took|strike|struck|delete|leave|left|keep|kept)[ds]?\b(?:\s+\w+){0,3}?\s+(?:from|off|out of)\b(?:\s+\w+){0,2}?\s+(?:lists?|intros?|introductions?|outreach|mailings?|contacts?|directory|database|community|requests?|everything|groups?|chats?|whatsapp|newsletters?|invitations?|rota|programme|program|network|campaigns?|comms|marketing)\b/ },
  { id: "asked_removed", re: /\b(?:asked|asks|wants?|wanted|would like|requested|needs?|prefers?)\s+to be (?:removed|taken off|taken out|left out|left off|excluded|deleted|dropped|forgotten|erased|left alone)\b/ },
  { id: "remove_me", re: /\b(?:remove|delete|erase|unsubscribe|exclude|drop|forget|wipe|purge)\s+me\b/ },
  { id: "withdraw_consent", re: /\b(?:withdr[ae]w\w*|revok\w*|retract\w*)\s+(?:their |his |her |my |all |the )?(?:consent|permission)\b|\b(?:consent|permission) (?:was |has been |is |now )?(?:withdrawn|revoked|retracted)\b/ },
  { id: "erase_person", re: /\b(?:delete|erase|remove|wipe|purge|destroy|scrub|forget)\w*\s+(?:all\s+)?(?:of\s+)?(?:my|their|his|her|the (?:members?|persons?))\s+(?:personal\s+)?(?:data|account|profile|records?|details|information|info|contact details|personal details|personal information|everything|number|email|name|entry)\b/ },
  { id: "forget_me", re: /\bforget (?:me|him|her|them|about (?:me|him|her|them))\b/ },
  { id: "be_forgotten", re: /\b(?:right to be|wants? to be|wanted to be|asked to be|asks to be|would like to be|wish(?:es)? to be) forgotten\b/ },
  { id: "erasure", re: /\berasure\b/ },
  { id: "gdpr", re: /\bgdpr\b/ },
];

/**
 * The lexical net. A clause signals ("contact_refusal") when a CONTACT term co-occurs with a STRONG
 * refusal (an instruction or wish), or with a WEAK negation that is tied to a wish ("asked that she not
 * be emailed") or to "(to) be <contacted>". A clause that only reports what happened (REPORTING words
 * such as reply, bounced, yet, on file, have) and holds no WISH word is exempt: "no reply to my email",
 * "never contacted", "stopped replying to messages", "doesn't have an email".
 */
export const CONTACT_TERMS = /\b(?:contact(?:s|ed|ing)?|messag(?:e|es|ed|ing)|msgs?|emails?|emailed|emailing|reachout|calls?|called|calling|texts?|texted|texting|pings?|pinged|pinging|followup|invit(?:e|es|ed|ing|ation|ations)|newsletters?|marketing|intros?|introductions?|introduc(?:e|ed|ing)|outreach|approach(?:es|ed|ing)?|dms?|nudg(?:e|es|ed|ing)|comms|mailings?|whatsapp|sms)\b/;
export const STRONG_REFUSALS = new RegExp(String.raw`\b(?:stop(?:ped|s|ping)?|cease(?:d|s)?|should not|shouldnt|must not|mustnt|ought not|no more|no further|no longer|never again|remov(?:e|ed|es|ing)|refus(?:e|ed|es|ing)|declin(?:e|ed|es|ing) (?:all|any|further|more)|block(?:ed|s|ing)?|(?:do not|dont|does not|doesnt|did not|didnt|will not|wont|would not|wouldnt|cannot|cant) (?:wish|want|like|care|accept|welcome)|wish(?:es|ed)? not|not (?:to )?(?:wish|want|like|accept|welcome)|(?:not|no longer) open to|not welcome|unwelcome|asked (?:\w+ ){0,2}?(?:to )?not|told (?:\w+ ){0,2}?(?:to )?not|not to be|(?:do not|dont|does not|doesnt|will not|wont)(?:\s+(?!(?:have|has|had|got|get|know\w*|use\w*|own\w*|hold\w*|keep\w*|see\w*|recall\w*|remember\w*)\b)\w+){0,2}?\s+(?:contact\w*|messag\w*|e-?mail\w*|call\w*|text\w*|ping\w*|invit\w*|introduc\w*|approach\w*|nudg\w*|dms?|reachout|followup|chas\w*|bother\w*|send\w*|add|include|share|reach|reply ?all|cc|loop|copy)\b|never (?:ever )?(?:to )?(?:contact|message|email|call|text|ping|invite|introduce|approach|nudge|dm|reachout|followup|chase|bother)\b|no (?:marketing|newsletters?|comms|outreach|intros?|introductions?|messages?|emails?|calls?|texts?|contact|invites?|invitations?|dms?|nudges?|pings?|approaches|mailings?|sms|whatsapp)(?!\s+(?:details?|info\w*|numbers?|address\w*|on file|on record|yet|available|known|listed|records?|data|card)\b))\b`);
export const WEAK_NEGATORS = /\b(?:no|not|never|nor|didnt|did not|hasnt|has not|havent|have not|hadnt|had not|wasnt|was not|werent|were not|isnt|is not|arent|are not|cant|cannot|couldnt|could not)\b/;
export const BE_PARTICIPLE = /\b(?:to be|be|being|been|get|getting) (?:contacted|messaged|emailed|called|texted|pinged|invited|approached|introduced|nudged|added|included|reachout|chased|bothered|disturbed)\b/;
// In a ledger, a bare "ask"/"asked" is the manager's consent ask ("intro never asked"); only "asked to / not / that / us / for" is the member's wish.
export const WISH_WORDS = /\b(?:want(?:s|ed|ing)?|wish(?:es|ed)?|like|keen|interested|prefer(?:s|red)?|ask(?:ed|s|ing)? (?:us |them |me |the team )?(?:to|not|that|for|if|whether)|told (?:us |them |me )?(?:to|not|that)|tell(?:s)? (?:us |them |me )?(?:to|not|that)|said|say(?:s|ing)?|request(?:ed|s)? (?:to|not|that)|insist(?:ed|s)?|demand(?:ed|s)?|happy|ok|okay|fine|mind(?:ed)?|refus(?:e|ed|es)|rather|please|kindly|politely|explicitly|firmly|clear(?:ly)?|instruct(?:ed|ion|ions)?|requir(?:e|es|ed)|permission|consent|agree(?:d|s)?|willing|unwilling|wrote|replied that)\b/;
export const REPORTING_WORDS = /\b(?:repl(?:y|ied|ies|ying)|respon(?:d|ded|ds|ding|se|ses)|answer(?:ed|s|ing)?|back|heard|hear(?:ing)?|read|reads|seen|saw|see|opened|opens|bounced?|bounces|delivered|received?|receives|reached|picked|pick|returned|return|acknowledged|engaged|clicked|click|yet|so far|since|know|knows|knew|have|has|had|got|get|gets|found|available|listed|missing|on file|on record|checks?|checked|uses?|used|works?|working|attended|came|showed|noshow|address|addresses|details)\b/;

/** Removal of information: stop using it; the ledger keeps only the date and category. */
export const REMOVAL_SIGNALS: readonly SignalRule[] = [
  { id: "removal", re: /\bremoval\b/ },
  { id: "redact", re: /\bredact\w*/ },
  { id: "erase", re: /\beras(?:e|ed|es|ing)\b/ },
  // "forget what she said", "to be forgotten"; not "forgot to send" or "had forgotten to ask"
  { id: "forget_info", re: /\bforget(?:s|ting)?\b|\b(?:be|been|is|was|are|get|gets|got) forgotten\b/ },
  // "delete the notes about her startup"; verbs chosen so "take notes" and "dropped a message" do not count
  { id: "delete_info", re: /\b(?:remove|delete|erase|scrub|strike)(?:s|d|ed|ing)?\b(?:\s+\w+){0,4}?\s+(?:notes?|details?|information|info|comments?|story|stories|data|messages?|quotes?|answers?|bio|mentions?|references?)\b/ },
  { id: "do_not_use", re: /\b(?:do not|dont|never|stop|cease)\s+(?:use|using|share|sharing|repeat|repeating|mention|mentioning|quote|quoting|pass on|passing on)\b|\bnot to be (?:used|shared|repeated|mentioned|quoted)\b/ },
  { id: "data_request", re: /\b(?:data|deletion|erasure|subject access) request\b|\bdsar\b|\bgdpr\b/ },
];

/**
 * Cheap pre-filter: a clause with none of these stems can match no rule, so it is skipped without
 * running the tables (keeps adversarial notes made of thousands of tiny clauses fast).
 */
export const ANY_SIGNAL_STEM = /dnc|opt|unsub|stop|spam|block|contact|ask|want|told|request|remov|withdr|revok|retract|consent|permission|delet|eras|wipe|purg|destroy|scrub|forget|forgot|gdpr|redact|dsar|messag|msg|email|reachout|call|text|ping|followup|invit|newsletter|marketing|intro|outreach|approach|\bdm|nudg|comms|mailing|whatsapp|sms|\bno\b|\bnot\b|never|cease|refus|declin|should|must|ought|wish|take|took|strike|struck|leave|left|keep|kept|right to|exclude|drop/;

/** A request the note itself says has been dealt with (the hold stands; only the "action this" item is skipped). */
export const ACTIONED_RE = /\b(?:honou?red|actioned|done|processed|completed|dealt with)\b/i;
