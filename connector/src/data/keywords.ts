/**
 * Keyword data for ask↔offer overlap (pair_attendees). Text is lowercased, accents and
 * punctuation removed, PHRASES are folded to one token, words are singularised, then
 * SYNONYM_GROUPS map variants to one concept. STOPWORDS carry no professional signal and are
 * dropped; WEAK_TOKENS count half (they appear in many profiles).
 */

/** Multi-word phrases folded to a single token before splitting (left: normalised phrase). */
export const PHRASES: Readonly<Record<string, string>> = {
  "machine learning": "ai", "artificial intelligence": "ai", "deep learning": "ai", "data science": "ai",
  "supply chain": "supply", "net zero": "climate", "series a": "funding", "series b": "funding", "pre seed": "funding",
  "deal flow": "dealflow", "r and d": "rnd", "r d": "rnd", "tax credit": "tax", "tax credits": "tax", "soc 2": "security",
  "incident response": "security", "public relations": "pr", "design partner": "customers", "design partners": "customers",
  "first customer": "customers", "paying customer": "customers", "user research": "ux", "user experience": "ux",
  "e money": "fintech", "go to market": "gtm", "business development": "sales", "first hire": "hiring", "head hunting": "hiring",
  "data protection": "privacy", "data privacy": "privacy", "information governance": "privacy", "real estate": "property",
  "fractional cfo": "cfo", "interim cfo": "cfo", "term sheet": "termsheet", "term sheets": "termsheet", "board member": "board", "board members": "board", "advisory board": "board",
};

/** Concept → variants (after singularisation). A token may appear in only one group. */
export const SYNONYM_GROUPS: Readonly<Record<string, readonly string[]>> = {
  hiring: ["hire", "hiring", "hired", "recruit", "recruiting", "recruitment", "recruiter", "talent", "headhunting", "staffing"],
  funding: [
    "raise", "raising", "fundraise", "fundraising", "funding", "funded", "investor", "investment", "invest", "investing", "angel",
    "vc", "venture", "capital", "cheque", "seed", "preseed", "lp", "coinvestor", "coinvestment",
  ],
  grant: ["grant", "funder", "grantmaker"],
  customers: ["client", "customer", "buyer", "purchaser"],
  pilot: ["pilot", "piloting"],
  partnership: ["partnership"],
  legal: ["legal", "law", "lawyer", "solicitor", "contract", "contractual", "counsel"],
  privacy: ["gdpr", "privacy"],
  accounting: ["accounting", "accountant", "bookkeeping", "tax"],
  cfo: ["cfo"],
  security: ["security", "cyber", "cybersecurity", "infosec", "pentest", "pentesting"],
  clinical: ["clinical", "clinician", "clinic", "medical", "doctor", "physician"],
  nhs: ["nhs", "hse"],
  health: ["health", "healthcare", "healthtech", "medtech"],
  climate: ["climate", "carbon", "sustainability", "sustainable", "decarbonisation", "decarbonization", "emission", "cleantech", "esg"],
  energy: ["energy", "solar", "wind", "renewable", "offshore"],
  ai: ["ai", "ml", "llm", "genai"],
  brand: ["brand", "branding", "rebrand"],
  ux: ["ux", "usability"],
  pr: ["pr", "press", "publicity"],
  manufacturing: ["manufacturing", "manufacturer", "manufacture", "factory"],
  supply: ["supply", "supplier", "sourcing"],
  retail: ["retail", "retailer", "stockist", "supermarket", "shop"],
  robotics: ["robot", "robotics", "robotic"],
  education: ["education", "edtech", "school", "teacher", "curriculum", "headteacher"],
  fintech: ["fintech", "payment", "banking", "bank", "insurtech", "lending"],
  property: ["property", "proptech", "landlord"],
  speaker: ["speaker", "speaking", "keynote"],
  venue: ["venue", "space", "workspace", "coworking"],
  sponsor: ["sponsor", "sponsorship"],
  mentoring: ["mentor", "mentoring", "mentorship", "coach", "coaching"],
  sales: ["sales", "selling", "outbound", "sdr", "gtm"],
  board: ["board", "nonexec", "ned"],
};

/** Words with no professional signal in asks/offers. */
export const STOPWORDS: readonly string[] = [
  "a", "an", "the", "and", "or", "for", "to", "of", "in", "on", "with", "at", "by", "from", "who", "whom", "that", "which", "this",
  "these", "those", "our", "my", "we", "i", "me", "you", "your", "their", "they", "them", "it", "its", "is", "are", "be", "been",
  "being", "as", "about", "into", "over", "under", "more", "most", "some", "any", "other", "others", "all", "both", "each", "few",
  "such", "only", "own", "same", "so", "than", "too", "very", "can", "could", "will", "would", "should", "may", "might", "must",
  "do", "does", "did", "have", "has", "had", "get", "got", "getting", "want", "wanted", "need", "needing", "needed", "looking",
  "look", "seeking", "seek", "hoping", "hope", "like", "also", "plus", "just", "really", "actually", "etc", "eg", "ie", "via",
  "per", "up", "out", "who've", "s", "t", "re", "ve", "ll", "d", "e", "x", "co", "one", "two", "three", "lot", "lots", "thing",
  "advice", "advise", "adviser", "advisor", "introduction", "intro", "introduce", "help", "helping", "support", "supporting",
  "knowhow", "know", "how", "experience", "experienced", "expertise", "expert", "insight", "guidance", "tip", "idea",
  "opportunity", "connection", "contact", "lead", "people", "person", "someone", "anyone", "folk", "meet", "meeting", "chat",
  "networking", "network", "interesting", "new", "good", "great", "best", "early", "stage", "first", "uk", "partner", "way",
  "access", "review", "feedback", "playbook", "honest", "lesson", "story", "quick", "free", "session", "minute", "willing",
  "open", "around", "anything", "everything", "member", "community", "group", "team", "work", "working", "thinking", "talk",
  "learn", "learning", "share", "sharing", "find", "finding", "build", "building", "make", "making", "take", "taking", "run",
  "running", "think", "hear", "answer", "question", "case", "example", "thought", "view", "perspective", "background",
  "through", "back", "cut", "cost", "applied", "method", "setup", "set", "check", "eligibility", "booking", "basic", "real", "small",
  "big", "large", "right", "local", "global", "near", "based", "able", "keen", "happy", "glad", "sure", "currently", "recently",
  "already", "next", "last", "year", "month", "week", "day", "time", "today", "soon", "later", "able", "ready", "about", "abroad",
  "keep", "go", "going", "come", "coming", "use", "using", "used", "give", "giving", "offer", "offering", "seeking", "pointer",
  "reach", "ask", "asking", "potential", "possible", "maybe", "general", "specific", "practical", "hands", "end", "side",
];

/** Broad words that count half: they appear in many unrelated profiles. */
export const WEAK_TOKENS: readonly string[] = [
  "data", "design", "product", "marketing", "strategy", "operation", "ops", "business", "growth", "technology", "tech", "digital",
  "finance", "financial", "management", "consulting", "consultant", "service", "planning", "scaling", "scale", "startup",
  "founder", "company", "event", "content", "platform", "software", "engineer", "engineering", "operator", "innovation", "leader",
  "director", "executive", "market", "industry", "sector", "project", "programme", "program", "framework", "model", "modelling",
  "system", "tool", "tooling", "research", "analysis", "analytics", "insurance", "health", "mentoring", "production",
];

/** Words that end in "s" but are not plurals (kept as they are when singularising). */
export const KEEP_TRAILING_S: readonly string[] = [
  "analytics", "robotics", "logistics", "economics", "physics", "metrics", "ethics", "statistics", "sales", "ops", "series",
  "business", "access", "process", "address", "less", "news", "gas", "bus", "plus", "cms", "saas", "paas", "iaas", "aws", "gdpr",
  "hiv", "nhs", "hse", "esg", "ux", "pos",
];
