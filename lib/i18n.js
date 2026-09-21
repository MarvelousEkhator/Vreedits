export const LANGUAGES = [
  { code: "en", name: "English", native: "English" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "fr", name: "French", native: "Français" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "ar", name: "Arabic", native: "العربية" },
];

const NAME_TO_CODE = {
  english: "en",
  portuguese: "pt", "português": "pt", portugues: "pt",
  french: "fr", "français": "fr", francais: "fr",
  spanish: "es", "español": "es", espanol: "es",
  arabic: "ar", "العربية": "ar",
};

export function normalizeLang(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (NAME_TO_CODE[v]) return NAME_TO_CODE[v];
  const short = v.split(/[-_]/)[0];
  return LANGUAGES.some((l) => l.code === short) ? short : null;
}

export function detectBrowserLang() {
  if (typeof navigator === "undefined") return "en";
  const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  for (const l of list) {
    const code = normalizeLang(l);
    if (code) return code;
  }
  return "en";
}

export const DICTIONARIES = {
  en: {
    "nav.home": "Home", "nav.inbox": "Inbox", "nav.aiTools": "AI Tools", "nav.school": "School",
    "nav.business": "Business", "nav.writing": "Writing", "nav.travel": "Travel", "nav.homeTools": "Home Tools",
    "nav.communities": "Communities", "nav.favorites": "Favorites", "nav.history": "History",
    "nav.collections": "Collections", "nav.notifications": "Notifications", "nav.premium": "Premium",
    "nav.settings": "Settings", "nav.profile": "My Profile", "nav.helpCenter": "Help Center",
    "nav.contactUs": "Contact Us", "nav.logout": "Logout",
    "menu.viewProfile": "View Profile", "menu.editProfile": "Edit Profile",
    "common.online": "Online", "common.offline": "Offline", "common.comingSoon": "Coming soon",
    "common.search": "Search", "common.cancel": "Cancel", "common.save": "Save",
    "dash.welcomeBack": "Welcome back", "dash.recentAi": "Recent AI Activity",
    "dash.newChat": "New chat", "dash.quickActions": "Quick Actions",
    "settings.title": "Settings", "settings.accountOverview": "Account overview",
    "settings.onlineAuto": "Online now — detected automatically", "settings.emailVerified": "Email verified",
    "settings.memberSince": "Member since", "settings.language": "Language",
    "settings.publicProfile": "Public profile", "settings.privateProfile": "Private profile",
    "settings.privacy": "Privacy", "settings.editProfile": "Edit Profile",
    "settings.helpCenter": "Help Center", "settings.contactUs": "Contact Us",
  },
  pt: {
    "nav.home": "Início", "nav.inbox": "Caixa de entrada", "nav.aiTools": "Ferramentas de IA", "nav.school": "Escola",
    "nav.business": "Negócios", "nav.writing": "Escrita", "nav.travel": "Viagens", "nav.homeTools": "Ferramentas da casa",
    "nav.communities": "Comunidades", "nav.favorites": "Favoritos", "nav.history": "Histórico",
    "nav.collections": "Coleções", "nav.notifications": "Notificações", "nav.premium": "Premium",
    "nav.settings": "Configurações", "nav.profile": "Meu perfil", "nav.helpCenter": "Central de ajuda",
    "nav.contactUs": "Fale conosco", "nav.logout": "Sair",
    "menu.viewProfile": "Ver perfil", "menu.editProfile": "Editar perfil",
    "common.online": "Online", "common.offline": "Offline", "common.comingSoon": "Em breve",
    "common.search": "Pesquisar", "common.cancel": "Cancelar", "common.save": "Salvar",
    "dash.welcomeBack": "Bem-vindo de volta", "dash.recentAi": "Atividade recente de IA",
    "dash.newChat": "Novo chat", "dash.quickActions": "Ações rápidas",
    "settings.title": "Configurações", "settings.accountOverview": "Visão geral da conta",
    "settings.onlineAuto": "Online agora — detectado automaticamente", "settings.emailVerified": "E-mail verificado",
    "settings.memberSince": "Membro desde", "settings.language": "Idioma",
    "settings.publicProfile": "Perfil público", "settings.privateProfile": "Perfil privado",
    "settings.privacy": "Privacidade", "settings.editProfile": "Editar perfil",
    "settings.helpCenter": "Central de ajuda", "settings.contactUs": "Fale conosco",
  },
  fr: {
    "nav.home": "Accueil", "nav.inbox": "Messagerie", "nav.aiTools": "Outils IA", "nav.school": "École",
    "nav.business": "Affaires", "nav.writing": "Écriture", "nav.travel": "Voyages", "nav.homeTools": "Outils maison",
    "nav.communities": "Communautés", "nav.favorites": "Favoris", "nav.history": "Historique",
    "nav.collections": "Collections", "nav.notifications": "Notifications", "nav.premium": "Premium",
    "nav.settings": "Paramètres", "nav.profile": "Mon profil", "nav.helpCenter": "Centre d'aide",
    "nav.contactUs": "Nous contacter", "nav.logout": "Déconnexion",
    "menu.viewProfile": "Voir le profil", "menu.editProfile": "Modifier le profil",
    "common.online": "En ligne", "common.offline": "Hors ligne", "common.comingSoon": "Bientôt disponible",
    "common.search": "Rechercher", "common.cancel": "Annuler", "common.save": "Enregistrer",
    "dash.welcomeBack": "Bon retour", "dash.recentAi": "Activité IA récente",
    "dash.newChat": "Nouveau chat", "dash.quickActions": "Actions rapides",
    "settings.title": "Paramètres", "settings.accountOverview": "Aperçu du compte",
    "settings.onlineAuto": "En ligne — détecté automatiquement", "settings.emailVerified": "E-mail vérifié",
    "settings.memberSince": "Membre depuis", "settings.language": "Langue",
    "settings.publicProfile": "Profil public", "settings.privateProfile": "Profil privé",
    "settings.privacy": "Confidentialité", "settings.editProfile": "Modifier le profil",
    "settings.helpCenter": "Centre d'aide", "settings.contactUs": "Nous contacter",
  },
  es: {
    "nav.home": "Inicio", "nav.inbox": "Bandeja de entrada", "nav.aiTools": "Herramientas de IA", "nav.school": "Escuela",
    "nav.business": "Negocios", "nav.writing": "Escritura", "nav.travel": "Viajes", "nav.homeTools": "Herramientas del hogar",
    "nav.communities": "Comunidades", "nav.favorites": "Favoritos", "nav.history": "Historial",
    "nav.collections": "Colecciones", "nav.notifications": "Notificaciones", "nav.premium": "Premium",
    "nav.settings": "Configuración", "nav.profile": "Mi perfil", "nav.helpCenter": "Centro de ayuda",
    "nav.contactUs": "Contáctanos", "nav.logout": "Cerrar sesión",
    "menu.viewProfile": "Ver perfil", "menu.editProfile": "Editar perfil",
    "common.online": "En línea", "common.offline": "Desconectado", "common.comingSoon": "Próximamente",
    "common.search": "Buscar", "common.cancel": "Cancelar", "common.save": "Guardar",
    "dash.welcomeBack": "Bienvenido de nuevo", "dash.recentAi": "Actividad reciente de IA",
    "dash.newChat": "Nuevo chat", "dash.quickActions": "Acciones rápidas",
    "settings.title": "Configuración", "settings.accountOverview": "Resumen de la cuenta",
    "settings.onlineAuto": "En línea — detectado automáticamente", "settings.emailVerified": "Correo verificado",
    "settings.memberSince": "Miembro desde", "settings.language": "Idioma",
    "settings.publicProfile": "Perfil público", "settings.privateProfile": "Perfil privado",
    "settings.privacy": "Privacidad", "settings.editProfile": "Editar perfil",
    "settings.helpCenter": "Centro de ayuda", "settings.contactUs": "Contáctanos",
  },
  ar: {
    "nav.home": "الرئيسية", "nav.inbox": "صندوق الوارد", "nav.aiTools": "أدوات الذكاء الاصطناعي", "nav.school": "المدرسة",
    "nav.business": "الأعمال", "nav.writing": "الكتابة", "nav.travel": "السفر", "nav.homeTools": "أدوات المنزل",
    "nav.communities": "المجتمعات", "nav.favorites": "المفضلة", "nav.history": "السجل",
    "nav.collections": "المجموعات", "nav.notifications": "الإشعارات", "nav.premium": "بريميوم",
    "nav.settings": "الإعدادات", "nav.profile": "ملفي الشخصي", "nav.helpCenter": "مركز المساعدة",
    "nav.contactUs": "اتصل بنا", "nav.logout": "تسجيل الخروج",
    "menu.viewProfile": "عرض الملف الشخصي", "menu.editProfile": "تعديل الملف الشخصي",
    "common.online": "متصل", "common.offline": "غير متصل", "common.comingSoon": "قريبًا",
    "common.search": "بحث", "common.cancel": "إلغاء", "common.save": "حفظ",
    "dash.welcomeBack": "مرحبًا بعودتك", "dash.recentAi": "نشاط الذكاء الاصطناعي الأخير",
    "dash.newChat": "محادثة جديدة", "dash.quickActions": "إجراءات سريعة",
    "settings.title": "الإعدادات", "settings.accountOverview": "نظرة عامة على الحساب",
    "settings.onlineAuto": "متصل الآن — تم الاكتشاف تلقائيًا", "settings.emailVerified": "تم التحقق من البريد الإلكتروني",
    "settings.memberSince": "عضو منذ", "settings.language": "اللغة",
    "settings.publicProfile": "ملف عام", "settings.privateProfile": "ملف خاص",
    "settings.privacy": "الخصوصية", "settings.editProfile": "تعديل الملف الشخصي",
    "settings.helpCenter": "مركز المساعدة", "settings.contactUs": "اتصل بنا",
  },
};

export function translate(lang, key) {
  return DICTIONARIES[lang]?.[key] ?? DICTIONARIES.en[key] ?? key;
}