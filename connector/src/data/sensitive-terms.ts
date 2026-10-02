/**
 * Terms that state or imply a sensitive personal attribute (DESIGN.md §3 "Sensitive attribute").
 * Used to: keep these words out of pairing basis and directory tags, flag organisations whose
 * names signal one (describe them by sector only), and warn on drafts. Sector words such as
 * "health", "clinical" or "care" are deliberately absent: they are professional context.
 * Matching is on whole normalised words/phrases ("&" and punctuation become spaces).
 */
export const SENSITIVE_TERMS: Readonly<Record<string, readonly string[]>> = {
  sexuality: [
    "gay", "gays", "lesbian", "lesbians", "bisexual", "queer", "lgbt", "lgbtq", "lgbtqi", "lgbtqia", "lgbti", "homosexual",
    "pride", "out & proud", "out and proud", "sexual orientation", "sexuality", "transgender", "trans women", "trans men",
    "trans people", "non-binary", "nonbinary",
  ],
  religion: [
    "muslim", "muslims", "islam", "islamic", "christian", "christians", "christianity", "catholic", "protestant", "evangelical",
    "church", "jewish", "judaism", "synagogue", "mosque", "hindu", "hinduism", "sikh", "gurdwara", "buddhist", "buddhism",
    "religion", "religious", "faith based", "halal", "kosher",
  ],
  ethnicity: [
    "ethnic", "ethnicity", "race", "racial", "black owned", "black founders", "black women", "asian founders", "latinx", "latino",
    "latina", "bame", "bipoc", "people of colour", "people of color", "indigenous", "minority owned",
  ],
  health: [
    "chemo", "chemotherapy", "cancer", "diagnosis", "diagnosed", "oncology", "tumour", "tumor", "unwell", "illness", "sick leave",
    "mental illness", "hiv", "pregnant", "pregnancy", "miscarriage", "ivf", "terminally ill",
  ],
  disability: [
    "disabled", "disability", "disabilities", "wheelchair", "autism", "autistic", "adhd", "dyslexia", "dyslexic", "neurodivergent",
    "deaf", "visually impaired", "hearing impaired",
  ],
  politics: [
    "labour party", "conservative party", "tory", "tories", "lib dem", "lib dems", "liberal democrat", "reform uk", "snp",
    "democrat", "democrats", "republican", "republicans", "political party", "trade union",
  ],
};
