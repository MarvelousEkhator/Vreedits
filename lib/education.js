// Countries, school systems and example schools for sign-up.
// Used by the register page (client) and by Syna (server), so no browser-only code here
// except inside detectCountry().
//
// Honest note: no list can hold every school on Earth. Each country has a curated list
// of well-known schools, and everyone can also type their own school or skip.

const NG_UNI = [
  "University of Lagos", "University of Ibadan", "Obafemi Awolowo University", "University of Nigeria, Nsukka",
  "Ahmadu Bello University", "University of Benin", "University of Ilorin", "Covenant University",
  "Lagos State University", "Federal University of Technology, Akure", "Federal University of Technology, Minna",
  "Nnamdi Azikiwe University", "University of Port Harcourt", "Bayero University Kano", "Babcock University",
  "Landmark University", "Afe Babalola University", "Redeemer's University", "Pan-Atlantic University",
  "Bells University of Technology", "Yaba College of Technology", "Federal Polytechnic Ilaro",
  "University of Abuja", "University of Calabar", "University of Uyo", "Delta State University",
  "Ladoke Akintola University of Technology", "Olabisi Onabanjo University", "Federal University Oye-Ekiti",
  "Ambrose Alli University", "Rivers State University", "Kwara State University", "Osun State University",
  "Adekunle Ajasin University", "Nigerian Defence Academy", "National Open University of Nigeria",
];
const NG_SEC = [
  "King's College, Lagos", "Queen's College, Lagos", "Government College, Ibadan", "Federal Government College, Odogbolu",
  "Federal Government Girls' College, Abuloma", "Loyola Jesuit College, Abuja", "Atlantic Hall, Epe",
  "Greensprings School", "Lagoon School", "Corona Secondary School", "Chrisland High School", "Vivian Fowler Memorial College",
  "Command Secondary School", "International School, Ibadan", "Babcock University High School", "Lead British International School",
  "Holy Child College, Lagos", "St. Gregory's College, Lagos", "Methodist Boys' High School, Lagos", "Igbobi College",
  "Federal Government College, Enugu", "Federal Government College, Kano", "Unity Schools (other)",
];
const US_UNI = [
  "Harvard University", "Stanford University", "MIT", "Yale University", "Princeton University", "Columbia University",
  "University of California, Berkeley", "UCLA", "University of Michigan", "University of Texas at Austin",
  "New York University", "Georgia Tech", "Carnegie Mellon University", "University of Florida", "Ohio State University",
  "Arizona State University", "Penn State University", "University of Washington", "Howard University", "Spelman College",
  "Morehouse College", "Texas A&M University", "Purdue University", "University of Illinois Urbana-Champaign",
  "Community college (type its name)", "Online / homeschool",
];
const GB_UNI = [
  "University of Oxford", "University of Cambridge", "Imperial College London", "UCL", "King's College London",
  "London School of Economics", "University of Manchester", "University of Edinburgh", "University of Bristol",
  "University of Warwick", "University of Leeds", "University of Birmingham", "University of Glasgow",
  "Durham University", "University of Nottingham", "Open University", "Sixth form / college (type its name)",
];
const GH_LIST = [
  "University of Ghana", "KNUST", "University of Cape Coast", "University of Education, Winneba", "Ashesi University",
  "GIMPA", "Achimota School", "Wesley Girls' High School", "Prempeh College", "Mfantsipim School", "St. Augustine's College",
  "Holy Child School", "Presbyterian Boys' Secondary School", "Aburi Girls' Senior High School", "Opoku Ware School",
];
const KE_LIST = [
  "University of Nairobi", "Kenyatta University", "Moi University", "Strathmore University", "JKUAT", "Egerton University",
  "Maseno University", "Alliance High School", "Starehe Boys Centre", "Moi Girls' School, Nairobi", "Kenya High School",
  "Mang'u High School", "Maranda High School", "Lenana School", "Nairobi School", "Alliance Girls High School",
];
const ZA_LIST = [
  "University of Cape Town", "University of the Witwatersrand", "Stellenbosch University", "University of Pretoria",
  "University of Johannesburg", "UKZN", "Rhodes University", "UNISA", "Nelson Mandela University", "Rondebosch Boys' High School",
  "Pretoria Girls' High School", "Parktown Boys' High School", "Westerford High School", "Jeppe High School for Boys",
];
const IN_LIST = [
  "IIT Bombay", "IIT Delhi", "IIT Madras", "IIT Kanpur", "IISc Bangalore", "University of Delhi", "JNU", "BITS Pilani",
  "NIT Trichy", "Anna University", "Jadavpur University", "Banaras Hindu University", "Aligarh Muslim University",
  "Delhi Public School", "Kendriya Vidyalaya", "Navodaya Vidyalaya", "St. Xavier's", "Ryan International School",
];
const CA_LIST = [
  "University of Toronto", "McGill University", "University of British Columbia", "University of Waterloo", "McMaster University",
  "Queen's University", "University of Alberta", "Western University", "York University", "Toronto Metropolitan University",
  "Simon Fraser University", "Dalhousie University",
];
const AU_LIST = [
  "University of Melbourne", "University of Sydney", "ANU", "UNSW", "Monash University", "University of Queensland",
  "University of Western Australia", "University of Adelaide", "RMIT", "UTS", "TAFE (type its name)",
];

// "levels" are the groups shown in the class picker, "exams" the ones Syna mentions.
export const CURRICULA = {
  NG: {
    name: "Nigeria", system: "Nigerian 6-3-3-4 system",
    levels: [
      ["Primary", ["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6"]],
      ["Junior Secondary (JSS)", ["JSS 1", "JSS 2", "JSS 3"]],
      ["Senior Secondary (SS)", ["SS 1", "SS 2", "SS 3"]],
      ["Tertiary", ["100 Level", "200 Level", "300 Level", "400 Level", "500 Level", "Postgraduate"]],
    ],
    exams: ["BECE (JSS 3)", "WAEC / WASSCE", "NECO (SSCE)", "JAMB UTME", "Post-UTME"],
    schools: [...NG_SEC, ...NG_UNI],
  },
  US: {
    name: "United States", system: "K-12 grades",
    levels: [
      ["Elementary", ["Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"]],
      ["Middle school", ["Grade 6", "Grade 7", "Grade 8"]],
      ["High school", ["Grade 9 (Freshman)", "Grade 10 (Sophomore)", "Grade 11 (Junior)", "Grade 12 (Senior)"]],
      ["College", ["Freshman", "Sophomore", "Junior", "Senior", "Graduate school"]],
    ],
    exams: ["SAT", "ACT", "AP exams", "PSAT", "State tests"],
    schools: US_UNI,
  },
  GB: {
    name: "United Kingdom", system: "National Curriculum",
    levels: [
      ["Primary", ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6"]],
      ["Secondary", ["Year 7", "Year 8", "Year 9", "Year 10", "Year 11"]],
      ["Sixth form / college", ["Year 12 (AS)", "Year 13 (A-level)"]],
      ["University", ["First year", "Second year", "Third year", "Final year", "Postgraduate"]],
    ],
    exams: ["SATs (KS2)", "GCSE", "A-level", "BTEC", "Scottish Highers"],
    schools: GB_UNI,
  },
  GH: {
    name: "Ghana", system: "Ghanaian system (Basic and SHS)",
    levels: [
      ["Primary", ["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6"]],
      ["Junior High (JHS)", ["JHS 1", "JHS 2", "JHS 3"]],
      ["Senior High (SHS)", ["SHS 1", "SHS 2", "SHS 3"]],
      ["Tertiary", ["Level 100", "Level 200", "Level 300", "Level 400", "Postgraduate"]],
    ],
    exams: ["BECE", "WASSCE", "University admissions"],
    schools: GH_LIST,
  },
  KE: {
    name: "Kenya", system: "Competency Based Curriculum (CBC) and 8-4-4",
    levels: [
      ["Primary", ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"]],
      ["Junior secondary", ["Grade 7", "Grade 8", "Grade 9"]],
      ["Senior secondary", ["Form 1", "Form 2", "Form 3", "Form 4", "Grade 10", "Grade 11", "Grade 12"]],
      ["University / college", ["Year 1", "Year 2", "Year 3", "Year 4", "Postgraduate"]],
    ],
    exams: ["KCPE", "KCSE", "KPSEA", "KJSEA"],
    schools: KE_LIST,
  },
  ZA: {
    name: "South Africa", system: "CAPS curriculum",
    levels: [
      ["Primary", ["Grade R", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7"]],
      ["High school", ["Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12 (Matric)"]],
      ["University / college", ["First year", "Second year", "Third year", "Honours", "Postgraduate"]],
    ],
    exams: ["NSC (Matric)", "IEB", "NBT"],
    schools: ZA_LIST,
  },
  IN: {
    name: "India", system: "CBSE / ICSE / State boards",
    levels: [
      ["Primary", ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5"]],
      ["Middle school", ["Class 6", "Class 7", "Class 8"]],
      ["Secondary", ["Class 9", "Class 10"]],
      ["Senior secondary", ["Class 11", "Class 12"]],
      ["College", ["First year", "Second year", "Third year", "Fourth year", "Postgraduate"]],
    ],
    exams: ["CBSE Boards", "ICSE / ISC", "JEE", "NEET", "CUET"],
    schools: IN_LIST,
  },
  CA: {
    name: "Canada", system: "Provincial curricula",
    levels: [
      ["Elementary", ["Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"]],
      ["Middle / junior high", ["Grade 7", "Grade 8", "Grade 9"]],
      ["High school", ["Grade 10", "Grade 11", "Grade 12"]],
      ["College / university", ["Year 1", "Year 2", "Year 3", "Year 4", "Graduate school"]],
    ],
    exams: ["Provincial exams", "IB", "AP", "SAT"],
    schools: CA_LIST,
  },
  AU: {
    name: "Australia", system: "Australian Curriculum",
    levels: [
      ["Primary", ["Foundation", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6"]],
      ["Secondary", ["Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12"]],
      ["University / TAFE", ["First year", "Second year", "Third year", "Postgraduate"]],
    ],
    exams: ["NAPLAN", "HSC / VCE / QCE (ATAR)"],
    schools: AU_LIST,
  },
  PH: {
    name: "Philippines", system: "K-12 (DepEd)",
    levels: [
      ["Elementary", ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"]],
      ["Junior high", ["Grade 7", "Grade 8", "Grade 9", "Grade 10"]],
      ["Senior high", ["Grade 11", "Grade 12"]],
      ["College", ["1st year", "2nd year", "3rd year", "4th year", "Graduate school"]],
    ],
    exams: ["NCAE", "UPCAT", "College entrance tests"],
    schools: ["University of the Philippines", "Ateneo de Manila University", "De La Salle University", "University of Santo Tomas", "Philippine Science High School"],
  },
  PK: {
    name: "Pakistan", system: "Matric / Intermediate (and O/A levels)",
    levels: [
      ["Primary", ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5"]],
      ["Middle", ["Class 6", "Class 7", "Class 8"]],
      ["Matric", ["Class 9", "Class 10"]],
      ["Intermediate", ["FSc / FA 1st year", "FSc / FA 2nd year"]],
      ["University", ["First year", "Second year", "Third year", "Fourth year", "Postgraduate"]],
    ],
    exams: ["Matric", "FSc / FA", "MDCAT", "ECAT", "O / A levels"],
    schools: ["LUMS", "NUST", "University of the Punjab", "Aga Khan University", "University of Karachi", "COMSATS University"],
  },
};

// Used when a country has no list of its own.
export const GENERIC_CURRICULUM = {
  name: "Other", system: "your national curriculum",
  levels: [
    ["Primary", ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"]],
    ["Lower secondary", ["Grade 7", "Grade 8", "Grade 9"]],
    ["Upper secondary", ["Grade 10", "Grade 11", "Grade 12"]],
    ["College / university", ["Year 1", "Year 2", "Year 3", "Year 4", "Postgraduate"]],
    ["Other", ["Self-learner", "Adult learner", "Homeschool"]],
  ],
  exams: [],
  schools: [],
};

export const GENDERS = [
  ["female", "Female"],
  ["male", "Male"],
  ["nonbinary", "Non-binary"],
  ["prefer_not", "Prefer not to say"],
];

// Every region code. Names come from the browser (Intl.DisplayNames), so the list stays short.
export const COUNTRY_CODES = (
  "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI KH CM CA CV CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MR MU MX MD MC MN ME MA MZ MM NA NP NL NZ NI NE NG MK NO OM PK PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW PS XK"
).split(" ");

export function countryName(code) {
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return CURRICULA[code]?.name || code;
  }
}

export function curriculumFor(code) {
  return CURRICULA[code] || GENERIC_CURRICULUM;
}

const TZ_COUNTRY = {
  "Africa/Lagos": "NG", "Africa/Accra": "GH", "Africa/Nairobi": "KE", "Africa/Johannesburg": "ZA",
  "Africa/Kampala": "UG", "Africa/Dar_es_Salaam": "TZ", "Africa/Lusaka": "ZM", "Africa/Harare": "ZW",
  "Africa/Cairo": "EG", "Africa/Addis_Ababa": "ET", "Africa/Dakar": "SN", "Africa/Abidjan": "CI",
  "Africa/Casablanca": "MA", "Africa/Algiers": "DZ", "Africa/Tunis": "TN",
  "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Karachi": "PK", "Asia/Dhaka": "BD", "Asia/Manila": "PH",
  "Asia/Jakarta": "ID", "Asia/Singapore": "SG", "Asia/Kuala_Lumpur": "MY", "Asia/Dubai": "AE",
  "Asia/Riyadh": "SA", "Asia/Tokyo": "JP", "Asia/Seoul": "KR", "Asia/Shanghai": "CN", "Asia/Colombo": "LK",
  "Asia/Kathmandu": "NP", "Asia/Bangkok": "TH", "Asia/Ho_Chi_Minh": "VN",
  "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Paris": "FR", "Europe/Berlin": "DE", "Europe/Madrid": "ES",
  "Europe/Rome": "IT", "Europe/Amsterdam": "NL", "Europe/Lisbon": "PT", "Europe/Warsaw": "PL", "Europe/Istanbul": "TR",
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Perth": "AU", "Australia/Brisbane": "AU",
  "Pacific/Auckland": "NZ",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA", "America/Winnipeg": "CA", "America/Halifax": "CA",
  "America/Sao_Paulo": "BR", "America/Mexico_City": "MX", "America/Bogota": "CO", "America/Lima": "PE",
  "America/Argentina/Buenos_Aires": "AR", "America/Santiago": "CL", "America/Jamaica": "JM",
  "America/Port_of_Spain": "TT", "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US",
  "America/Los_Angeles": "US", "America/Phoenix": "US", "America/Anchorage": "US", "Pacific/Honolulu": "US",
};

// Browser only. Reads the phone's language region ("en-NG") then its time zone.
// Returns a country code or "". The person can always change it.
export function detectCountry() {
  try {
    const langs = (typeof navigator !== "undefined" && (navigator.languages || [navigator.language])) || [];
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const fromTz = TZ_COUNTRY[tz] || "";
    for (const l of langs) {
      const m = /-([A-Za-z]{2})$/.exec(l || "");
      const code = m ? m[1].toUpperCase() : "";
      // Trust the language region when it agrees with the time zone, or when the time zone is unknown.
      if (code && COUNTRY_CODES.includes(code) && (!fromTz || fromTz === code)) return code;
    }
    if (fromTz) return fromTz;
    for (const l of langs) {
      const m = /-([A-Za-z]{2})$/.exec(l || "");
      const code = m ? m[1].toUpperCase() : "";
      if (code && COUNTRY_CODES.includes(code)) return code;
    }
  } catch {}
  return "";
}

// Server side checks for the register route.
export function cleanCountry(v) {
  const c = typeof v === "string" ? v.trim().toUpperCase() : "";
  return COUNTRY_CODES.includes(c) ? c : null;
}
export function cleanGender(v) {
  return GENDERS.some(([k]) => k === v) ? v : null;
}
export function cleanText(v, max) {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
}

// A short line for Syna: "Student is in SS 2 in Nigeria (Nigerian 6-3-3-4 system). Exams: WAEC...".
export function educationContext(countryCode, classLevel, school) {
  if (!countryCode && !classLevel) return "";
  const cur = curriculumFor(countryCode);
  const where = countryCode ? countryName(countryCode) : "an unknown country";
  const bits = [];
  bits.push(`The student is ${classLevel ? `in ${classLevel} ` : ""}in ${where}${countryCode && CURRICULA[countryCode] ? ` (${cur.system})` : ""}.`);
  if (school) bits.push(`Their school is ${school}.`);
  if (cur.exams.length) bits.push(`Exams they will meet: ${cur.exams.join(", ")}.`);
  bits.push("Use their country's curriculum, class names, exam style and spelling when you explain things or set examples.");
  return bits.join(" ");
}
