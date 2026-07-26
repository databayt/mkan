// Shared date-picker strings. Lives outside big-search-date-picker.tsx so
// big-search.tsx can read them for its segment labels without a static
// import edge into the picker module — the picker (react-day-picker +
// date-fns locales) is dynamic-imported and must stay out of the initial
// header bundle on /listings, /listings/[id] and /search.
export const pickerTranslations = {
  en: {
    dates: "Dates",
    flexible: "Flexible",
    exactDates: "Exact dates",
    plusMinus1Day: "± 1 day",
    plusMinus2Days: "± 2 days",
    plusMinus3Days: "± 3 days",
    plusMinus7Days: "± 7 days",
    plusMinus14Days: "± 14 days",
    howLongStay: "How long would you like to stay?",
    weekend: "Weekend",
    week: "Week",
    month: "Month",
    goAnytime: "Go anytime",
    goIn: "Go in",
    whenGo: "When do you want to go?",
    monthsName: {
      "0": "January", "1": "February", "2": "March", "3": "April", "4": "May", "5": "June",
      "6": "July", "7": "August", "8": "September", "9": "October", "10": "November", "11": "December"
    }
  },
  ar: {
    dates: "التواريخ",
    flexible: "مرن",
    exactDates: "التواريخ المحددة",
    plusMinus1Day: "± يوم واحد",
    plusMinus2Days: "± يومين",
    plusMinus3Days: "± 3 أيام",
    plusMinus7Days: "± 7 أيام",
    plusMinus14Days: "± 14 يوماً",
    howLongStay: "ما هي مدة إقامتك؟",
    weekend: "عطلة نهاية الأسبوع",
    week: "أسبوع",
    month: "شهر",
    goAnytime: "اذهب في أي وقت",
    goIn: "اذهب في",
    whenGo: "متى تريد الذهاب؟",
    monthsName: {
      "0": "يناير", "1": "فبراير", "2": "مارس", "3": "أبريل", "4": "مايو", "5": "يونيو",
      "6": "يوليو", "7": "أغسطس", "8": "سبتمبر", "9": "أكتوبر", "10": "نوفمبر", "11": "ديسمبر"
    }
  }
} as const;
