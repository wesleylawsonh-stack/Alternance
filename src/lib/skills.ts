// Dictionnaire de competences utilise pour extraire, sans invention, les
// competences presentes dans un texte (CV ou offre). Chaque entree est un
// "canonique" (le libelle affiche) associe a des alias/variantes reconnues.
// C'est volontairement une liste large mais non exhaustive : elle sert de
// filet de securite quand aucune cle IA n'est configuree.

export type SkillEntry = { canonical: string; aliases: string[] };

const RAW_SKILLS: SkillEntry[] = [
  // Langages de programmation
  { canonical: "JavaScript", aliases: ["javascript", "js"] },
  { canonical: "TypeScript", aliases: ["typescript", "ts"] },
  { canonical: "Python", aliases: ["python"] },
  { canonical: "Java", aliases: ["java"] },
  { canonical: "C", aliases: ["langage c"] },
  { canonical: "C++", aliases: ["c++", "cpp"] },
  { canonical: "C#", aliases: ["c#", "csharp"] },
  { canonical: "PHP", aliases: ["php"] },
  { canonical: "Ruby", aliases: ["ruby"] },
  { canonical: "Go", aliases: ["golang", "go"] },
  { canonical: "Rust", aliases: ["rust"] },
  { canonical: "Swift", aliases: ["swift"] },
  { canonical: "Kotlin", aliases: ["kotlin"] },
  { canonical: "SQL", aliases: ["sql"] },
  { canonical: "HTML", aliases: ["html", "html5"] },
  { canonical: "CSS", aliases: ["css", "css3"] },
  { canonical: "Bash", aliases: ["bash", "shell"] },
  { canonical: "R", aliases: ["r"] },
  { canonical: "Scala", aliases: ["scala"] },
  { canonical: "VBA", aliases: ["vba"] },

  // Frameworks / librairies
  { canonical: "React", aliases: ["react", "reactjs", "react.js"] },
  { canonical: "Vue.js", aliases: ["vue.js", "vuejs", "vue"] },
  { canonical: "Angular", aliases: ["angular"] },
  { canonical: "Next.js", aliases: ["next.js", "nextjs"] },
  { canonical: "Node.js", aliases: ["node.js", "nodejs", "node"] },
  { canonical: "Express", aliases: ["express.js", "expressjs", "express"] },
  { canonical: "Django", aliases: ["django"] },
  { canonical: "Flask", aliases: ["flask"] },
  { canonical: "Spring", aliases: ["spring boot", "spring"] },
  { canonical: "Laravel", aliases: ["laravel"] },
  { canonical: ".NET", aliases: [".net", "dotnet", "asp.net"] },
  { canonical: "Symfony", aliases: ["symfony"] },
  { canonical: "TailwindCSS", aliases: ["tailwind", "tailwindcss"] },
  { canonical: "Bootstrap", aliases: ["bootstrap"] },
  { canonical: "jQuery", aliases: ["jquery"] },
  { canonical: "Flutter", aliases: ["flutter"] },
  { canonical: "React Native", aliases: ["react native"] },

  // Data / IA
  { canonical: "Pandas", aliases: ["pandas"] },
  { canonical: "NumPy", aliases: ["numpy"] },
  { canonical: "Machine Learning", aliases: ["machine learning", "ml"] },
  { canonical: "Deep Learning", aliases: ["deep learning"] },
  { canonical: "TensorFlow", aliases: ["tensorflow"] },
  { canonical: "PyTorch", aliases: ["pytorch"] },
  { canonical: "Power BI", aliases: ["power bi", "powerbi"] },
  { canonical: "Tableau", aliases: ["tableau software", "tableau"] },
  { canonical: "Excel", aliases: ["excel"] },
  { canonical: "Data Analysis", aliases: ["data analysis", "analyse de donnees", "analyse de données"] },
  { canonical: "Statistiques", aliases: ["statistiques", "statistics"] },

  // Bases de donnees
  { canonical: "MySQL", aliases: ["mysql"] },
  { canonical: "PostgreSQL", aliases: ["postgresql", "postgres"] },
  { canonical: "MongoDB", aliases: ["mongodb", "mongo"] },
  { canonical: "Redis", aliases: ["redis"] },
  { canonical: "Oracle", aliases: ["oracle db", "oracle"] },
  { canonical: "SQLite", aliases: ["sqlite"] },

  // Cloud / DevOps
  { canonical: "AWS", aliases: ["aws", "amazon web services"] },
  { canonical: "Azure", aliases: ["azure"] },
  { canonical: "Google Cloud", aliases: ["gcp", "google cloud"] },
  { canonical: "Docker", aliases: ["docker"] },
  { canonical: "Kubernetes", aliases: ["kubernetes", "k8s"] },
  { canonical: "CI/CD", aliases: ["ci/cd", "integration continue"] },
  { canonical: "Git", aliases: ["git"] },
  { canonical: "GitHub", aliases: ["github"] },
  { canonical: "GitLab", aliases: ["gitlab"] },
  { canonical: "Linux", aliases: ["linux"] },
  { canonical: "Terraform", aliases: ["terraform"] },
  { canonical: "Jenkins", aliases: ["jenkins"] },

  // Outils bureautique / gestion
  { canonical: "Jira", aliases: ["jira"] },
  { canonical: "Confluence", aliases: ["confluence"] },
  { canonical: "Trello", aliases: ["trello"] },
  { canonical: "Notion", aliases: ["notion"] },
  { canonical: "Photoshop", aliases: ["photoshop"] },
  { canonical: "Illustrator", aliases: ["illustrator"] },
  { canonical: "Figma", aliases: ["figma"] },
  { canonical: "Canva", aliases: ["canva"] },
  { canonical: "SAP", aliases: ["sap"] },
  { canonical: "Salesforce", aliases: ["salesforce"] },
  { canonical: "WordPress", aliases: ["wordpress"] },

  // Methodologies
  { canonical: "Agile", aliases: ["agile"] },
  { canonical: "Scrum", aliases: ["scrum"] },
  { canonical: "Kanban", aliases: ["kanban"] },
  { canonical: "Gestion de projet", aliases: ["gestion de projet", "project management"] },
  { canonical: "UX/UI", aliases: ["ux/ui", "ux design", "ui design", "ux", "ui"] },
  { canonical: "SEO", aliases: ["seo", "referencement naturel", "référencement naturel"] },
  { canonical: "Marketing digital", aliases: ["marketing digital", "webmarketing"] },
  { canonical: "Comptabilite", aliases: ["comptabilite", "comptabilité"] },
  { canonical: "Controle de gestion", aliases: ["controle de gestion", "contrôle de gestion"] },
  { canonical: "Audit", aliases: ["audit"] },
  { canonical: "Recrutement", aliases: ["recrutement", "sourcing"] },
  { canonical: "Communication", aliases: ["communication"] },
  { canonical: "Negociation", aliases: ["negociation", "négociation"] },
  { canonical: "Relation client", aliases: ["relation client", "service client"] },

  // Langues
  { canonical: "Anglais", aliases: ["anglais", "english", "toeic", "toefl"] },
  { canonical: "Espagnol", aliases: ["espagnol", "spanish"] },
  { canonical: "Allemand", aliases: ["allemand", "german"] },
  { canonical: "Italien", aliases: ["italien", "italian"] },
  { canonical: "Chinois", aliases: ["chinois", "mandarin"] },

  // Soft skills
  { canonical: "Travail d'equipe", aliases: ["travail d'equipe", "travail d'équipe", "esprit d'equipe", "esprit d'équipe"] },
  { canonical: "Autonomie", aliases: ["autonomie", "autonome"] },
  { canonical: "Rigueur", aliases: ["rigueur", "rigoureux"] },
  { canonical: "Organisation", aliases: ["organisation", "organise", "organisé"] },
  { canonical: "Creativite", aliases: ["creativite", "créativité", "creatif", "créatif"] },
  { canonical: "Leadership", aliases: ["leadership"] },
  { canonical: "Adaptabilite", aliases: ["adaptabilite", "adaptabilité", "adaptable"] },
  { canonical: "Resolution de problemes", aliases: ["resolution de problemes", "résolution de problèmes", "problem solving"] },
];

// Abbreviations tres frequentes dans les CV/offres en francais (ex: "R&D",
// "H/F"). Une fois la ponctuation normalisee en espaces, "R&D" devient
// "r d" : sans ce filtre, la lettre isolee "r" serait detectee a tort comme
// le langage R. Cible des motifs precis (plutot qu'une regle generique sur
// toute paire de lettres separees par & ou /) pour ne pas casser des
// mentions legitimes comme "C/C++".
const KNOWN_ABBREVIATIONS = [/\br\s*&\s*d\b/gi, /\bh\s*\/\s*f\b/gi, /\bf\s*\/\s*h\b/gi, /\bm\s*\/\s*f\b/gi, /\bf\s*\/\s*m\b/gi];

function stripKnownAbbreviations(text: string): string {
  return KNOWN_ABBREVIATIONS.reduce((acc, re) => acc.replace(re, " "), text);
}

function normalize(text: string): string {
  return stripKnownAbbreviations(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    // "/" n'est PAS conserve : des alias comme "ux/ui" restent detectables
    // via leurs alias "ux" et "ui" separes, alors que le garder cassait la
    // detection de mentions comme "C/C++" (le "/" empechait "c++" d'etre
    // entoure d'espaces).
    .replace(/[^a-z0-9+.# ]/g, " ")
    // Un point en fin de mot/phrase (ex: "...maitrise de Python.") n'est
    // pas un separateur decimal ni un point technique (ex: "node.js",
    // ".NET") : on ne le retire que lorsqu'il n'est suivi ni d'une lettre
    // ni d'un chiffre.
    .replace(/\.(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAlias(alias: string): string {
  return normalize(alias).trim();
}

const SKILLS = RAW_SKILLS.map((s) => ({
  canonical: s.canonical,
  aliases: s.aliases.map(normalizeAlias).filter(Boolean),
}));

/**
 * Extrait, sans rien inventer, la liste des competences du dictionnaire qui
 * apparaissent litteralement (par alias) dans le texte fourni.
 */
export function extractSkills(text: string): string[] {
  if (!text) return [];
  const normalized = ` ${normalize(text)} `;
  const found = new Set<string>();

  for (const skill of SKILLS) {
    for (const alias of skill.aliases) {
      if (!alias) continue;
      if (normalized.includes(` ${alias} `)) {
        found.add(skill.canonical);
        break;
      }
    }
  }

  return Array.from(found).sort((a, b) => a.localeCompare(b));
}

export function allKnownSkills(): string[] {
  return SKILLS.map((s) => s.canonical);
}
