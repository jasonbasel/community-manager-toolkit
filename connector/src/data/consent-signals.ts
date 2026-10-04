/**
 * Opt-out and removal wording in ledger notes (guardrails §12), as data for src/text/consent.ts.
 * Detection is broad and conservative: a false positive holds two people until the manager confirms;
 * a false negative would drop an opt-out. Every pattern runs on one clause at a time, lowercased, with
 * accents and apostrophes removed and punctuation turned into single spaces ("don't" → "dont",
 * "opt-out" → "opt out"), padded with a space at each end.
 */

/**
 * Clause boundaries: . ; : ! ? — – ( ) [ ] / , a hyphen that is not inside a word (so "opt-out",
 * "e-mail" and "2026-09-30" stay whole), and the words "and", "but" and "then". A negation never
 * reaches across one of these ("Not a fit (DNC)", "No reply and unsubscribed").
 */
export const CLAUSE_SPLIT = /[.;:!?()[\]/—–]|(?<![\p{L}\p{N}])-|-(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])(?:and|but|then)(?![\p{L}\p{N}])/gu;

export interface SignalRule { id: string; re: RegExp }

/**
 * The only negations that cancel a phrase, and only the phrase they directly precede: "not opted out",
 * "no longer opted out", "never unsubscribed", "don't forget" (forget only). Everything else that
 * mentions a signal phrase counts, however it is qualified ("No longer interested — DNC").
 */
const NEG = String.raw`(?:not|never|no longer|didnt|did not|hasnt|has not|havent|have not|hadnt|had not|doesnt|does not|dont|do not|wont|will not|isnt|is not|arent|are not|wasnt|was not|werent|were not)`;
export const SIGNAL_CANCELLERS: readonly RegExp[] = [
  new RegExp(String.raw`\b${NEG}\s+(?:yet\s+|actually\s+|formally\s+|ever\s+|been\s+|officially\s+)*opt(?:ed|s|ing)?\s?out\b`, "g"),
  new RegExp(String.raw`\b${NEG}\s+(?:yet\s+|actually\s+|formally\s+|ever\s+|been\s+|officially\s+)*unsubscrib\w*`, "g"),
  /\b(?:dont|do not|never|not|didnt|did not|wont|will not|cant|cannot|couldnt|could not|mustnt|must not|shouldnt|should not|lets not)\s+(?:ever\s+)?forget\b/g,
];

/** Opt-out of messages: no more proactive touches to the person it refers to. */
export const OPT_OUT_SIGNALS: readonly SignalRule[] = [
  { id: "dnc", re: /\bdnc\b/ },
  { id: "opt_out", re: /\bopt(?:ed|s|ing)?\s?out\b/ },
  { id: "unsubscribe", re: /\bunsubscrib\w*/ },
  { id: "do_not_contact", re: /\b(?:do not|dont|never|not to|please dont|please do not)\s+(?:ever\s+|again\s+|re\s+)?(?:contact|message|email|e mail|call|text|approach|introduce|invite|dm|ping|write to|reach out to|chase|follow up with|nudge)\w*/ },
  { id: "not_to_be_contacted", re: /\bnot to (?:be (?:contacted|messaged|emailed|introduced|re introduced|invited|approached|included|added|chased|nudged)|receive|hear from|get)\b/ },
  { id: "not_want_contact", re: /\b(?:doesnt|does not|dont|do not|didnt|did not|wont|will not|would not|wouldnt|not|no longer|never)\s+want(?:s|ed)?\s+(?:to be |to hear |to receive |to get |any |any more |more |further )?(?:contacted|messaged|emailed|introduced|approached|invited|intros|introductions|messages|contact|emails|outreach|from us|anything|invitations|requests|nudges)\b/ },
  { id: "no_more", re: /\bno (?:more|further|new|additional) (?:contact|messages?|emails?|e mails?|intros?|introductions?|outreach|invitations?|invites?|requests?|approaches|texts?|calls?|nudges?|follow ups?)\b/ },
  { id: "no_contact", re: /\bno contact\b(?! (?:details?|info|information|number|email|address|data|yet|so far))/ },
  { id: "stop_contact", re: /\bstop(?:ped|s|ping)?\s+(?:all\s+|the\s+|any\s+|sending\s+|with\s+)?(?:messag|contact|email|e mail|text|call|outreach|intro|invit|writing|chasing|follow)\w*/ },
  { id: "asked_to_stop", re: /\b(?:asked|asks|wants?|wanted|told|requested|would like)(?:\s+\w+){0,3}?\s+to\s+stop\b/ },
  { id: "remove_from", re: /\b(?:remove|take|took|strike|struck|delete|leave|left|keep|kept)[ds]?\b(?:\s+\w+){0,3}?\s+(?:from|off|out of)\b(?:\s+\w+){0,2}?\s+(?:lists?|intros?|introductions?|outreach|mailings?|contacts?|directory|database|community|requests?|everything|groups?|chats?|whatsapp|newsletters?|invitations?|rota|programme|program|network|campaigns?|comms)\b/ },
  { id: "asked_removed", re: /\b(?:asked|asks|wants?|wanted|would like|requested|needs?)\s+to be (?:removed|taken off|taken out|left out|left off|excluded|deleted|dropped|forgotten|erased|left alone)\b/ },
  { id: "remove_me", re: /\b(?:remove|delete|erase|unsubscribe|exclude|drop)\s+me\b/ },
  { id: "withdraw_consent", re: /\b(?:withdr[ae]w\w*|revok\w*|retract\w*)\s+(?:their |his |her |my |all |the )?(?:consent|permission)\b|\b(?:consent|permission) (?:was |has been |is |now )?(?:withdrawn|revoked|retracted)\b/ },
  { id: "erase_person", re: /\b(?:delete|erase|remove|wipe|purge|destroy|scrub)\w*\s+(?:all\s+)?(?:of\s+)?(?:my|their|his|her)\s+(?:personal\s+)?(?:data|account|profile|records?|details|information|info|contact details|personal details|personal information|everything)\b/ },
  { id: "forget_me", re: /\bforget (?:me|him|her|them|about (?:me|him|her|them))\b/ },
  { id: "be_forgotten", re: /\b(?:right to be|wants? to be|wanted to be|asked to be|asks to be|would like to be|wish(?:es)? to be) forgotten\b/ },
  { id: "erasure", re: /\berasure\b/ },
  { id: "gdpr", re: /\bgdpr\b/ },
  { id: "blocked", re: /\bblocked (?:us|me|our number|the number)\b/ },
];

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
  { id: "data_request", re: /\b(?:data|deletion|erasure|subject access) request\b|\bdsar\b/ },
];

/** A request the note itself says has been dealt with (the hold stands; only the "action this" item is skipped). */
export const ACTIONED_RE = /\b(?:honou?red|actioned|done|processed|completed|dealt with)\b/i;
