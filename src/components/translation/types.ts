import type { Locale } from "@/components/internationalization/config";
export type Lang = Locale;

// Shape of the Google Translate v2 success response.
export interface TranslateResponse {
  data: {
    translations: Array<{
      translatedText: string;
      detectedSourceLanguage?: string;
    }>;
  };
}
