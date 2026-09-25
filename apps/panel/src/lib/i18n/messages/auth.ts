import type { Locale } from "../config";

/**
 * Authentication pages: login, register, forgot, reset, verify. Namespace: `auth.*`
 * Starter keys only — the auth translation agent extends this to cover app/auth/*.
 */

const en = {
  signIn: "Sign in",
  register: "Create account",
  email: "Email",
  password: "Password",
  username: "Username",
  forgotPassword: "Forgot password?",
  rememberMe: "Remember me",

  // auth layout
  highlightServersTitle: "Game & app servers",
  highlightServersBody: "Minecraft, Node.js and custom runtimes with hard RAM, disk and CPU ceilings.",
  highlightDomainsTitle: "Domains without ports",
  highlightDomainsBody: "Attach a custom domain or a managed subdomain instead of exposing ip:port.",
  highlightControlTitle: "Real resource control",
  highlightControlBody: "Per-node capacity accounting, allocations, databases and live console access.",
  layoutTagline: "Hosting control plane",
  layoutHeadline: "Deploy, limit and reach your servers from one place.",
  layoutDescFallback: "Game, application and web hosting control panel.",
  layoutSecurityNote: "Sessions are signed, hashed and revocable at any time.",

  // login: metadata
  metaSignIn: "Sign in",

  // login: two-factor step
  twoFactorTitle: "Two-factor authentication",
  twoFactorDesc: "Enter the 6-digit code from your authenticator app, or a recovery code.",
  authenticationCode: "Authentication code",
  verifying: "Verifying…",
  verifyAndSignIn: "Verify and sign in",
  lostDevice: "Lost your device? Use one of your one-time recovery codes above.",

  // login: main form
  signInTo: "Sign in to {name}",
  useUsernameOrEmail: "Use your username or email address.",
  usernameOrEmail: "Username or email",
  usernameOrEmailPlaceholder: "admin or admin@example.com",
  passwordPlaceholder: "••••••••••",
  keepSignedIn: "Keep me signed in on this device",
  signingIn: "Signing in…",
  didntGetVerification: "Didn't get the verification email?",
  emailPlaceholder: "admin@example.com",
  sending: "Sending…",
  resendVerificationEmail: "Resend verification email",
  noAccountYet: "No account yet?",
  createOne: "Create one",
  accountsProvisioned: "Accounts are provisioned by an administrator.",

  // register: metadata
  metaRegister: "Create account",

  // register: closed state
  registrationClosed: "Registration is closed",
  registrationClosedDesc:
    "The administrator account for {name} already exists. Ask an administrator to create an account for you, then sign in.",
  backToSignIn: "Back to sign in",

  // register: success state
  checkInbox: "Check your inbox",
  goToSignIn: "Go to sign in",

  // register: form
  firstRunSetup: "First run setup",
  createAdminAccount: "Create the administrator account",
  joinSite: "Join {name}",
  createAdminDesc: "This account owns the panel: nodes, users, domains and every server.",
  createAccountDesc: "Fill in your details to create an account.",
  firstName: "First name",
  firstNamePlaceholder: "Ali",
  lastName: "Last name",
  lastNamePlaceholder: "Hassan",
  usernameHint: "Used for signing in. Letters, numbers, dot, dash, underscore.",
  usernamePlaceholder: "admin",
  emailAddress: "Email address",
  passwordMin8: "At least 8 characters",
  confirmPassword: "Confirm password",
  repeatPassword: "Repeat the password",
  creatingAccount: "Creating account…",
  createAdministrator: "Create administrator",
  createAccount: "Create account",
  alreadyHaveAccount: "Already have an account?",

  // password strength
  strengthVeryWeak: "Very weak",
  strengthWeak: "Weak",
  strengthFair: "Fair",
  strengthGood: "Good",
  strengthStrong: "Strong",
  strengthExcellent: "Excellent",

  // forgot password
  metaForgot: "Forgot password",
  resetUnavailable: "Password reset unavailable",
  resetUnavailableDesc:
    "Self-service password resets are currently disabled. Contact an administrator for help accessing your account.",
  resetYourPassword: "Reset your password",
  resetYourPasswordDesc: "Enter your username or email and we'll send you a reset link.",
  sendResetLink: "Send reset link",
  rememberedIt: "Remembered it?",

  // reset password
  metaReset: "Reset password",
  resetLinkInvalid: "Reset link invalid",
  resetLinkMalformedDesc:
    "This reset link is missing or malformed. Request a new one from the forgot password page.",
  resetDisabledDesc: "Self-service password resets are currently disabled.",
  requestNewLink: "Request a new link",
  passwordResetDone: "Password reset",
  chooseNewPassword: "Choose a new password",
  chooseNewPasswordDesc: "Set a new password for your account. All active sessions will be signed out.",
  newPassword: "New password",
  newPasswordPlaceholder: "New password",
  saving: "Saving…",
  resetPassword: "Reset password",

  // verify email
  metaVerify: "Verify email",
  emailVerified: "Email verified",
  emailVerifiedDesc: "Your email address has been confirmed. You can now sign in to {name}.",
  verificationInvalid: "Verification link invalid",
  verificationInvalidDesc:
    "This verification link is invalid, has expired or has already been used. Sign in to request a new link.",
} as const;

const ar: Record<keyof typeof en, string> = {
  signIn: "تسجيل الدخول",
  register: "إنشاء حساب",
  email: "البريد الإلكتروني",
  password: "كلمة المرور",
  username: "اسم المستخدم",
  forgotPassword: "هل نسيت كلمة المرور؟",
  rememberMe: "تذكّرني",

  // auth layout
  highlightServersTitle: "خوادم الألعاب والتطبيقات",
  highlightServersBody: "Minecraft و Node.js وبيئات تشغيل مخصصة مع حدود صارمة للذاكرة والقرص والمعالج.",
  highlightDomainsTitle: "نطاقات دون منافذ",
  highlightDomainsBody: "أرفق نطاقاً مخصصاً أو نطاقاً فرعياً مُداراً بدلاً من كشف ip:port.",
  highlightControlTitle: "تحكم حقيقي بالموارد",
  highlightControlBody: "محاسبة سعة لكل عقدة، وتخصيصات، وقواعد بيانات، ووصول إلى وحدة تحكم فورية.",
  layoutTagline: "لوحة التحكم بالاستضافة",
  layoutHeadline: "انشر خوادمك وحدّدها وتواصل معها من مكان واحد.",
  layoutDescFallback: "لوحة تحكم لاستضافة الألعاب والتطبيقات والمواقع.",
  layoutSecurityNote: "الجلسات موقّعة ومُجزّأة وقابلة للإبطال في أي وقت.",

  // login: metadata
  metaSignIn: "تسجيل الدخول",

  // login: two-factor step
  twoFactorTitle: "المصادقة الثنائية",
  twoFactorDesc: "أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة، أو رمز استرداد.",
  authenticationCode: "رمز المصادقة",
  verifying: "جارٍ التحقق…",
  verifyAndSignIn: "تحقق وسجّل الدخول",
  lostDevice: "فقدت جهازك؟ استخدم أحد رموز الاسترداد لمرة واحدة أعلاه.",

  // login: main form
  signInTo: "تسجيل الدخول إلى {name}",
  useUsernameOrEmail: "استخدم اسم المستخدم أو البريد الإلكتروني.",
  usernameOrEmail: "اسم المستخدم أو البريد الإلكتروني",
  usernameOrEmailPlaceholder: "admin أو admin@example.com",
  passwordPlaceholder: "••••••••••",
  keepSignedIn: "أبقني مسجّل الدخول على هذا الجهاز",
  signingIn: "جارٍ تسجيل الدخول…",
  didntGetVerification: "لم يصلك بريد التحقق؟",
  emailPlaceholder: "admin@example.com",
  sending: "جارٍ الإرسال…",
  resendVerificationEmail: "إعادة إرسال بريد التحقق",
  noAccountYet: "ليس لديك حساب بعد؟",
  createOne: "أنشئ حساباً",
  accountsProvisioned: "يتم توفير الحسابات من قِبل المسؤول.",

  // register: metadata
  metaRegister: "إنشاء حساب",

  // register: closed state
  registrationClosed: "التسجيل مغلق",
  registrationClosedDesc:
    "حساب المسؤول الخاص بـ {name} موجود بالفعل. اطلب من المسؤول إنشاء حساب لك، ثم سجّل الدخول.",
  backToSignIn: "العودة إلى تسجيل الدخول",

  // register: success state
  checkInbox: "تحقق من بريدك الوارد",
  goToSignIn: "الذهاب إلى تسجيل الدخول",

  // register: form
  firstRunSetup: "إعداد التشغيل الأول",
  createAdminAccount: "إنشاء حساب المسؤول",
  joinSite: "انضم إلى {name}",
  createAdminDesc: "يملك هذا الحساب اللوحة بالكامل: العُقد والمستخدمون والنطاقات وكل خادم.",
  createAccountDesc: "املأ بياناتك لإنشاء حساب.",
  firstName: "الاسم الأول",
  firstNamePlaceholder: "علي",
  lastName: "اسم العائلة",
  lastNamePlaceholder: "حسن",
  usernameHint: "يُستخدم لتسجيل الدخول. حروف وأرقام ونقطة وشرطة وشرطة سفلية.",
  usernamePlaceholder: "admin",
  emailAddress: "البريد الإلكتروني",
  passwordMin8: "8 أحرف على الأقل",
  confirmPassword: "تأكيد كلمة المرور",
  repeatPassword: "أعد إدخال كلمة المرور",
  creatingAccount: "جارٍ إنشاء الحساب…",
  createAdministrator: "إنشاء المسؤول",
  createAccount: "إنشاء حساب",
  alreadyHaveAccount: "هل لديك حساب بالفعل؟",

  // password strength
  strengthVeryWeak: "ضعيفة جداً",
  strengthWeak: "ضعيفة",
  strengthFair: "مقبولة",
  strengthGood: "جيدة",
  strengthStrong: "قوية",
  strengthExcellent: "ممتازة",

  // forgot password
  metaForgot: "نسيت كلمة المرور",
  resetUnavailable: "إعادة تعيين كلمة المرور غير متاحة",
  resetUnavailableDesc:
    "إعادة تعيين كلمة المرور الذاتية معطّلة حالياً. تواصل مع المسؤول للمساعدة في الوصول إلى حسابك.",
  resetYourPassword: "إعادة تعيين كلمة المرور",
  resetYourPasswordDesc: "أدخل اسم المستخدم أو البريد الإلكتروني وسنرسل لك رابط إعادة التعيين.",
  sendResetLink: "إرسال رابط إعادة التعيين",
  rememberedIt: "تذكّرتها؟",

  // reset password
  metaReset: "إعادة تعيين كلمة المرور",
  resetLinkInvalid: "رابط إعادة التعيين غير صالح",
  resetLinkMalformedDesc:
    "رابط إعادة التعيين هذا مفقود أو تالف. اطلب رابطاً جديداً من صفحة نسيت كلمة المرور.",
  resetDisabledDesc: "إعادة تعيين كلمة المرور الذاتية معطّلة حالياً.",
  requestNewLink: "طلب رابط جديد",
  passwordResetDone: "تمت إعادة تعيين كلمة المرور",
  chooseNewPassword: "اختر كلمة مرور جديدة",
  chooseNewPasswordDesc: "عيّن كلمة مرور جديدة لحسابك. سيتم تسجيل الخروج من جميع الجلسات النشطة.",
  newPassword: "كلمة المرور الجديدة",
  newPasswordPlaceholder: "كلمة المرور الجديدة",
  saving: "جارٍ الحفظ…",
  resetPassword: "إعادة تعيين كلمة المرور",

  // verify email
  metaVerify: "تأكيد البريد الإلكتروني",
  emailVerified: "تم تأكيد البريد الإلكتروني",
  emailVerifiedDesc: "تم تأكيد بريدك الإلكتروني. يمكنك الآن تسجيل الدخول إلى {name}.",
  verificationInvalid: "رابط التحقق غير صالح",
  verificationInvalidDesc:
    "رابط التحقق هذا غير صالح أو انتهت صلاحيته أو تم استخدامه بالفعل. سجّل الدخول لطلب رابط جديد.",
};

export const auth: Record<Locale, Record<keyof typeof en, string>> = { en, ar };
