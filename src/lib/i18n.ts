import { createContext, useContext } from "react";

export type Lang = "uz" | "ru" | "en";

export const LANG_STORAGE_KEY = "ai-nurse:lang";

export type Dict = {
  appName: string;
  tagline: string;
  chooseLanguage: string;
  chooseLanguageHint: string;
  continue: string;
  signIn: string;
  signInSubtitle: string;
  username: string;
  password: string;
  usernamePlaceholder: string;
  demoHint: string;
  welcome: (u: string) => string;
  enterCreds: string;
  signOut: string;
  nurse: string;
  changeLanguage: string;

  patientManagement: string;
  registeredCount: (a: number, b: number) => string;
  addPatient: string;
  registerPatient: string;
  fullName: string;
  age: string;
  gender: string;
  male: string;
  female: string;
  other: string;
  condition: string;
  assignCabin: string;
  noDevice: string;
  cancel: string;
  add: string;
  searchPatients: string;
  noPatients: string;
  nameAgeRequired: string;
  patientAdded: string;
  online: string;
  offline: string;
  cabinDevice: string;
  openProfile: string;
  cabinUnlinked: string;
  connectedTo: (d: string) => string;

  backToDashboard: string;
  patientNotFound: string;
  takeMedication: string;
  medicationLogged: string;
  simulateNoLiquid: string;
  acknowledgeAlert: string;
  liquidAlertTitle: string;
  liquidAlertDesc: (t: string) => string;
  lastMedication: string;
  lastLiquidEmpty: string;
  notYetTaken: string;
  noIncidents: string;
  autoMode: string;
  manualMode: string;
  autoModeHint: string;
  manualModeHint: string;
  manual: string;
  auto: string;
  bpmSpo2: string;
  heartRate: string;
  oxygenSat: string;
  bloodPressure: string;
  systolic: string;
  diastolic: string;
  cabinEnv: string;
  airTemp: string;
  humidity: string;
  saveVitals: string;
  vitalsSaved: string;
  refresh: string;
  getNewData: string;
  measureBpNow: string;
  bpRequestSent: string;
  callNurseDevice: (d: string) => string;
  cabinDeviceLabel: string;
  lastUpdated: (t: string) => string;
  logCheckupNow: string;
  checkupAdded: string;
  prescriptions: string;
  prescriptionsHint: string;
  prescriptionsPlaceholder: string;
  nurseNotes: string;
  nurseNotesHint: string;
  nurseNotesPlaceholder: string;

  checkupHistory: string;
  checkupHistoryHint: string;
  day: string;
  month: string;
  year: string;
  selectDate: string;
  tapHint: string;
  noCheckupsRange: string;
  checkupsFor: (label: string) => string;
  weekdaysShort: [string, string, string, string, string, string, string];
  noCabin: string;

  installApp: string;
  adminPanel: string;
  adminSubtitle: string;
  nursesList: string;
  addNurse: string;
  editNurse: string;
  deleteNurse: string;
  confirmDelete: string;
  photo: string;
  birthDate: string;
  email: string;
  phone: string;
  login: string;
  save: string;
  noNurses: string;
  nurseAdded: string;
  nurseUpdated: string;
  nurseDeleted: string;
  loginTaken: string;
  requiredFields: string;
  uploadPhoto: string;
  adminHint: string;

  cabinControls: string;
  cabinControlsHint: string;
  antisepticDuration: string;
  antisepticDurationHint: string;
  heaterOn: string;
  heaterOff: string;
  heaterHint: string;
  startAntiseptic: string;
  antisepticStarted: string;
  saveSettings: string;
  settingsSaved: string;
  seconds: string;
  antisepticEvents: string;
  antisepticEventAt: (t: string, s: number) => string;
};

const en: Dict = {
  appName: "AI Nurse",
  tagline: "Medical staff portal",
  chooseLanguage: "Choose your language",
  chooseLanguageHint: "The interface will use the selected language.",
  continue: "Continue",
  signIn: "Sign in",
  signInSubtitle: "Access the patient management dashboard.",
  username: "Username",
  password: "Password",
  usernamePlaceholder: "nurse.jane",
  demoHint: "Demo: any non-empty credentials will work.",
  welcome: (u) => `Welcome, ${u}`,
  enterCreds: "Enter a username and password",
  signOut: "Sign out",
  nurse: "Nurse",
  changeLanguage: "Change language",

  patientManagement: "Patient Management",
  registeredCount: (a, b) => `${a} registered · ${b} assigned to cabins`,
  addPatient: "Add Patient",
  registerPatient: "Register a new patient",
  fullName: "Full name",
  age: "Age",
  gender: "Gender",
  male: "Male",
  female: "Female",
  other: "Other",
  condition: "Condition",
  assignCabin: "Assign cabin (optional)",
  noDevice: "— No device —",
  cancel: "Cancel",
  add: "Add patient",
  searchPatients: "Search patients…",
  noPatients: "No patients found.",
  nameAgeRequired: "Name and age are required",
  patientAdded: "Patient added",
  online: "Online",
  offline: "Offline",
  cabinDevice: "Cabin device",
  openProfile: "Open profile",
  cabinUnlinked: "Cabin unlinked",
  connectedTo: (d) => `Connected to ${d}`,

  backToDashboard: "Back to dashboard",
  patientNotFound: "Patient not found.",
  takeMedication: "Take Medication",
  medicationLogged: "Medication logged",
  simulateNoLiquid: "Simulate: No Liquid",
  acknowledgeAlert: "Acknowledge alert",
  liquidAlertTitle: "Liquid sensor: dispenser empty",
  liquidAlertDesc: (t) => `Logged at ${t}`,
  lastMedication: "Last medication",
  lastLiquidEmpty: "Last liquid empty",
  notYetTaken: "Not yet taken",
  noIncidents: "No incidents",
  autoMode: "Auto Mode",
  manualMode: "Manual Mode",
  autoModeHint: "Streaming vitals over Wi-Fi",
  manualModeHint: "Enter vitals manually",
  manual: "Manual",
  auto: "Auto",
  bpmSpo2: "BPM & SpO₂",
  heartRate: "Heart rate",
  oxygenSat: "Oxygen sat.",
  bloodPressure: "Blood Pressure",
  systolic: "Systolic",
  diastolic: "Diastolic",
  cabinEnv: "Environment",
  airTemp: "Air temp",
  humidity: "Humidity",
  saveVitals: "Save vitals",
  vitalsSaved: "Vitals saved",
  refresh: "Refresh",
  getNewData: "Get new data",
  measureBpNow: "Measure BP via Bluetooth",
  bpRequestSent: "Cabin will switch to Bluetooth and measure BP",
  callNurseDevice: (d) => `Please call the nurse — cabin ${d}`,
  cabinDeviceLabel: "Cabin",
  lastUpdated: (t) => `Last updated ${t}`,
  logCheckupNow: "Log checkup now",
  checkupAdded: "Checkup added to history",
  prescriptions: "Prescriptions",
  prescriptionsHint: "Medications and precise dosages",
  prescriptionsPlaceholder: "e.g. Lisinopril 10mg — once daily at 8am",
  nurseNotes: "Nurse Notes",
  nurseNotesHint: "Ongoing observations",
  nurseNotesPlaceholder: "Observations, patient behavior, follow-ups…",

  checkupHistory: "Checkup history",
  checkupHistoryHint: "Highlighted days indicate a logged checkup.",
  day: "Day",
  month: "Month",
  year: "Year",
  selectDate: "Select a date",
  tapHint: "Tap a day, month, or year to view the log.",
  noCheckupsRange: "No checkups in this range.",
  checkupsFor: (l) => `Checkups · ${l}`,
  weekdaysShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  noCabin: "No cabin",

  installApp: "Install app",
  adminPanel: "Admin Panel",
  adminSubtitle: "Manage nurse accounts",
  nursesList: "Nurses",
  addNurse: "Add nurse",
  editNurse: "Edit nurse",
  deleteNurse: "Delete",
  confirmDelete: "Delete this nurse?",
  photo: "Photo",
  birthDate: "Date of birth",
  email: "Email",
  phone: "Phone",
  login: "Login",
  save: "Save",
  noNurses: "No nurses yet. Add one to grant access.",
  nurseAdded: "Nurse added",
  nurseUpdated: "Nurse updated",
  nurseDeleted: "Nurse deleted",
  loginTaken: "This login is already used",
  requiredFields: "Please fill all required fields",
  uploadPhoto: "Upload photo",
  adminHint: "Admin credentials: admin / admin123",

  cabinControls: "Cabin controls",
  cabinControlsHint: "Antiseptic and heater configuration for the assigned cabin",
  antisepticDuration: "Antiseptic duration",
  antisepticDurationHint: "How long the antiseptic pump runs when triggered",
  heaterOn: "Heater ON below",
  heaterOff: "Heater OFF above",
  heaterHint: "Heater turns on and off based on cabin air temperature",
  startAntiseptic: "Start antiseptic now",
  antisepticStarted: "Antiseptic command sent",
  saveSettings: "Save settings",
  settingsSaved: "Settings saved",
  seconds: "sec",
  antisepticEvents: "Antiseptic runs",
  antisepticEventAt: (t, s) => `${t} — ${s}s`,
};

const ru: Dict = {
  appName: "AI Nurse",
  tagline: "Портал медперсонала",
  chooseLanguage: "Выберите язык",
  chooseLanguageHint: "Интерфейс будет использовать выбранный язык.",
  continue: "Продолжить",
  signIn: "Войти",
  signInSubtitle: "Доступ к панели управления пациентами.",
  username: "Имя пользователя",
  password: "Пароль",
  usernamePlaceholder: "nurse.jane",
  demoHint: "Демо: подойдут любые непустые данные.",
  welcome: (u) => `Добро пожаловать, ${u}`,
  enterCreds: "Введите имя пользователя и пароль",
  signOut: "Выйти",
  nurse: "Медсестра",
  changeLanguage: "Сменить язык",

  patientManagement: "Управление пациентами",
  registeredCount: (a, b) => `${a} зарегистрировано · ${b} закреплено за кабиной`,
  addPatient: "Добавить пациента",
  registerPatient: "Регистрация нового пациента",
  fullName: "Полное имя",
  age: "Возраст",
  gender: "Пол",
  male: "Мужской",
  female: "Женский",
  other: "Другое",
  condition: "Диагноз",
  assignCabin: "Назначить кабину (необязательно)",
  noDevice: "— Без устройства —",
  cancel: "Отмена",
  add: "Добавить",
  searchPatients: "Поиск пациентов…",
  noPatients: "Пациенты не найдены.",
  nameAgeRequired: "Имя и возраст обязательны",
  patientAdded: "Пациент добавлен",
  online: "Онлайн",
  offline: "Оффлайн",
  cabinDevice: "Устройство кабины",
  openProfile: "Открыть профиль",
  cabinUnlinked: "Кабина отключена",
  connectedTo: (d) => `Подключено к ${d}`,

  backToDashboard: "К списку пациентов",
  patientNotFound: "Пациент не найден.",
  takeMedication: "Приём лекарства",
  medicationLogged: "Приём зафиксирован",
  simulateNoLiquid: "Симулировать: нет жидкости",
  acknowledgeAlert: "Подтвердить тревогу",
  liquidAlertTitle: "Датчик жидкости: диспенсер пуст",
  liquidAlertDesc: (t) => `Зафиксировано в ${t}`,
  lastMedication: "Последний приём",
  lastLiquidEmpty: "Последний раз без жидкости",
  notYetTaken: "Ещё не принято",
  noIncidents: "Нет инцидентов",
  autoMode: "Авто режим",
  manualMode: "Ручной режим",
  autoModeHint: "Показатели передаются по Wi-Fi",
  manualModeHint: "Введите показатели вручную",
  manual: "Ручной",
  auto: "Авто",
  bpmSpo2: "Пульс и SpO₂",
  heartRate: "Пульс",
  oxygenSat: "Сатурация",
  bloodPressure: "Артериальное давление",
  systolic: "Систолическое",
  diastolic: "Диастолическое",
  cabinEnv: "Окружение",
  airTemp: "Температура",
  humidity: "Влажность",
  saveVitals: "Сохранить",
  vitalsSaved: "Показатели сохранены",
  refresh: "Обновить",
  getNewData: "Получить новые данные",
  measureBpNow: "Измерить давление по Bluetooth",
  bpRequestSent: "Кабина переключится на Bluetooth и измерит давление",
  callNurseDevice: (d) => `Позовите медсестру — кабина ${d}`,
  cabinDeviceLabel: "Кабина",
  lastUpdated: (t) => `Обновлено ${t}`,
  logCheckupNow: "Записать осмотр",
  checkupAdded: "Осмотр добавлен в историю",
  prescriptions: "Назначения",
  prescriptionsHint: "Лекарства и точные дозировки",
  prescriptionsPlaceholder: "напр. Лизиноприл 10мг — 1 раз в день в 8:00",
  nurseNotes: "Заметки медсестры",
  nurseNotesHint: "Текущие наблюдения",
  nurseNotesPlaceholder: "Наблюдения, поведение пациента, назначения…",

  checkupHistory: "История осмотров",
  checkupHistoryHint: "Отмеченные дни — дни с осмотром.",
  day: "День",
  month: "Месяц",
  year: "Год",
  selectDate: "Выберите дату",
  tapHint: "Нажмите на день, месяц или год, чтобы увидеть журнал.",
  noCheckupsRange: "В этом периоде осмотров нет.",
  checkupsFor: (l) => `Осмотры · ${l}`,
  weekdaysShort: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  noCabin: "Без кабины",

  installApp: "Установить приложение",
  adminPanel: "Панель администратора",
  adminSubtitle: "Управление учётными записями медсестёр",
  nursesList: "Медсёстры",
  addNurse: "Добавить медсестру",
  editNurse: "Редактировать",
  deleteNurse: "Удалить",
  confirmDelete: "Удалить эту медсестру?",
  photo: "Фото",
  birthDate: "Дата рождения",
  email: "Эл. почта",
  phone: "Телефон",
  login: "Логин",
  save: "Сохранить",
  noNurses: "Пока нет медсестёр. Добавьте, чтобы разрешить вход.",
  nurseAdded: "Медсестра добавлена",
  nurseUpdated: "Данные обновлены",
  nurseDeleted: "Медсестра удалена",
  loginTaken: "Этот логин уже используется",
  requiredFields: "Заполните все обязательные поля",
  uploadPhoto: "Загрузить фото",
  adminHint: "Учётка администратора: admin / admin123",

  cabinControls: "Управление кабиной",
  cabinControlsHint: "Настройки антисептика и подогрева для назначенной кабины",
  antisepticDuration: "Длительность антисептика",
  antisepticDurationHint: "Сколько работает насос при запуске",
  heaterOn: "Подогрев ВКЛ ниже",
  heaterOff: "Подогрев ВЫКЛ выше",
  heaterHint: "Подогрев включается по температуре воздуха в кабине",
  startAntiseptic: "Запустить антисептик",
  antisepticStarted: "Команда антисептика отправлена",
  saveSettings: "Сохранить настройки",
  settingsSaved: "Настройки сохранены",
  seconds: "сек",
  antisepticEvents: "Запуски антисептика",
  antisepticEventAt: (t, s) => `${t} — ${s} сек`,
};

const uz: Dict = {
  appName: "AI Nurse",
  tagline: "Tibbiyot xodimlari portali",
  chooseLanguage: "Tilni tanlang",
  chooseLanguageHint: "Interfeys tanlangan tilda ishlaydi.",
  continue: "Davom etish",
  signIn: "Kirish",
  signInSubtitle: "Bemorlarni boshqarish paneliga kirish.",
  username: "Foydalanuvchi nomi",
  password: "Parol",
  usernamePlaceholder: "hamshira.jane",
  demoHint: "Demo: bo‘sh bo‘lmagan har qanday ma’lumot mos keladi.",
  welcome: (u) => `Xush kelibsiz, ${u}`,
  enterCreds: "Foydalanuvchi nomi va parolni kiriting",
  signOut: "Chiqish",
  nurse: "Hamshira",
  changeLanguage: "Tilni o‘zgartirish",

  patientManagement: "Bemorlarni boshqarish",
  registeredCount: (a, b) => `${a} ro‘yxatda · ${b} kabinaga biriktirilgan`,
  addPatient: "Bemor qo‘shish",
  registerPatient: "Yangi bemorni ro‘yxatga olish",
  fullName: "To‘liq ism",
  age: "Yosh",
  gender: "Jinsi",
  male: "Erkak",
  female: "Ayol",
  other: "Boshqa",
  condition: "Tashxis",
  assignCabin: "Kabinaga biriktirish (ixtiyoriy)",
  noDevice: "— Qurilma yo‘q —",
  cancel: "Bekor qilish",
  add: "Qo‘shish",
  searchPatients: "Bemorlarni qidirish…",
  noPatients: "Bemorlar topilmadi.",
  nameAgeRequired: "Ism va yosh majburiy",
  patientAdded: "Bemor qo‘shildi",
  online: "Onlayn",
  offline: "Oflayn",
  cabinDevice: "Kabina qurilmasi",
  openProfile: "Profilni ochish",
  cabinUnlinked: "Kabina uzildi",
  connectedTo: (d) => `${d} ga ulandi`,

  backToDashboard: "Bemorlar ro‘yxatiga",
  patientNotFound: "Bemor topilmadi.",
  takeMedication: "Dori qabul qilish",
  medicationLogged: "Dori qabuli qayd etildi",
  simulateNoLiquid: "Simulyatsiya: suyuqlik yo‘q",
  acknowledgeAlert: "Ogohlantirishni tasdiqlash",
  liquidAlertTitle: "Suyuqlik sensori: dispenser bo‘sh",
  liquidAlertDesc: (t) => `${t} da qayd etildi`,
  lastMedication: "Oxirgi dori qabuli",
  lastLiquidEmpty: "Oxirgi bo‘shash",
  notYetTaken: "Hali qabul qilinmagan",
  noIncidents: "Hodisalar yo‘q",
  autoMode: "Avto rejim",
  manualMode: "Qo‘lda rejim",
  autoModeHint: "Ko‘rsatkichlar Wi-Fi orqali uzatiladi",
  manualModeHint: "Ko‘rsatkichlarni qo‘lda kiriting",
  manual: "Qo‘lda",
  auto: "Avto",
  bpmSpo2: "Puls va SpO₂",
  heartRate: "Yurak urishi",
  oxygenSat: "Kislorod darajasi",
  bloodPressure: "Qon bosimi",
  systolic: "Sistolik",
  diastolic: "Diastolik",
  cabinEnv: "Muhit",
  airTemp: "Harorat",
  humidity: "Namlik",
  saveVitals: "Saqlash",
  vitalsSaved: "Ko‘rsatkichlar saqlandi",
  refresh: "Yangilash",
  getNewData: "Yangi ma’lumot olish",
  measureBpNow: "Bluetooth orqali qon bosimini o‘lchash",
  bpRequestSent: "Kabina Bluetooth’ga o‘tib qon bosimini o‘lchaydi",
  callNurseDevice: (d) => `Hamshirani chaqiring — kabina ${d}`,
  cabinDeviceLabel: "Kabina",
  lastUpdated: (t) => `Yangilangan ${t}`,
  logCheckupNow: "Ko‘rikni qayd etish",
  checkupAdded: "Ko‘rik tarixga qo‘shildi",
  prescriptions: "Retseptlar",
  prescriptionsHint: "Dorilar va aniq dozalar",
  prescriptionsPlaceholder: "masalan: Lizinopril 10mg — kuniga 1 marta 8:00 da",
  nurseNotes: "Hamshira izohlari",
  nurseNotesHint: "Kuzatuvlar",
  nurseNotesPlaceholder: "Kuzatuvlar, bemor holati, tavsiyalar…",

  checkupHistory: "Ko‘riklar tarixi",
  checkupHistoryHint: "Belgilangan kunlar — ko‘rik bo‘lgan kunlar.",
  day: "Kun",
  month: "Oy",
  year: "Yil",
  selectDate: "Sanani tanlang",
  tapHint: "Jurnal uchun kun, oy yoki yilni tanlang.",
  noCheckupsRange: "Bu davrda ko‘riklar yo‘q.",
  checkupsFor: (l) => `Ko‘riklar · ${l}`,
  weekdaysShort: ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"],
  noCabin: "Kabinasiz",

  installApp: "Ilovani o‘rnatish",
  adminPanel: "Admin paneli",
  adminSubtitle: "Hamshiralar hisoblarini boshqarish",
  nursesList: "Hamshiralar",
  addNurse: "Hamshira qo‘shish",
  editNurse: "Tahrirlash",
  deleteNurse: "O‘chirish",
  confirmDelete: "Ushbu hamshira o‘chirilsinmi?",
  photo: "Rasm",
  birthDate: "Tug‘ilgan sana",
  email: "Email",
  phone: "Telefon raqami",
  login: "Login",
  save: "Saqlash",
  noNurses: "Hozircha hamshiralar yo‘q. Kirish uchun qo‘shing.",
  nurseAdded: "Hamshira qo‘shildi",
  nurseUpdated: "Ma’lumotlar yangilandi",
  nurseDeleted: "Hamshira o‘chirildi",
  loginTaken: "Bu login allaqachon ishlatilmoqda",
  requiredFields: "Barcha majburiy maydonlarni to‘ldiring",
  uploadPhoto: "Rasm yuklash",
  adminHint: "Admin: admin / admin123",

  cabinControls: "Kabina boshqaruvi",
  cabinControlsHint: "Biriktirilgan kabina uchun antiseptik va isitgich sozlamalari",
  antisepticDuration: "Antiseptik davomiyligi",
  antisepticDurationHint: "Ishga tushirilganda nasos qancha ishlaydi",
  heaterOn: "Isitgich YOQILADI (past)",
  heaterOff: "Isitgich O‘CHADI (yuqori)",
  heaterHint: "Isitgich kabina havo haroratiga qarab ishlaydi",
  startAntiseptic: "Antiseptikni ishga tushirish",
  antisepticStarted: "Antiseptik buyrug‘i yuborildi",
  saveSettings: "Sozlamalarni saqlash",
  settingsSaved: "Sozlamalar saqlandi",
  seconds: "s",
  antisepticEvents: "Antiseptik ishga tushishlari",
  antisepticEventAt: (t, s) => `${t} — ${s} s`,
};

export const dicts: Record<Lang, Dict> = { uz, ru, en };

export const LANGUAGES: { code: Lang; label: string; native: string; flag: string }[] = [
  { code: "uz", label: "Uzbek", native: "O‘zbekcha", flag: "🇺🇿" },
  { code: "ru", label: "Russian", native: "Русский", flag: "🇷🇺" },
  { code: "en", label: "English", native: "English", flag: "🇬🇧" },
];

export type LangCtx = {
  lang: Lang | null;
  t: Dict;
  setLang: (l: Lang) => void;
};

export const LanguageContext = createContext<LangCtx | null>(null);
export const useLang = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("LanguageContext missing");
  return ctx;
};
