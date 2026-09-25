import type { Locale } from "../config";

/**
 * Landing / marketing / public-facing pages. Namespace: `public.*`
 * (Named `publicSite` because `public` is a reserved-ish word in some tooling.)
 *
 * Starter keys only — the public-area translation agent extends this to cover
 * every string in app/(public)/*. Keep en and ar key sets identical.
 */

const en = {
  signIn: "Sign in",
  getStarted: "Get started",
  goToDashboard: "Go to dashboard",
  home: "Home",
  pricing: "Pricing",
  docs: "Docs",
  status: "Status",

  // layout
  dashboard: "Dashboard",

  // landing hero
  metaHome: "{name} · Hosting that gets out of your way",
  heroBadge: "Game, application & web hosting",
  heroTitle: "Hosting that gets out of your way.",
  heroDesc:
    "Spin up game servers, applications and websites from one clean control panel. Real-time consoles, enforced resource limits and backups built in — so you spend your time building, not babysitting infrastructure.",
  viewPricing: "View pricing",
  signedInAs: "Signed in as",
  noPlan: "No plan",
  packagesUnlockedOne: "{count} package unlocked",
  packagesUnlockedOther: "{count} packages unlocked",

  // landing: game servers section
  gameServers: "Game servers",
  gameServersTitle: "Launch a server in a couple of clicks",
  gameServersDesc:
    "Pick a template, choose your resources and go. Everything you need to run and manage a game server lives in one place.",

  // landing: web hosting section
  webHosting: "Web hosting",
  webHostingTitle: "Websites and apps, managed end to end",
  webHostingDesc:
    "Deploy static sites or PHP applications with domains, HTTPS, databases and backups handled for you.",

  // landing: feature cards
  featConsoleTitle: "Live console & power",
  featConsoleBody:
    "Start, stop and restart from a real-time console with instant log streaming — no SSH required.",
  featEggsTitle: "One-click game eggs",
  featEggsBody:
    "Deploy Minecraft, source engine and dozens of other servers from curated templates in seconds.",
  featLimitsTitle: "Resource limits you control",
  featLimitsBody:
    "Memory, CPU, disk and network caps are enforced per server so one workload never starves another.",
  featStaticTitle: "Static & PHP hosting",
  featStaticBody: "Ship HTML or PHP apps with managed runtimes, custom domains and automatic HTTPS.",
  featDbTitle: "Databases & backups",
  featDbBody: "Provision databases, rotate credentials and schedule backups without leaving the panel.",
  featIsolatedTitle: "Isolated by default",
  featIsolatedBody: "Every site and server runs sandboxed, with per-account limits and clean separation.",

  // landing: CTA
  ctaTitleUser: "Deploy another server?",
  ctaTitleGuest: "Ready to deploy?",
  ctaDescUser: "Jump back into your panel and spin up your next server or site in minutes.",
  ctaDescGuest: "Create an account and have your first server or site running in minutes.",
  comparePlans: "Compare plans",

  // landing: hero highlights
  heroPointConsole: "Real-time consoles",
  heroPointLimits: "Enforced resource limits",
  heroPointBackups: "Backups built in",

  // landing: how it works
  howItWorks: "How it works",
  howItWorksTitle: "From zero to running in three steps",
  howItWorksDesc:
    "No servers to rack, no toolchains to wire up. Pick a template, set your resources and manage everything from one panel.",
  step1Title: "Choose a template",
  step1Body: "Start from a curated game, application or website template tuned to run out of the box.",
  step2Title: "Set your resources",
  step2Body: "Pick a plan and the panel enforces memory, CPU and disk limits for you automatically.",
  step3Title: "Deploy & manage",
  step3Body: "Get a live console, files, databases and backups the moment your server is ready.",

  // landing: pricing teaser
  pricingTeaserTitle: "Pricing that scales with you",
  pricingTeaserDesc: "Transparent plans with exactly the resources you need — no hidden limits, no surprises.",
  pricingTeaserStartingAt: "Plans starting at",

  // footer
  footerTagline: "Game, application and web hosting from one clean control panel.",
  footerProduct: "Product",
  footerResources: "Resources",
  footerAccount: "Account",
  footerRights: "All rights reserved.",

  // docs page
  metaDocs: "Documentation",
  docsBadge: "Documentation",
  docsTitle: "Getting started",
  docsDesc:
    "A quick tour of everything the panel can do — from launching your first server to shipping a website.",
  onThisPage: "On this page",
  docFirstServerTitle: "Creating your first server",
  docFilesTitle: "Managing files",
  docDatabasesTitle: "Databases",
  docBackupsTitle: "Backups",
  docWebHostingTitle: "Web hosting",
  docSupportTitle: "Support",
  docCreateServer: "Create server",
  docFirstServerP1a: "Head to your dashboard and choose ",
  docFirstServerP1b:
    ". Pick the type of workload you want to run — a game server, an application, or a website — and the panel walks you through the rest.",
  docFirstServerP2:
    "Select a plan to set your resource limits, give the server a name, and confirm. The panel provisions the container, installs your chosen template and hands you a live console the moment it is ready. From there you can start, stop and restart the server and watch its logs stream in real time.",
  docFilesP1:
    "Every server ships with a built-in file manager. Browse directories, upload and download files, edit configuration in place and unpack archives without touching the command line.",
  docFilesP2:
    "Prefer to work locally? Grant a subuser access, or use the file tools to pull down a copy, make your changes and push them back. Permissions are granular, so you decide exactly what each collaborator can read or write.",
  docDatabasesP1:
    "Provision a database straight from the server view. The panel generates credentials for you and shows the host and connection details your application needs.",
  docDatabasesP2:
    "You can rotate passwords at any time and remove databases you no longer use. Each plan sets how many databases a server may create, so you always know where you stand against your limit.",
  docBackupsP1:
    "Create on-demand backups before a risky change, or keep a rolling set of restore points. Backups capture your server contents so you can roll back cleanly if something goes wrong.",
  docBackupsP2:
    "Your plan defines how many backups a server may keep. When you hit the limit, remove an old one to make room, or restore from any point in your history.",
  docWebHostingP1:
    "Hosting a website works the same way. Choose a static (HTML) or PHP runtime, point a custom domain at your site and let the panel handle HTTPS automatically.",
  docWebHostingP2:
    "Databases and backups are available to web workloads too, so a dynamic app has everything it needs in one place — no separate services to wire together.",
  docSupportP1a: "Need a hand? Open a support ticket from your dashboard and our team will pick it up. Check the ",
  docStatusPageLink: "status page",
  docSupportP1b: " first to see whether an ongoing incident might explain what you are seeing.",
  docSupportP2a: "Ready to dive in? ",
  docCreateAccount: "Create an account",
  docSupportP2b: " and deploy your first server.",

  // pricing page
  metaPricing: "Pricing",
  pricingBadge: "Pricing",
  pricingTitle: "Simple, transparent plans",
  pricingDesc:
    "Pick a package that fits your workload. Every plan lists exactly what you get — no hidden limits.",
  plansComingSoon: "Plans coming soon",
  plansComingSoonDesc:
    "There are no public packages available right now. Check back shortly or create an account to get started.",
  createAccount: "Create an account",
  resMemory: "{value} memory",
  resDisk: "{value} disk",
  resCpu: "{value} CPU",
  resDatabaseOne: "{count} database",
  resDatabaseOther: "{count} databases",
  resBackupOne: "{count} backup",
  resBackupOther: "{count} backups",
  resPortOne: "{count} extra port",
  resPortOther: "{count} extra ports",

  // status page
  metaStatus: "System status",
  statusTitle: "System status",
  majorOutage: "Major outage",
  degradedPerformance: "Degraded performance",
  allSystemsOperational: "All systems operational",
  activeIncidentsTrackedOne: "{count} active incident being tracked.",
  activeIncidentsTrackedOther: "{count} active incidents being tracked.",
  runningNormally: "Everything is running normally.",
  components: "Components",
  noComponents: "No components configured",
  noComponentsDesc: "Service components will appear here once they are added.",
  degraded: "Degraded",
  operational: "Operational",
  activeIncidents: "Active incidents",
  recentHistory: "Recent history",
  noResolvedIncidents: "No resolved incidents to show.",
  incidentStarted: "Started {date}",
  incidentResolvedSuffix: " · Resolved {date}",
  // status monitoring — per-component state + 90-day uptime bars
  stateUp: "Operational",
  stateDown: "Outage",
  stateDegraded: "Degraded",
  stateUnknown: "Not monitored",
  uptime90: "{percent}% uptime",
  uptime90Days: "90 days ago",
  uptimeToday: "Today",
  uptimeNoData: "No data",
  uptimeDayUp: "{day}: operational",
  uptimeDayDown: "{day}: outage",
  uptimeDayPartial: "{day}: partial outage ({percent}%)",
  uptimeDayNone: "{day}: no data",
  lastChecked: "Checked {time}",
  latencyMs: "{ms}ms",
  uncategorised: "Other",
} as const;

const ar: Record<keyof typeof en, string> = {
  signIn: "تسجيل الدخول",
  getStarted: "ابدأ الآن",
  goToDashboard: "الذهاب إلى لوحة التحكم",
  home: "الرئيسية",
  pricing: "الأسعار",
  docs: "التوثيق",
  status: "الحالة",

  // layout
  dashboard: "لوحة التحكم",

  // landing hero
  metaHome: "{name} · استضافة لا تقف في طريقك",
  heroBadge: "استضافة الألعاب والتطبيقات والمواقع",
  heroTitle: "استضافة لا تقف في طريقك.",
  heroDesc:
    "أنشئ خوادم الألعاب والتطبيقات والمواقع من لوحة تحكم واحدة أنيقة. وحدات تحكم فورية، وحدود موارد مفروضة، ونسخ احتياطية مدمجة — لتقضي وقتك في البناء لا في مراقبة البنية التحتية.",
  viewPricing: "عرض الأسعار",
  signedInAs: "مسجّل الدخول باسم",
  noPlan: "لا توجد خطة",
  packagesUnlockedOne: "تم فتح حزمة واحدة",
  packagesUnlockedOther: "تم فتح {count} حزمة",

  // landing: game servers section
  gameServers: "خوادم الألعاب",
  gameServersTitle: "أطلق خادماً ببضع نقرات",
  gameServersDesc:
    "اختر قالباً وحدد مواردك وانطلق. كل ما تحتاجه لتشغيل خادم ألعاب وإدارته موجود في مكان واحد.",

  // landing: web hosting section
  webHosting: "استضافة المواقع",
  webHostingTitle: "مواقع وتطبيقات، مُدارة من البداية إلى النهاية",
  webHostingDesc:
    "انشر المواقع الثابتة أو تطبيقات PHP مع تكفّل اللوحة بالنطاقات و HTTPS وقواعد البيانات والنسخ الاحتياطية.",

  // landing: feature cards
  featConsoleTitle: "وحدة تحكم فورية والتحكم بالطاقة",
  featConsoleBody:
    "ابدأ وأوقف وأعد التشغيل من وحدة تحكم فورية مع بث فوري للسجلات — دون الحاجة إلى SSH.",
  featEggsTitle: "قوالب ألعاب بنقرة واحدة",
  featEggsBody:
    "انشر Minecraft ومحرك Source وعشرات الخوادم الأخرى من قوالب منسّقة في ثوانٍ.",
  featLimitsTitle: "حدود موارد تتحكم بها",
  featLimitsBody:
    "تُفرض حدود الذاكرة والمعالج والقرص والشبكة لكل خادم بحيث لا يستهلك حمل عمل موارد الآخر.",
  featStaticTitle: "استضافة ثابتة و PHP",
  featStaticBody: "انشر تطبيقات HTML أو PHP مع بيئات تشغيل مُدارة ونطاقات مخصصة و HTTPS تلقائي.",
  featDbTitle: "قواعد البيانات والنسخ الاحتياطية",
  featDbBody: "أنشئ قواعد البيانات وبدّل بيانات الاعتماد وجدول النسخ الاحتياطية دون مغادرة اللوحة.",
  featIsolatedTitle: "معزول افتراضياً",
  featIsolatedBody: "يعمل كل موقع وخادم في بيئة معزولة، مع حدود لكل حساب وفصل تام.",

  // landing: CTA
  ctaTitleUser: "هل تريد نشر خادم آخر؟",
  ctaTitleGuest: "هل أنت مستعد للنشر؟",
  ctaDescUser: "عد إلى لوحتك وأنشئ خادمك أو موقعك التالي في دقائق.",
  ctaDescGuest: "أنشئ حساباً واجعل أول خادم أو موقع لك يعمل في دقائق.",
  comparePlans: "قارن الخطط",

  // landing: hero highlights
  heroPointConsole: "وحدات تحكم فورية",
  heroPointLimits: "حدود موارد مفروضة",
  heroPointBackups: "نسخ احتياطية مدمجة",

  // landing: how it works
  howItWorks: "كيف تعمل",
  howItWorksTitle: "من الصفر إلى التشغيل في ثلاث خطوات",
  howItWorksDesc:
    "لا خوادم لتركيبها ولا أدوات لربطها. اختر قالباً، حدد مواردك وأدر كل شيء من لوحة واحدة.",
  step1Title: "اختر قالباً",
  step1Body: "ابدأ من قالب منسّق للألعاب أو التطبيقات أو المواقع مهيأ للعمل مباشرة.",
  step2Title: "حدد مواردك",
  step2Body: "اختر خطة وتفرض اللوحة حدود الذاكرة والمعالج والقرص نيابةً عنك تلقائياً.",
  step3Title: "انشر وأدر",
  step3Body: "احصل على وحدة تحكم فورية وملفات وقواعد بيانات ونسخ احتياطية بمجرد جاهزية خادمك.",

  // landing: pricing teaser
  pricingTeaserTitle: "أسعار تنمو معك",
  pricingTeaserDesc: "خطط شفافة بالموارد التي تحتاجها تماماً — دون حدود خفية ولا مفاجآت.",
  pricingTeaserStartingAt: "خطط تبدأ من",

  // footer
  footerTagline: "استضافة الألعاب والتطبيقات والمواقع من لوحة تحكم واحدة أنيقة.",
  footerProduct: "المنتج",
  footerResources: "الموارد",
  footerAccount: "الحساب",
  footerRights: "جميع الحقوق محفوظة.",

  // docs page
  metaDocs: "التوثيق",
  docsBadge: "التوثيق",
  docsTitle: "البدء",
  docsDesc:
    "جولة سريعة في كل ما يمكن للوحة القيام به — من إطلاق أول خادم لك إلى نشر موقع إلكتروني.",
  onThisPage: "في هذه الصفحة",
  docFirstServerTitle: "إنشاء أول خادم لك",
  docFilesTitle: "إدارة الملفات",
  docDatabasesTitle: "قواعد البيانات",
  docBackupsTitle: "النسخ الاحتياطية",
  docWebHostingTitle: "استضافة المواقع",
  docSupportTitle: "الدعم",
  docCreateServer: "إنشاء خادم",
  docFirstServerP1a: "توجّه إلى لوحة التحكم واختر ",
  docFirstServerP1b:
    ". اختر نوع حمل العمل الذي تريد تشغيله — خادم ألعاب أو تطبيق أو موقع إلكتروني — وترشدك اللوحة خلال بقية الخطوات.",
  docFirstServerP2:
    "اختر خطة لتحديد حدود مواردك، وامنح الخادم اسماً، ثم أكّد. تجهّز اللوحة الحاوية وتثبّت القالب الذي اخترته وتمنحك وحدة تحكم فورية بمجرد جاهزيته. من هناك يمكنك بدء الخادم وإيقافه وإعادة تشغيله ومراقبة سجلاته تُبث في الوقت الفعلي.",
  docFilesP1:
    "يأتي كل خادم مع مدير ملفات مدمج. تصفّح المجلدات، ارفع الملفات ونزّلها، عدّل الإعدادات في مكانها وفك ضغط الأرشيفات دون لمس سطر الأوامر.",
  docFilesP2:
    "تفضّل العمل محلياً؟ امنح مستخدماً فرعياً صلاحية الوصول، أو استخدم أدوات الملفات لتنزيل نسخة وإجراء تغييراتك ثم إعادة رفعها. الصلاحيات دقيقة، فأنت تقرر تماماً ما يمكن لكل متعاون قراءته أو كتابته.",
  docDatabasesP1:
    "أنشئ قاعدة بيانات مباشرة من عرض الخادم. تولّد لك اللوحة بيانات الاعتماد وتعرض المضيف وتفاصيل الاتصال التي يحتاجها تطبيقك.",
  docDatabasesP2:
    "يمكنك تبديل كلمات المرور في أي وقت وإزالة قواعد البيانات التي لم تعد تستخدمها. تحدد كل خطة عدد قواعد البيانات التي يمكن للخادم إنشاؤها، لتعرف دائماً موقعك من الحد المسموح.",
  docBackupsP1:
    "أنشئ نسخاً احتياطية عند الطلب قبل إجراء تغيير محفوف بالمخاطر، أو احتفظ بمجموعة متجددة من نقاط الاستعادة. تلتقط النسخ الاحتياطية محتويات خادمك لتتمكن من التراجع بسلاسة إذا حدث خطأ ما.",
  docBackupsP2:
    "تحدد خطتك عدد النسخ الاحتياطية التي يمكن للخادم الاحتفاظ بها. عند بلوغ الحد، أزل نسخة قديمة لإفساح المجال، أو استعد من أي نقطة في سجلّك.",
  docWebHostingP1:
    "تعمل استضافة موقع إلكتروني بالطريقة نفسها. اختر بيئة تشغيل ثابتة (HTML) أو PHP، ووجّه نطاقاً مخصصاً إلى موقعك ودع اللوحة تتولى HTTPS تلقائياً.",
  docWebHostingP2:
    "تتوفر قواعد البيانات والنسخ الاحتياطية لأحمال عمل الويب أيضاً، فيمتلك التطبيق الديناميكي كل ما يحتاجه في مكان واحد — دون خدمات منفصلة لربطها معاً.",
  docSupportP1a: "بحاجة إلى مساعدة؟ افتح تذكرة دعم من لوحة التحكم وسيتولاها فريقنا. تحقق من ",
  docStatusPageLink: "صفحة الحالة",
  docSupportP1b: " أولاً لمعرفة ما إذا كان هناك عطل جارٍ قد يفسّر ما تراه.",
  docSupportP2a: "مستعد للبدء؟ ",
  docCreateAccount: "إنشاء حساب",
  docSupportP2b: " وانشر أول خادم لك.",

  // pricing page
  metaPricing: "الأسعار",
  pricingBadge: "الأسعار",
  pricingTitle: "خطط بسيطة وشفافة",
  pricingDesc:
    "اختر حزمة تناسب حمل عملك. كل خطة تعرض بالضبط ما تحصل عليه — دون حدود خفية.",
  plansComingSoon: "الخطط قادمة قريباً",
  plansComingSoonDesc:
    "لا توجد حزم عامة متاحة حالياً. عد للتحقق قريباً أو أنشئ حساباً للبدء.",
  createAccount: "إنشاء حساب",
  resMemory: "{value} ذاكرة",
  resDisk: "{value} قرص",
  resCpu: "{value} معالج",
  resDatabaseOne: "قاعدة بيانات واحدة",
  resDatabaseOther: "{count} قاعدة بيانات",
  resBackupOne: "نسخة احتياطية واحدة",
  resBackupOther: "{count} نسخة احتياطية",
  resPortOne: "منفذ إضافي واحد",
  resPortOther: "{count} منفذ إضافي",

  // status page
  metaStatus: "حالة النظام",
  statusTitle: "حالة النظام",
  majorOutage: "انقطاع كبير",
  degradedPerformance: "أداء متدهور",
  allSystemsOperational: "جميع الأنظمة تعمل",
  activeIncidentsTrackedOne: "تتم متابعة عطل نشط واحد.",
  activeIncidentsTrackedOther: "تتم متابعة {count} عطل نشط.",
  runningNormally: "كل شيء يعمل بشكل طبيعي.",
  components: "المكوّنات",
  noComponents: "لا توجد مكوّنات مُهيأة",
  noComponentsDesc: "ستظهر مكوّنات الخدمة هنا بمجرد إضافتها.",
  degraded: "متدهور",
  operational: "يعمل",
  activeIncidents: "الأعطال النشطة",
  recentHistory: "السجل الأخير",
  noResolvedIncidents: "لا توجد أعطال محلولة لعرضها.",
  incidentStarted: "بدأ {date}",
  incidentResolvedSuffix: " · حُلّ {date}",
  // مراقبة الحالة — حالة كل عنصر + أشرطة التشغيل لآخر ٩٠ يومًا
  stateUp: "يعمل",
  stateDown: "متوقف",
  stateDegraded: "أداء متدهور",
  stateUnknown: "غير مُراقب",
  uptime90: "نسبة تشغيل {percent}%",
  uptime90Days: "قبل ٩٠ يومًا",
  uptimeToday: "اليوم",
  uptimeNoData: "لا توجد بيانات",
  uptimeDayUp: "{day}: يعمل",
  uptimeDayDown: "{day}: متوقف",
  uptimeDayPartial: "{day}: انقطاع جزئي ({percent}%)",
  uptimeDayNone: "{day}: لا توجد بيانات",
  lastChecked: "فُحص {time}",
  latencyMs: "{ms} مللي ثانية",
  uncategorised: "أخرى",
};

export const publicSite: Record<Locale, Record<keyof typeof en, string>> = { en, ar };
