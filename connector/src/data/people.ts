/**
 * People data: event "sides", complementary side pairs, first-name variants for similar-name
 * checks, and the inference hints used only when a guest's side is not given.
 */

/** Free-text side → canonical side. */
export const SIDE_ALIASES: Readonly<Record<string, string>> = {
  founder: "founder", cofounder: "founder", "co founder": "founder", startup: "founder", entrepreneur: "founder", builder: "founder",
  investor: "investor", vc: "investor", angel: "investor", "venture capital": "investor", lp: "investor", "fund manager": "investor",
  operator: "operator", executive: "operator", employee: "operator",
  advisor: "advisor", adviser: "advisor", consultant: "advisor", mentor: "advisor", "service provider": "advisor", agency: "advisor",
  corporate: "corporate", enterprise: "corporate", buyer: "corporate", customer: "corporate",
  academic: "academic", researcher: "academic", university: "academic",
  talent: "talent", "job seeker": "talent", candidate: "talent",
};

/** Unordered side pairs that score as complementary (+1). */
export const COMPLEMENTARY_SIDES: readonly (readonly [string, string])[] = [
  ["founder", "investor"], ["founder", "operator"], ["founder", "advisor"], ["founder", "corporate"], ["founder", "academic"],
  ["founder", "talent"], ["investor", "operator"], ["academic", "corporate"],
];

/** Role words that imply a side when none is given (checked in order). */
export const ROLE_SIDE_HINTS: readonly (readonly [RegExp, string])[] = [
  [/\b(co-?)?founder\b/i, "founder"],
  [/\b(angel investor|investor|venture partner|investment (manager|director|associate|analyst)|general partner)\b/i, "investor"],
];

/** Organisation words that make an investing role (partner, principal, associate, analyst) an investor. */
export const INVESTOR_ORG_HINT = /\b(capital|ventures?|vc|fund|investments?|partners? fund|angels?)\b/i;
export const INVESTOR_ROLE_HINT = /\b(partner|principal|associate|analyst)\b/i;

/**
 * First-name variant groups (lowercase). Two first names are "related" if they share a group,
 * if one is a prefix (3+ letters) of the other, or if one is an initial of the other.
 */
export const NICKNAME_GROUPS: readonly (readonly string[])[] = [
  ["sam", "samuel", "samantha", "sammy", "sammie"], ["alex", "alexander", "alexandra", "alexis", "sasha", "lex"],
  ["bob", "rob", "robert", "robbie", "bobby", "bert"], ["bill", "will", "william", "billy", "liam", "willy"],
  ["liz", "beth", "elizabeth", "eliza", "lizzie", "betty", "libby"], ["kate", "katie", "katherine", "catherine", "kathryn", "kat", "cath"],
  ["jim", "jimmy", "james", "jamie"], ["mike", "michael", "mick", "mikey", "micky"], ["dave", "david", "davey", "davy"],
  ["chris", "christopher", "christine", "christina", "kris", "kristen"], ["nick", "nicholas", "nicola", "nicole", "nicky", "nico"],
  ["tom", "thomas", "tommy"], ["tony", "anthony", "antonia", "toni"], ["ben", "benjamin", "benedict", "benny"],
  ["dan", "daniel", "danny", "danielle"], ["matt", "matthew", "matty"], ["andy", "andrew", "drew", "andrea"],
  ["jen", "jenny", "jennifer"], ["jo", "joe", "joseph", "josephine", "joanna", "joanne", "johanna", "joey"],
  ["pat", "patrick", "patricia", "patty", "paddy"], ["meg", "maggie", "margaret", "peggy", "margo", "marguerite"],
  ["ed", "eddie", "edward", "edwin", "ted", "teddy", "edmund"], ["fred", "freddie", "frederick", "alfred", "alfie"],
  ["steve", "steven", "stephen", "stephanie", "steph"], ["vic", "vicky", "victoria", "victor"],
  ["ellie", "eleanor", "ella", "elle", "helen", "ellen", "nell"], ["abby", "abigail", "abi"], ["becky", "rebecca", "becca"],
  ["sue", "susan", "suzanne", "susie", "suzy"], ["jess", "jessica", "jessie"], ["tim", "timothy", "timmy"], ["greg", "gregory"],
  ["josh", "joshua"], ["zach", "zachary", "zack"], ["charlie", "charles", "charlotte", "chuck", "lottie"],
  ["harry", "henry", "harold", "hal", "hank"], ["jack", "john", "jonathan", "jon", "johnny"], ["max", "maxwell", "maximilian", "maxine"],
  ["sophie", "sophia"], ["olly", "oliver", "olivia", "liv", "ollie"], ["rich", "richard", "rick", "ricky", "dick"],
  ["frank", "francis", "frances", "fran", "frankie"], ["gabe", "gabriel", "gabriella", "gabby"], ["izzy", "isabel", "isabella", "isobel"],
  ["toby", "tobi", "tobias"], ["leo", "leopold", "leonard", "leon"], ["thandi", "thandiwe"], ["mo", "mohammed", "muhammad", "mohamed"],
];
